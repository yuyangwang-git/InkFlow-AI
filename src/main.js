import { createMathMLTools } from './mathml.js';
import { stitchPngBlobsVertically } from './stitch.js';
import {
  isLikelyChatGPTConversationPage,
  findChatGPTConversationRoot,
  makePngFilename,
  renderConversationRootToBlob
} from './chatgpt-export.js';
import {
  getTarget,
  extractExistingMathML
} from './site-targets.js';
import { createUIController } from './ui.js';
(function () {
  'use strict';

  const COPY_MODE_MATHML = 'mathml';
  const COPY_MODE_LATEX = 'latex';
  const BOUND_FORMULA_SELECTOR = '[data-latex-copy-bound="1"]';

  window.__latexCopyMode = COPY_MODE_MATHML;
  const SHARE_IDLE_ICON = '🖼️';
  const SHARE_BUSY_ICON = '⏳';
  const SHARE_READY_TITLE = '导出对话为 PNG（ChatGPT）';
  const SHARE_DISABLED_TITLE = '当前页面暂不支持导出 PNG（仅 ChatGPT）';

  function getCopyMode() {
    return window.__latexCopyMode || COPY_MODE_MATHML;
  }

  function setCopyMode(mode) {
    window.__latexCopyMode = mode === COPY_MODE_LATEX ? COPY_MODE_LATEX : COPY_MODE_MATHML;
  }

  function clearSelection() {
    try { window.getSelection()?.removeAllRanges(); } catch (_) { }
  }

  function getBoundFormulaElement(target) {
    return target?.closest?.(BOUND_FORMULA_SELECTOR) || null;
  }

  let shareBusy = false;
  const ui = createUIController({
    shareIdleIcon: SHARE_IDLE_ICON,
    shareBusyIcon: SHARE_BUSY_ICON,
    shareReadyTitle: SHARE_READY_TITLE,
    shareDisabledTitle: SHARE_DISABLED_TITLE,
    onShareClick: handleShareButtonClick,
    getCopyMode,
    setCopyMode
  });

  function copyToClip(text, mode) {
    navigator.clipboard.writeText(text).then(() => {
      ui.showCopySuccessTooltip(mode);
    }).catch(err => console.error('复制失败:', err));
  }

  function downloadBlobAsPng(blob, filename) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => {
      try { URL.revokeObjectURL(url); } catch (_) { }
    }, 60000);
  }

  function updateShareButtonState() {
    const enabled = isLikelyChatGPTConversationPage() && !!findChatGPTConversationRoot();
    return ui.updateShareButtonState({ enabled, shareBusy });
  }

  async function handleShareButtonClick(e) {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }
    if (shareBusy) return;

    const enabled = updateShareButtonState();
    if (!enabled) {
      ui.showToastMessage('当前页面未检测到可导出的 ChatGPT 对话');
      return;
    }

    shareBusy = true;
    ui.hideExportProgress();
    ui.showExportProgress({ percent: 1, text: '准备导出…', phaseCap: 6 });
    updateShareButtonState();

    try {
      const updateExportProgress = (percent, text, phaseCap = 100) => {
        ui.showExportProgress({ percent, text: text || '正在导出 PNG…', phaseCap });
      };

      updateExportProgress(4, '定位对话区域…', 10);
      const sourceRoot = findChatGPTConversationRoot();
      if (!sourceRoot) throw new Error('Conversation root not found');

      const blobs = await renderConversationRootToBlob(sourceRoot, {
        onProgress: ({ percent, label }) => {
          const mapped = Math.max(5, Math.min(88, Math.round((percent / 100) * 88)));
          updateExportProgress(mapped, label || '渲染中…', 88);
        }
      });
      if (!Array.isArray(blobs) || !blobs.length) throw new Error('Empty PNG blob');
      if (blobs.some(b => !b || !b.size)) throw new Error('Invalid PNG blob');

      const baseName = makePngFilename();
      if (blobs.length === 1) {
        updateExportProgress(96, '保存文件…', 100);
        downloadBlobAsPng(blobs[0], baseName);
        updateExportProgress(100, '导出完成', 100);
        ui.showToastMessage('🖼️ 已导出 PNG');
      } else {
        const bg = getComputedStyle(document.body || document.documentElement).backgroundColor;
        const stitched = await stitchPngBlobsVertically(blobs, bg, {
          onProgress: ({ percent, label }) => {
            const mapped = Math.max(89, Math.min(98, 88 + Math.round((percent / 100) * 10)));
            updateExportProgress(mapped, label || '拼接中…', 98);
          }
        });
        updateExportProgress(99, '保存文件…', 100);
        downloadBlobAsPng(stitched.blob, baseName);
        updateExportProgress(100, '导出完成', 100);
        ui.showToastMessage(`🖼️ 已无损拼接导出 PNG（${stitched.segmentCount} 段）`);
      }
    } catch (err) {
      console.error('[latex-copy] 导出 PNG 失败:', err);
      ui.showToastMessage('导出失败，请稍后重试');
    } finally {
      ui.hideExportProgress();
      shareBusy = false;
      updateShareButtonState();
    }
  }

  const { normalizeMathMLForWord, resolveMathMLFromElement, ensureMathMLOnDemand } = createMathMLTools({ extractExistingMathML });

  function bindOne(element) {
    // 仅绑定元数据；交互监听采用事件委托，减少单节点监听器开销。
    if (element.dataset.latexCopyBound === '1') return;
    element.dataset.latexCopyBound = '1';

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

  function getLatexText(node) {
    if (!node) return null;
    return ensureLatexFromElement(node);
  }

  // 4) 事件委托交互（一次注册，全局生效）
  let currentHoverEl = null;

  function hideHoverTooltip() {
    if (!ui.isUIInited()) return;
    ui.tooltip.style.opacity = '0';
  }

  function showHoverTooltipFor(el) {
    ui.initUI();
    if (!ui.isUIInited()) return;
    const latexString = ensureLatexFromElement(el);
    if (!latexString) return;

    ui.tooltip.textContent = latexString;

    const rect = el.getBoundingClientRect();
    let left = rect.left;
    let top = rect.top - 30;

    // 视口边界约束，避免提示框出屏
    const padding = 6;
    // 临时放置后测量尺寸
    ui.tooltip.style.opacity = '0';
    ui.tooltip.style.left = '0px';
    ui.tooltip.style.top = '0px';

    // 触发布局获取宽高
    const ttRect = ui.tooltip.getBoundingClientRect();
    const ttW = ttRect.width || 0;
    const ttH = ttRect.height || 0;

    if (top < padding) top = rect.bottom + padding;
    if (left + ttW > window.innerWidth - padding) left = Math.max(padding, window.innerWidth - ttW - padding);
    if (left < padding) left = padding;
    if (top + ttH > window.innerHeight - padding) top = Math.max(padding, window.innerHeight - ttH - padding);

    ui.tooltip.style.left = `${left}px`;
    ui.tooltip.style.top = `${top}px`;
    ui.tooltip.style.opacity = '1';
  }

  document.addEventListener('pointerover', (e) => {
    const el = getBoundFormulaElement(e.target);
    if (!el || el === currentHoverEl) return;
    currentHoverEl = el;
    showHoverTooltipFor(el);
  }, true);

  document.addEventListener('pointerout', (e) => {
    const el = getBoundFormulaElement(e.target);
    if (!el || el !== currentHoverEl) return;
    const to = e.relatedTarget;
    if (to && el.contains(to)) return; // 鼠标仍在公式内部
    currentHoverEl = null;
    hideHoverTooltip();
  }, true);

  document.addEventListener('dblclick', (e) => {
    const el = getBoundFormulaElement(e.target);
    if (!el) return;

    e.preventDefault();
    e.stopPropagation();
    if (typeof e.stopImmediatePropagation === 'function') e.stopImmediatePropagation();

    ui.initUI();
    ui.initToggleButton();

    const mode = getCopyMode();
    if (mode === COPY_MODE_LATEX) {
      const latexString = getLatexText(el);
      if (!latexString) return;
      copyToClip(latexString, 'latex');
    } else {
      try {
        const existingMathML = resolveMathMLFromElement(el);
        if (existingMathML) {
          copyToClip(existingMathML, 'mathml');
          clearSelection();
          return;
        }

        const latexString = getLatexText(el);
        if (!latexString) return;
        const mml = ensureMathMLOnDemand(el, latexString);
        copyToClip(mml, 'mathml');
      } catch (err) {
        console.warn('[latex-copy] MathML conversion failed, fallback to LaTeX:', err);
        const latexString = getLatexText(el);
        if (!latexString) return;
        copyToClip(latexString, 'latex');
      }
    }
    clearSelection();
  }, true);
  function scanRoot(root) {
    ui.initUI();
    if (!ui.isUIInited()) return;
    ui.initToggleButton();
    updateShareButtonState();

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
    const latex = getLatexText(node);
    if (mode === COPY_MODE_LATEX) {
      return latex ? `$${latex}$` : node.textContent;
    }

    const mathml = resolveMathMLFromElement(node);
    if (mathml) return mathml;

    return latex || node.textContent;
  }

  function handleCopy(e) {
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed || sel.rangeCount === 0) return;

    const selector = currentTarget?.elementSelector;
    if (!selector) return;

    const mode = getCopyMode();
    const container = document.createElement('div');
    let changed = false;
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

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      ui.initUI();
      scanRoot(document);
    });
  } else {
    ui.initUI();
    scanRoot(document);
  }
  document.addEventListener('copy', handleCopy, true);
})();

