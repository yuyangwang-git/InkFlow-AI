// ==UserScript==
// @name         复制AI网页公式（Word/LaTeX）
// @namespace    https://github.com/yuyangwang-git/InkFlow-AI
// @version      1.0.0
// @license      GPL-3.0-or-later
// @description  双击复制网页公式，支持 Word 公式(MathML)/LaTeX 切换，适配 ChatGPT、Gemini、DeepSeek 等站点。
// @author       Yuyang Wang
// @match        *://*.chatgpt.com/*
// @match        *://*.gemini.google.com/*
// @match        *://*.deepseek.com/*
// @match        *://*.wikipedia.org/*
// @match        *://*.zhihu.com/*
// @match        *://*.stackexchange.com/*
// @require      https://cdn.jsdelivr.net/npm/katex@0.16.11/dist/katex.min.js
// @supportURL   https://github.com/yuyangwang-git/InkFlow-AI/issues
// @homepageURL  https://github.com/yuyangwang-git/InkFlow-AI
// @updateURL    https://raw.githubusercontent.com/yuyangwang-git/InkFlow-AI/main/main.user.js
// @downloadURL  https://raw.githubusercontent.com/yuyangwang-git/InkFlow-AI/main/main.user.js
// ==/UserScript==

(function () {
  'use strict';

  window.__latexCopyMode = 'mathml';

  // 1. 样式表优化
  const styleSheet = document.createElement("style");
  styleSheet.innerText = `
    .latex-tooltip {
      position: fixed;
      background-color: rgba(0, 0, 0, 0.75);
      color: #fff;
      padding: 4px 8px;
      border-radius: 4px;
      font-size: 12px;
      z-index: 99999;
      opacity: 0;
      transition: opacity 0.2s;
      pointer-events: none;
    }
    /* 优化后的成功提示：右下角，轻量级 */
    .latex-copy-success {
      position: fixed;
      bottom: 70px; /* 位于切换按钮上方 */
      right: 25px;
      background-color: #323232;
      color: #fff;
      padding: 8px 16px;
      border-radius: 8px;
      font-size: 13px;
      z-index: 100000;
      opacity: 0;
      transform: translateY(10px);
      transition: all 0.3s cubic-bezier(0.18, 0.89, 0.32, 1.28);
      pointer-events: none;
      box-shadow: 0 4px 12px rgba(0,0,0,0.15);
      display: flex;
      align-items: center;
    }
    .latex-copy-success.show {
      opacity: 1;
      transform: translateY(0);
    }
    .latex-copy-toggle {
      position: fixed;
      bottom: 20px;
      right: 20px;
      z-index: 99999;
      background-color: #1a73e8;
      color: #fff;
      padding: 8px 14px;
      border-radius: 20px;
      font-size: 12px;
      font-weight: bold;
      cursor: pointer;
      user-select: none;
      box-shadow: 0 2px 5px rgba(0,0,0,0.2);
    }
  `;
  // UI elements are appended after DOM is ready (safer across different @run-at timings)
  const tooltip = document.createElement('div');
  tooltip.classList.add('latex-tooltip');

  let uiInited = false;
  function initUI() {
    if (uiInited) return;
    if (!document.head || !document.body) return;
    uiInited = true;
    document.head.appendChild(styleSheet);
    document.body.appendChild(tooltip);
  }

  let toggleInited = false;
  function initToggleButton() {
    if (toggleInited) return;
    if (!document.body) return;
    toggleInited = true;
    const btn = document.createElement('div');
    btn.className = 'latex-copy-toggle';
    const updateText = () => {
      btn.textContent = window.__latexCopyMode === 'mathml' ? '📋 Word 公式' : '📋 LaTeX 源码';
    };
    btn.addEventListener('click', () => {
      window.__latexCopyMode = (window.__latexCopyMode === 'mathml') ? 'latex' : 'mathml';
      updateText();
    });
    updateText();
    document.body.appendChild(btn);
  }

  function copyToClip(text, mode) {
    navigator.clipboard.writeText(text).then(() => {
      showCopySuccessTooltip(mode);
    }).catch(err => console.error('复制失败:', err));
  }

  // 2. 逻辑优化：右下角淡入淡出，且防止重叠
  function showCopySuccessTooltip(mode) {
    const oldToast = document.querySelector('.latex-copy-success');
    if (oldToast) oldToast.remove();

    const copyTooltip = document.createElement("div");
    copyTooltip.className = "latex-copy-success";
    copyTooltip.innerText = mode === 'latex' ? "✅ 已复制 LaTeX" : "✅ 已复制 Word 公式";
    document.body.appendChild(copyTooltip);

    // 触发动画
    setTimeout(() => copyTooltip.classList.add('show'), 10);

    // 1.5秒后消失
    setTimeout(() => {
      copyTooltip.classList.remove('show');
      setTimeout(() => { if (copyTooltip.parentNode) copyTooltip.remove(); }, 300);
    }, 1500);
  }

  // --- 原有核心逻辑保持不变 ---
  function getKaTeXLatex(el) {
    const dataMath = el.getAttribute('data-math') || el.closest?.('[data-math]')?.getAttribute('data-math');
    if (dataMath) return dataMath;
    const ann = el.querySelectorAll?.('annotation[encoding="application/x-tex"], annotation') || [];
    const texts = Array.from(ann).map(a => (a.textContent || '').trim()).filter(Boolean);
    if (!texts.length) return el.getAttribute?.('data-tex') || el.getAttribute?.('aria-label') || el.getAttribute?.('title') || null;
    const uniq = Array.from(new Set(texts));
    if (uniq.length === 1) return uniq[0];
    const norm = s => s.replace(/\s+/g, '');
    const sorted = uniq.slice().sort((a, b) => norm(b).length - norm(a).length);
    const longest = sorted[0];
    if (sorted.slice(1).every(s => norm(longest).includes(norm(s)))) return longest;
    return uniq.join('');
  }

  const sharedKaTeXTarget = { elementSelector: 'span.katex', getLatex: el => getKaTeXLatex(el) };
  const targets = {
    'wikipedia.org': { elementSelector: 'span.mwe-math-element', getLatex: el => el.querySelector('math')?.getAttribute('alttext') },
    'zhihu.com': { elementSelector: 'span.ztext-math', getLatex: el => el.getAttribute('data-tex') },
    'stackexchange.com': { elementSelector: 'span.math-container', getLatex: el => el.querySelector('script')?.textContent }
  };
  ['chatgpt.com', 'gemini.google.com', 'deepseek.com'].forEach(domain => { targets[domain] = sharedKaTeXTarget; });
  const targetEntries = Object.entries(targets);

  function getTarget(url) {
    return targetEntries.find(([key]) => url.includes(key))?.[1] || null;
  }

  function extractExistingMathML(el) {
    if (!el) return null;
    // 1) KaTeX embeds MathML in .katex-mathml
    let math = el.querySelector?.('span.katex-mathml > math');
    if (math) return math.outerHTML;

    // 2) Wikipedia/MathML <math> directly
    math = el.querySelector?.('math');
    if (math) return math.outerHTML;

    // 3) MathJax v3 assistive MathML
    math = el.querySelector?.('mjx-assistive-mml math');
    if (math) return math.outerHTML;

    // 4) MathJax v2 assistive MathML
    math = el.querySelector?.('span.MJX_Assistive_MathML math');
    if (math) return math.outerHTML;

    return null;
  }

  const MATHML_NS = 'http://www.w3.org/1998/Math/MathML';

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

  // KaTeX/HTML may emit named entities (e.g. &nbsp;) that are invalid in XML MathML.
  // Convert them to numeric references so DOMParser(application/xml) and Word can parse them.
  function makeMathMLXmlSafe(mml) {
    if (!mml || typeof mml !== 'string') return mml;
    return mml
      .replace(/&nbsp;/gi, '&#160;')
      .replace(/&ensp;/gi, '&#8194;')
      .replace(/&emsp;/gi, '&#8195;')
      .replace(/&thinsp;/gi, '&#8201;')
      .replace(/&hairsp;/gi, '&#8202;')
      .replace(/&NoBreak;/g, '&#8288;');
  }

  // Normalize equation tags for Word:
  // 1) turn <mtext>(20)</mtext> into math tokens and render tag as #(20) for Word.
  // 2) flatten KaTeX tag layout table to remove non-removable spacer cells in Word.
  function normalizeMathMLForWord(mml) {
    const xmlSafeMml = makeMathMLXmlSafe(mml);
    if (!xmlSafeMml || (!xmlSafeMml.includes('<mtext>') && !xmlSafeMml.includes('<mtable'))) return xmlSafeMml;
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

      // KaTeX display tags often use:
      // <mtable width="100%"><mtr><mtd width="50%"/><mtd>eq</mtd><mtd width="50%"/><mtd>tag</mtd></mtr></mtable>
      // Flatten to inline mrow to avoid huge invisible gaps in Word after deleting the tag.
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
    const mml = normalizeMathMLForWord(rawMathML);
    if (mml && el?.dataset && mml !== el.dataset.mathml) el.dataset.mathml = mml;
    return mml;
  }

  function resolveMathMLFromElement(el) {
    if (!el) return null;
    const rawMathML = el.dataset?.mathml || extractExistingMathML(el);
    return normalizeAndCacheMathML(el, rawMathML);
  }

  // Trusted Types-safe conversion: use KaTeX renderToString and slice out <math> directly.
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

  function ensureMathMLOnDemand(el, latexString) {
    const existing = resolveMathMLFromElement(el);
    if (existing) return existing;
    if (!latexString) throw new Error('No LaTeX to convert');
    const mml = convertLatexToMathMLWithKaTeX(latexString);
    if (!mml) throw new Error('KaTeX MathML conversion unavailable');
    return normalizeAndCacheMathML(el, mml);
  }

  function bindOne(element, latexString) {
    // Bind metadata only; event listeners are delegated at document level (lighter).
    if (element.dataset.latexCopyBound === '1') return;
    element.dataset.latexCopyBound = '1';
    if (!latexString) return;
    element.dataset.latex = latexString;
    resolveMathMLFromElement(element);
  }

  // --- Delegated interactions (one-time listeners) ---
  let currentHoverEl = null;

  function hideHoverTooltip() {
    if (!uiInited) return;
    tooltip.style.opacity = '0';
  }

  function showHoverTooltipFor(el) {
    initUI();
    if (!uiInited) return;
    const latexString = el?.dataset?.latex;
    if (!latexString) return;

    tooltip.textContent = latexString;

    const rect = el.getBoundingClientRect();
    let left = rect.left;
    let top = rect.top - 30;

    // Basic viewport clamping to avoid going off-screen.
    const padding = 6;
    // Temporarily show to measure width/height
    tooltip.style.opacity = '0';
    tooltip.style.left = '0px';
    tooltip.style.top = '0px';

    // Force layout to get size
    const ttRect = tooltip.getBoundingClientRect();
    const ttW = ttRect.width || 0;
    const ttH = ttRect.height || 0;

    if (top < padding) top = rect.bottom + padding;
    if (left + ttW > window.innerWidth - padding) left = Math.max(padding, window.innerWidth - ttW - padding);
    if (left < padding) left = padding;
    if (top + ttH > window.innerHeight - padding) top = Math.max(padding, window.innerHeight - ttH - padding);

    tooltip.style.left = `${left}px`;
    tooltip.style.top = `${top}px`;
    tooltip.style.opacity = '1';
  }

  document.addEventListener('pointerover', (e) => {
    const el = e.target?.closest?.('[data-latex-copy-bound="1"]');
    if (!el || el === currentHoverEl) return;
    currentHoverEl = el;
    showHoverTooltipFor(el);
  }, true);

  document.addEventListener('pointerout', (e) => {
    const el = e.target?.closest?.('[data-latex-copy-bound="1"]');
    if (!el || el !== currentHoverEl) return;
    const to = e.relatedTarget;
    if (to && el.contains(to)) return; // still inside
    currentHoverEl = null;
    hideHoverTooltip();
  }, true);

  document.addEventListener('dblclick', (e) => {
    const el = e.target?.closest?.('[data-latex-copy-bound="1"]');
    if (!el) return;

    e.preventDefault();
    e.stopPropagation();
    if (typeof e.stopImmediatePropagation === 'function') e.stopImmediatePropagation();

    initUI();
    initToggleButton();

    const latexString = el.dataset.latex;
    if (!latexString) return;

    const mode = window.__latexCopyMode || 'mathml';
    if (mode === 'latex') copyToClip(latexString, 'latex');
    else {
      try {
        const mml = ensureMathMLOnDemand(el, latexString);
        copyToClip(mml, 'mathml');
      } catch (err) {
        console.warn('[latex-copy] MathML conversion failed, fallback to LaTeX:', err);
        // Fallback: copy LaTeX if MathML conversion is unavailable (e.g., blocked by CSP).
        copyToClip(latexString, 'latex');
      }
    }
    try { window.getSelection()?.removeAllRanges(); } catch (_) { }
  }, true);
  function scanRoot(root) {
    initUI();
    if (!uiInited) return;
    initToggleButton();

    const target = currentTarget;
    if (!target) return;

    // If the root itself is a formula node, bind it too.
    if (root && root.nodeType === 1 && root.matches?.(target.elementSelector)) {
      const latexString = target.getLatex(root);
      if (latexString) bindOne(root, latexString);
    }

    // Scan only within the given subtree (incremental), not the whole document every time.
    if (root && typeof root.querySelectorAll === 'function') {
      root.querySelectorAll(target.elementSelector).forEach(element => {
        const latexString = target.getLatex(element);
        if (latexString) bindOne(element, latexString);
      });
    }
  }

  // rAF-batched incremental scanning for dynamic/SPA pages (ChatGPT/Gemini etc.)
  const pendingRoots = new Set();
  let scheduled = false;
  let lastHref = window.location.href;
  let currentTarget = getTarget(lastHref);

  function scheduleScan(node) {
    if (!node) return;
    if (node.nodeType === 1 || node.nodeType === 9 || node.nodeType === 11) pendingRoots.add(node);
    if (scheduled) return;
    scheduled = true;

    requestAnimationFrame(() => {
      scheduled = false;

      // If SPA navigation changed URL, force a one-time full scan.
      if (window.location.href !== lastHref) {
        lastHref = window.location.href;
        currentTarget = getTarget(lastHref);
        pendingRoots.add(document);
      }

      for (const n of pendingRoots) scanRoot(n);
      pendingRoots.clear();
    });
  }

  function getNodeDepth(node) {
    let depth = 0;
    let current = node;
    while (current && current.parentNode) {
      depth++;
      current = current.parentNode;
    }
    return depth;
  }

  function getCopyTextFromNode(node, mode) {
    const latex = node.dataset?.latex || node.getAttribute?.('data-math') || getKaTeXLatex(node);
    if (mode === 'latex') return latex ? `$${latex}$` : node.textContent;
    const mathml = resolveMathMLFromElement(node);
    return mathml || latex || node.textContent;
  }

  function handleCopy(e) {
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed || sel.rangeCount === 0) return;
    const mode = window.__latexCopyMode || 'mathml';
    const container = document.createElement('div');
    let changed = false;
    for (let i = 0; i < sel.rangeCount; i++) {
      const fragment = sel.getRangeAt(i).cloneContents();
      const nodes = Array.from(fragment.querySelectorAll('[data-latex], span.katex'));
      if (nodes.length) {
        changed = true;
        nodes.sort((a, b) => getNodeDepth(b) - getNodeDepth(a)).forEach(node => {
          const text = getCopyTextFromNode(node, mode);
          if (node.parentNode) node.parentNode.replaceChild(document.createTextNode(text), node);
        });
      }
      container.appendChild(fragment);
    }
    if (changed) {
      e.preventDefault();
      e.stopImmediatePropagation();
      e.clipboardData.setData('text/plain', container.textContent.trim());
    }
  }


  new MutationObserver(mutations => {
    for (const m of mutations) {
      for (const n of m.addedNodes) {
        if (n && (n.nodeType === 1 || n.nodeType === 11)) scheduleScan(n);
      }
    }
  }).observe(document.documentElement, { childList: true, subtree: true });

  document.addEventListener('DOMContentLoaded', () => {
    initUI();
    scanRoot(document);
  });
  document.addEventListener('copy', handleCopy, true);
})();
