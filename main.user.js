// ==UserScript==
// @name         复制AI网页公式（Word/LaTeX）
// @namespace    https://github.com/yuyangwang-git/InkFlow-AI
// @version      1.0.1
// @license      GPL-3.0-or-later
// @description  双击复制网页公式，支持 Word 公式(MathML)/LaTeX 切换，适配 ChatGPT、Gemini、DeepSeek 等站点。
// @description:en  Double-click to copy web formulas, with Word MathML/LaTeX mode switching; supports ChatGPT, Gemini, DeepSeek, Wikipedia, Zhihu, and StackExchange.
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
  const FORMULA_SELECTOR = '[data-latex], span.katex';

  // 1) 界面样式：悬停预览、复制成功提示、模式切换按钮
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
    /* 成功提示：右下角轻量浮层 */
    .latex-copy-success {
      position: fixed;
      bottom: 70px; /* 显示在模式切换按钮上方 */
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
  // UI 元素在 DOM 可用后再挂载，兼容不同注入时机
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

  // 2) 复制成功提示：淡入淡出，并避免多条提示重叠
  function showCopySuccessTooltip(mode) {
    const oldToast = document.querySelector('.latex-copy-success');
    if (oldToast) oldToast.remove();

    const copyTooltip = document.createElement("div");
    copyTooltip.className = "latex-copy-success";
    copyTooltip.innerText = mode === 'latex' ? "✅ 已复制 LaTeX" : "✅ 已复制 Word 公式";
    document.body.appendChild(copyTooltip);

    // 触发进入动画
    setTimeout(() => copyTooltip.classList.add('show'), 10);

    // 1.5 秒后退出并移除
    setTimeout(() => {
      copyTooltip.classList.remove('show');
      setTimeout(() => { if (copyTooltip.parentNode) copyTooltip.remove(); }, 300);
    }, 1500);
  }

  // 3) 公式提取与目标站点适配
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
    // 1) KaTeX 内嵌 MathML（.katex-mathml）
    let math = el.querySelector?.('span.katex-mathml > math');
    if (math) return math.outerHTML;

    // 2) 页面直接提供的 <math>
    math = el.querySelector?.('math');
    if (math) return math.outerHTML;

    // 3) MathJax v3 辅助 MathML
    math = el.querySelector?.('mjx-assistive-mml math');
    if (math) return math.outerHTML;

    // 4) MathJax v2 辅助 MathML
    math = el.querySelector?.('span.MJX_Assistive_MathML math');
    if (math) return math.outerHTML;

    return null;
  }

  const MATHML_NS = 'http://www.w3.org/1998/Math/MathML';
  const MAX_LATEX_CACHE_SIZE = 512;
  const latexToMathMLCache = new Map();

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

  // KaTeX/HTML 里的命名实体（如 &nbsp;）在 XML MathML 中可能非法；
  // 统一转为数字实体，确保 DOMParser(application/xml) 与 Word 可识别。
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

  // Word 兼容归一化：
  // 1) 将 <mtext>(20)</mtext> 转成数学节点，并规范为 #(20)
  // 2) 将 KaTeX 的标签布局表拍平，避免 Word 中出现难以删除的留白
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

      // KaTeX 显示公式常见标签布局：
      // <mtable width="100%"><mtr><mtd width="50%"/><mtd>eq</mtd><mtd width="50%"/><mtd>tag</mtd></mtr></mtable>
      // 改为内联 mrow，减少 Word 删除标签后的残留空白。
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

  // Trusted Types 友好：用 KaTeX renderToString 生成后直接提取 <math>
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
    const cached = latexToMathMLCache.get(latexString);
    if (cached) return normalizeAndCacheMathML(el, cached);
    const mml = convertLatexToMathMLWithKaTeX(latexString);
    if (!mml) throw new Error('KaTeX MathML conversion unavailable');
    const normalized = normalizeMathMLForWord(mml);
    setLimitedCache(latexToMathMLCache, latexString, normalized);
    return normalizeAndCacheMathML(el, normalized);
  }

  function bindOne(element, latexString) {
    // 仅绑定元数据；交互监听采用事件委托，减少单节点监听器开销。
    if (element.dataset.latexCopyBound === '1') return;
    element.dataset.latexCopyBound = '1';
    if (latexString) element.dataset.latex = latexString;

    // 轻量预热：优先缓存页面已有的 MathML，避免复制时再次深度查询 DOM。
    if (!element.dataset.mathml) {
      const rawMathML = extractExistingMathML(element);
      if (rawMathML) {
        const needsNormalize = rawMathML.includes('<mtext>') || rawMathML.includes('<mtable') || rawMathML.includes('&');
        if (!needsNormalize) {
          element.dataset.mathml = rawMathML;
          element.dataset.mathmlNormalized = '1';
        } else {
          const normalized = normalizeMathMLForWord(rawMathML);
          if (normalized) {
            element.dataset.mathml = normalized;
            element.dataset.mathmlNormalized = '1';
          } else {
            element.dataset.mathml = rawMathML;
          }
        }
      }
    }
  }

  function ensureLatexFromElement(el) {
    if (!el) return null;
    const existing = el.dataset?.latex;
    if (existing) return existing;

    const target = currentTarget;
    if (!target) return null;

    const latex = target.getLatex(el);
    if (latex && el.dataset) el.dataset.latex = latex;
    return latex || null;
  }

  // 4) 事件委托交互（一次注册，全局生效）
  let currentHoverEl = null;

  function hideHoverTooltip() {
    if (!uiInited) return;
    tooltip.style.opacity = '0';
  }

  function showHoverTooltipFor(el) {
    initUI();
    if (!uiInited) return;
    const latexString = ensureLatexFromElement(el);
    if (!latexString) return;

    tooltip.textContent = latexString;

    const rect = el.getBoundingClientRect();
    let left = rect.left;
    let top = rect.top - 30;

    // 视口边界约束，避免提示框出屏
    const padding = 6;
    // 临时放置后测量尺寸
    tooltip.style.opacity = '0';
    tooltip.style.left = '0px';
    tooltip.style.top = '0px';

    // 触发布局获取宽高
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
    if (to && el.contains(to)) return; // 鼠标仍在公式内部
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

    const mode = window.__latexCopyMode || 'mathml';
    if (mode === 'latex') {
      const latexString = ensureLatexFromElement(el);
      if (!latexString) return;
      copyToClip(latexString, 'latex');
    } else {
      try {
        const existingMathML = resolveMathMLFromElement(el);
        if (existingMathML) {
          copyToClip(existingMathML, 'mathml');
          try { window.getSelection()?.removeAllRanges(); } catch (_) { }
          return;
        }

        const latexString = ensureLatexFromElement(el);
        if (!latexString) return;
        const mml = ensureMathMLOnDemand(el, latexString);
        copyToClip(mml, 'mathml');
      } catch (err) {
        console.warn('[latex-copy] MathML conversion failed, fallback to LaTeX:', err);
        const latexString = ensureLatexFromElement(el);
        if (!latexString) return;
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

    // root 本身若是公式节点，也需要绑定
    if (root && root.nodeType === 1 && root.matches?.(target.elementSelector)) {
      bindOne(root);
    }

    // 仅扫描当前子树，避免每次全量扫描文档
    if (root && typeof root.querySelectorAll === 'function') {
      root.querySelectorAll(target.elementSelector).forEach(element => {
        bindOne(element);
      });
    }
  }

  // rAF 批处理增量扫描，适配动态/SPA 页面
  const pendingRoots = new Set();
  let scheduled = false;
  let lastHref = window.location.href;
  let currentTarget = getTarget(lastHref);

  function isSameOrAncestor(a, b) {
    if (!a || !b) return false;
    if (a === b) return true;
    if (a.nodeType === 9) return true;
    if (a.nodeType === 1 && b.nodeType === 1 && typeof a.contains === 'function') return a.contains(b);
    if (a.nodeType === 11 && b.nodeType === 1 && typeof a.contains === 'function') return a.contains(b);
    return false;
  }

  function enqueuePendingRoot(node) {
    if (!node) return;
    if (node.nodeType !== 1 && node.nodeType !== 9 && node.nodeType !== 11) return;

    const toDelete = [];
    for (const existing of pendingRoots) {
      if (isSameOrAncestor(existing, node)) return;
      if (isSameOrAncestor(node, existing)) toDelete.push(existing);
    }
    for (const n of toDelete) pendingRoots.delete(n);
    pendingRoots.add(node);
  }

  function scheduleScan(node) {
    if (!node) return;
    enqueuePendingRoot(node);
    if (scheduled) return;
    scheduled = true;

    requestAnimationFrame(() => {
      scheduled = false;

      // SPA 路由变化时，触发一次全量扫描
      if (window.location.href !== lastHref) {
        lastHref = window.location.href;
        currentTarget = getTarget(lastHref);
        enqueuePendingRoot(document);
      }

      for (const n of pendingRoots) scanRoot(n);
      pendingRoots.clear();
    });
  }

  function getCopyTextFromNode(node, mode) {
    if (mode === 'latex') {
      const latex = node.dataset?.latex || currentTarget?.getLatex(node) || node.getAttribute?.('data-math') || getKaTeXLatex(node);
      return latex ? `$${latex}$` : node.textContent;
    }

    const mathml = resolveMathMLFromElement(node);
    if (mathml) return mathml;

    const latex = node.dataset?.latex || currentTarget?.getLatex(node) || node.getAttribute?.('data-math') || getKaTeXLatex(node);
    return latex || node.textContent;
  }

  function getActiveFormulaSelector() {
    const siteSelector = currentTarget?.elementSelector;
    if (!siteSelector) return FORMULA_SELECTOR;
    return `${FORMULA_SELECTOR}, ${siteSelector}`;
  }

  function handleCopy(e) {
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed || sel.rangeCount === 0) return;

    const mode = window.__latexCopyMode || 'mathml';
    const container = document.createElement('div');
    let changed = false;
    const selector = getActiveFormulaSelector();
    for (let i = 0; i < sel.rangeCount; i++) {
      const fragment = sel.getRangeAt(i).cloneContents();
      const nodes = Array.from(fragment.querySelectorAll(selector));
      if (nodes.length) {
        changed = true;
        for (let j = nodes.length - 1; j >= 0; j--) {
          const node = nodes[j];
          const text = getCopyTextFromNode(node, mode);
          if (node.parentNode) node.parentNode.replaceChild(document.createTextNode(text), node);
        }
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
