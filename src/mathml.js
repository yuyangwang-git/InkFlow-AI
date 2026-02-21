const MATHML_NS = 'http://www.w3.org/1998/Math/MathML';
const MAX_LATEX_CACHE_SIZE = 512;

function setLimitedCache(map, key, value, maxSize = MAX_LATEX_CACHE_SIZE) {
  if (map.has(key)) map.delete(key);
  map.set(key, value);
  if (map.size <= maxSize) return;
  const firstKey = map.keys().next().value;
  map.delete(firstKey);
}

function hasMathMLAncestor(node, localName) {
  let current = node;
  while (current) {
    if (current.nodeType === 1 && current.localName === localName) return true;
    current = current.parentNode;
  }
  return false;
}

function appendMathTokens(doc, parent, text) {
  let i = 0;
  const make = (name, value) => {
    const n = doc.createElementNS(MATHML_NS, name);
    n.textContent = value;
    return n;
  };

  while (i < text.length) {
    const ch = text[i];
    if (/\s/.test(ch)) {
      i++;
      continue;
    }
    if (/[0-9]/.test(ch)) {
      let j = i + 1;
      while (j < text.length && /[0-9]/.test(text[j])) j++;
      parent.appendChild(make('mn', text.slice(i, j)));
      i = j;
      continue;
    }
    if (/[A-Za-z\u00C0-\u024F\u0370-\u03FF]/.test(ch)) {
      let j = i + 1;
      while (j < text.length && /[A-Za-z\u00C0-\u024F\u0370-\u03FF]/.test(text[j])) j++;
      parent.appendChild(make('mi', text.slice(i, j)));
      i = j;
      continue;
    }
    parent.appendChild(make('mo', ch));
    i++;
  }
}

function isMathOnlyWhitespace(text) {
  return !String(text || '').replace(/[\s\u00A0\u1680\u2000-\u200A\u202F\u205F\u3000]/g, '');
}

function isEmptyMathCell(node) {
  if (!node) return true;
  if (node.children && node.children.length > 0) return false;
  return isMathOnlyWhitespace(node.textContent);
}

function makeMathMLXmlSafe(mml) {
  if (!mml || typeof mml !== 'string') return mml;
  if (!mml.includes('&')) return mml;
  return mml
    .replace(/&nbsp;/gi, '&#160;')
    .replace(/&ensp;/gi, '&#8194;')
    .replace(/&emsp;/gi, '&#8195;')
    .replace(/&thinsp;/gi, '&#8201;')
    .replace(/&hairsp;/gi, '&#8202;')
    .replace(/&NoBreak;/g, '&#8288;');
}

function getReadyKaTeX() {
  let ktx = null;
  if (window.katex && typeof window.katex === 'object') ktx = window.katex;
  if (!ktx || typeof ktx.renderToString !== 'function') return null;
  return ktx;
}

function extractMathMLFromRenderedString(rendered) {
  if (!rendered) return null;
  const start = rendered.indexOf('<math');
  if (start < 0) return null;
  const end = rendered.indexOf('</math>', start);
  if (end < 0) return null;
  return rendered.slice(start, end + '</math>'.length);
}

function convertLatexToMathMLWithKaTeX(latexString) {
  const ktx = getReadyKaTeX();
  if (!ktx || !latexString) return null;
  try {
    const rendered = ktx.renderToString(latexString, {
      output: 'mathml',
      throwOnError: false,
      strict: 'ignore',
      displayMode: true
    });
    return extractMathMLFromRenderedString(rendered);
  } catch (_) {
    return null;
  }
}

export function createMathMLTools({ extractExistingMathML }) {
  const latexToMathMLCache = new Map();

  function normalizeMathMLForWord(mml) {
    const xmlSafeMml = makeMathMLXmlSafe(mml);
    if (!xmlSafeMml) return xmlSafeMml;
    if (!xmlSafeMml.includes('<mtext>') && !xmlSafeMml.includes('<mtable')) return xmlSafeMml;
    try {
      const doc = new DOMParser().parseFromString(xmlSafeMml, 'application/xml');
      if (doc.getElementsByTagName('parsererror').length) return xmlSafeMml;

      const list = Array.from(doc.getElementsByTagName('mtext'));
      let changed = false;

      list.forEach(node => {
        const raw = (node.textContent || '').trim();
        const match = raw.match(/^\(([^()]+)\)$/);
        if (!match) return;
        if (!hasMathMLAncestor(node, 'mtd') || !hasMathMLAncestor(node, 'mtable')) return;

        const inner = match[1].trim();
        if (!inner) return;

        const mrow = doc.createElementNS(MATHML_NS, 'mrow');
        const hash = doc.createElementNS(MATHML_NS, 'mo');
        hash.textContent = '#';
        hash.setAttribute('lspace', '0em');
        hash.setAttribute('rspace', '0em');
        const left = doc.createElementNS(MATHML_NS, 'mo');
        left.textContent = '(';
        const right = doc.createElementNS(MATHML_NS, 'mo');
        right.textContent = ')';

        mrow.appendChild(hash);
        mrow.appendChild(left);
        appendMathTokens(doc, mrow, inner);
        mrow.appendChild(right);

        if (node.parentNode) {
          node.parentNode.replaceChild(mrow, node);
          changed = true;
        }
      });

      const tables = Array.from(doc.getElementsByTagName('mtable'));
      tables.forEach(table => {
        if (table.getAttribute('width') !== '100%') return;
        const rows = Array.from(table.children || []).filter(n => n.localName === 'mtr');
        if (rows.length !== 1) return;
        const cells = Array.from(rows[0].children || []).filter(n => n.localName === 'mtd');
        if (cells.length !== 4) return;

        const left = cells[0];
        const body = cells[1];
        const right = cells[2];
        const tag = cells[3];
        if (left.getAttribute('width') !== '50%' || right.getAttribute('width') !== '50%') return;
        if (!isEmptyMathCell(left) || !isEmptyMathCell(right)) return;

        const wrapper = doc.createElementNS(MATHML_NS, 'mrow');
        Array.from(body.childNodes).forEach(n => wrapper.appendChild(n.cloneNode(true)));

        if (!isEmptyMathCell(tag)) {
          if (tag.childNodes.length === 1 && tag.firstChild && tag.firstChild.nodeType === 1 && tag.firstChild.localName === 'mrow') wrapper.appendChild(tag.firstChild.cloneNode(true));
          else {
            const tagRow = doc.createElementNS(MATHML_NS, 'mrow');
            Array.from(tag.childNodes).forEach(n => tagRow.appendChild(n.cloneNode(true)));
            wrapper.appendChild(tagRow);
          }
        }

        if (table.parentNode) {
          table.parentNode.replaceChild(wrapper, table);
          changed = true;
        }
      });

      if (!changed) return xmlSafeMml;
      return new XMLSerializer().serializeToString(doc.documentElement);
    } catch (_) {
      return xmlSafeMml;
    }
  }

  function normalizeAndCacheMathML(el, rawMathML) {
    if (!rawMathML || typeof rawMathML !== 'string') return rawMathML;
    const mml = normalizeMathMLForWord(rawMathML);

    if (mml && el?.dataset) {
      if (mml !== el.dataset.mathml) el.dataset.mathml = mml;
      el.dataset.mathmlNormalized = '1';
    }
    return mml;
  }

  function resolveMathMLFromElement(el) {
    if (!el) return null;
    if (el.dataset?.mathml && el.dataset?.mathmlNormalized === '1') return el.dataset.mathml;
    const rawMathML = el.dataset?.mathml || extractExistingMathML(el);
    return normalizeAndCacheMathML(el, rawMathML);
  }

  function ensureMathMLOnDemand(el, latexString) {
    const existing = resolveMathMLFromElement(el);
    if (existing) return existing;
    if (!latexString) throw new Error('No LaTeX to convert');
    const cached = latexToMathMLCache.get(latexString);
    if (cached) return normalizeAndCacheMathML(el, cached);
    const mml = convertLatexToMathMLWithKaTeX(latexString);
    if (!mml) throw new Error('KaTeX MathML conversion unavailable');
    const normalized = normalizeMathMLForWord(mml);
    setLimitedCache(latexToMathMLCache, latexString, normalized);
    return normalizeAndCacheMathML(el, normalized);
  }

  return {
    normalizeMathMLForWord,
    resolveMathMLFromElement,
    ensureMathMLOnDemand
  };
}
