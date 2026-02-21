export function createUIController({
  shareIdleIcon,
  shareBusyIcon,
  shareReadyTitle,
  shareDisabledTitle,
  onShareClick,
  getCopyMode,
  setCopyMode
}) {
  const styleSheet = document.createElement('style');
  // 注入现代化、质感更强的 CSS 样式
  styleSheet.innerText = `
    /* 基础重置，确保不受宿主网站样式干扰 */
    .latex-ui-base {
      font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
      box-sizing: border-box;
    }

    .latex-tooltip {
      position: fixed;
      background-color: rgba(28, 28, 30, 0.85);
      backdrop-filter: blur(10px);
      -webkit-backdrop-filter: blur(10px);
      color: #fff;
      padding: 6px 12px;
      border-radius: 6px;
      font-size: 13px;
      z-index: 99999;
      opacity: 0;
      transition: opacity 0.25s ease;
      pointer-events: none;
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
      border: 1px solid rgba(255, 255, 255, 0.08);
    }

    /* 成功提示：右下角轻量浮层 */
    .latex-copy-success {
      position: fixed;
      bottom: 80px; 
      right: 25px;
      background-color: rgba(28, 28, 30, 0.85);
      backdrop-filter: blur(12px);
      -webkit-backdrop-filter: blur(12px);
      color: #ffffff;
      padding: 10px 20px;
      border-radius: 12px;
      font-size: 14px;
      font-weight: 500;
      z-index: 100000;
      opacity: 0;
      transform: translateY(15px) scale(0.95);
      transition: all 0.4s cubic-bezier(0.16, 1, 0.3, 1);
      pointer-events: none;
      box-shadow: 0 8px 24px rgba(0, 0, 0, 0.15), 0 2px 8px rgba(0, 0, 0, 0.08);
      border: 1px solid rgba(255, 255, 255, 0.1);
      display: flex;
      align-items: center;
      gap: 8px;
    }
    .latex-copy-success.show {
      opacity: 1;
      transform: translateY(0) scale(1);
    }

    /* 进度条面板 */
    .latex-copy-progress {
      position: fixed;
      bottom: 80px;
      right: 25px;
      min-width: 240px;
      max-width: min(320px, calc(100vw - 40px));
      background-color: rgba(28, 28, 30, 0.85);
      backdrop-filter: blur(12px);
      -webkit-backdrop-filter: blur(12px);
      color: #f3f4f6;
      padding: 14px 16px;
      border-radius: 14px;
      font-size: 13px;
      z-index: 100001;
      opacity: 0;
      transform: translateY(12px);
      transition: opacity 0.3s ease, transform 0.4s cubic-bezier(0.16, 1, 0.3, 1);
      pointer-events: none;
      box-shadow: 0 10px 30px rgba(0, 0, 0, 0.2);
      border: 1px solid rgba(255, 255, 255, 0.08);
    }
    .latex-copy-progress.show {
      opacity: 1;
      transform: translateY(0);
    }
    .latex-copy-progress-label {
      margin-bottom: 10px;
      line-height: 1.4;
      font-weight: 500;
      word-break: break-word;
      letter-spacing: 0.3px;
    }
    .latex-copy-progress-track {
      width: 100%;
      height: 6px;
      border-radius: 999px;
      background: rgba(255, 255, 255, 0.15);
      overflow: hidden;
      box-shadow: inset 0 1px 2px rgba(0,0,0,0.1);
    }
    .latex-copy-progress-fill {
      width: 0%;
      height: 100%;
      border-radius: 999px;
      background: linear-gradient(90deg, #3b82f6, #60a5fa, #3b82f6);
      background-size: 200% 100%;
      animation: latex-progress-shimmer 1.5s linear infinite;
      transition: width 0.2s ease-out;
    }
    @keyframes latex-progress-shimmer {
      from { background-position: 100% 0%; }
      to { background-position: -100% 0%; }
    }

    /* 底部操作按钮组 */
    .latex-copy-actions {
      position: fixed;
      bottom: 24px;
      right: 24px;
      z-index: 99999;
      display: flex;
      gap: 12px;
      align-items: center;
    }

    /* 通用按钮样式 */
    .latex-copy-toggle, .latex-copy-share {
      background: linear-gradient(135deg, #2563eb, #1d4ed8);
      color: #ffffff;
      font-size: 13px;
      font-weight: 600;
      cursor: pointer;
      user-select: none;
      box-shadow: 0 4px 12px rgba(37, 99, 235, 0.3), inset 0 1px 1px rgba(255, 255, 255, 0.2);
      transition: all 0.25s cubic-bezier(0.16, 1, 0.3, 1);
      border: 1px solid rgba(0, 0, 0, 0.1);
    }
    
    .latex-copy-toggle {
      padding: 10px 18px;
      border-radius: 999px; /* 胶囊形状 */
      white-space: nowrap;
      letter-spacing: 0.3px;
    }
    
    .latex-copy-share {
      width: 40px;
      height: 40px;
      border-radius: 50%; /* 正圆形 */
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 18px;
    }

    /* 按钮悬停与激活状态 */
    .latex-copy-toggle:hover, .latex-copy-share:hover {
      transform: translateY(-2px);
      box-shadow: 0 6px 16px rgba(37, 99, 235, 0.4), inset 0 1px 1px rgba(255, 255, 255, 0.25);
      background: linear-gradient(135deg, #3b82f6, #2563eb);
    }
    .latex-copy-toggle:active, .latex-copy-share:active {
      transform: translateY(1px);
      box-shadow: 0 2px 6px rgba(37, 99, 235, 0.3);
      transition: all 0.1s ease;
    }
    
    .latex-copy-share.is-disabled {
      background: rgba(100, 100, 100, 0.8);
      box-shadow: none;
      opacity: 0.6;
      cursor: not-allowed;
      transform: none;
    }

    .latex-share-capture-root {
      position: fixed !important;
      left: -100000px !important;
      top: 0 !important;
      z-index: -1 !important;
      opacity: 0 !important;
      pointer-events: none !important;
    }
  `;

  const tooltip = document.createElement('div');
  tooltip.className = 'latex-tooltip latex-ui-base';

  let uiInited = false;
  let toggleInited = false;
  let shareBtnEl = null;
  let exportProgressEl = null;
  let exportProgressLabelEl = null;
  let exportProgressFillEl = null;
  let exportProgressAnimId = 0;
  let exportProgressDisplay = 0;
  let exportProgressTarget = 0;
  let exportProgressCap = 100;
  let exportProgressText = '正在导出 PNG…';
  let exportProgressLastUpdateAt = 0;
  let exportProgressLastRenderInt = -1;

  function isActivationKey(key) {
    return key === 'Enter' || key === ' ';
  }

  function clampPercent(value) {
    const n = Number(value);
    if (!Number.isFinite(n)) return 0;
    return Math.max(0, Math.min(100, Math.round(n)));
  }

  function ensureProgressAnimationLoop() {
    if (exportProgressAnimId) return;
    const tick = () => {
      exportProgressAnimId = 0;
      if (!exportProgressEl) return;

      const nowTs = Date.now();
      if (exportProgressDisplay < exportProgressTarget) {
        const gap = exportProgressTarget - exportProgressDisplay;
        const step = Math.max(0.12, gap * 0.16);
        exportProgressDisplay = Math.min(exportProgressTarget, exportProgressDisplay + step);
      } else {
        const stalledMs = nowTs - exportProgressLastUpdateAt;
        const cap = Math.max(exportProgressTarget, exportProgressCap);
        const headroom = cap - exportProgressDisplay;
        if (stalledMs > 650 && headroom > 0.2) {
          const drift = Math.max(0.03, headroom * 0.015);
          exportProgressDisplay = Math.min(cap, exportProgressDisplay + drift);
        }
      }

      const intPercent = clampPercent(exportProgressDisplay);
      if (intPercent !== exportProgressLastRenderInt && exportProgressLabelEl && exportProgressFillEl) {
        exportProgressLastRenderInt = intPercent;
        exportProgressLabelEl.textContent = `${intPercent}% · ${exportProgressText || '正在导出 PNG…'}`;
        exportProgressFillEl.style.width = `${intPercent}%`;
      }

      exportProgressAnimId = requestAnimationFrame(tick);
    };
    exportProgressAnimId = requestAnimationFrame(tick);
  }

  function initUI() {
    if (uiInited) return;
    if (!document.head || !document.body) return;
    uiInited = true;
    document.head.appendChild(styleSheet);
    document.body.appendChild(tooltip);
  }

  function initToggleButton() {
    if (toggleInited) return;
    if (!document.body) return;
    toggleInited = true;

    const wrap = document.createElement('div');
    wrap.className = 'latex-copy-actions latex-ui-base';

    const shareBtn = document.createElement('div');
    shareBtn.className = 'latex-copy-share';
    shareBtn.textContent = shareIdleIcon;
    shareBtn.title = shareDisabledTitle;
    shareBtn.setAttribute('role', 'button');
    shareBtn.tabIndex = 0;
    shareBtn.addEventListener('click', onShareClick);
    shareBtn.addEventListener('keydown', (e) => {
      if (!isActivationKey(e.key)) return;
      e.preventDefault();
      onShareClick(e);
    });
    shareBtnEl = shareBtn;

    const btn = document.createElement('div');
    btn.className = 'latex-copy-toggle';
    btn.setAttribute('role', 'button');
    btn.tabIndex = 0;

    const updateText = () => {
      btn.textContent = getCopyMode() === 'mathml' ? '📋 Word 公式' : '📋 LaTeX | Markdown';
    };
    const toggleMode = () => {
      setCopyMode(getCopyMode() === 'mathml' ? 'latex' : 'mathml');
      updateText();
    };
    btn.addEventListener('click', toggleMode);
    btn.addEventListener('keydown', (e) => {
      if (!isActivationKey(e.key)) return;
      e.preventDefault();
      toggleMode();
    });
    updateText();

    wrap.appendChild(btn);
    wrap.appendChild(shareBtn);
    document.body.appendChild(wrap);
  }

  function showToastMessage(text) {
    const oldToast = document.querySelector('.latex-copy-success');
    if (oldToast) oldToast.remove();

    const copyTooltip = document.createElement('div');
    copyTooltip.className = 'latex-copy-success latex-ui-base';
    copyTooltip.innerText = text;
    document.body.appendChild(copyTooltip);

    // 留出微小的重绘时间触发顺滑过渡
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        copyTooltip.classList.add('show');
      });
    });

    setTimeout(() => {
      copyTooltip.classList.remove('show');
      setTimeout(() => { if (copyTooltip.parentNode) copyTooltip.remove(); }, 400); // 等待动画完全结束
    }, 2000); // 稍微延长了展示时间，提升阅读体验
  }

  function showCopySuccessTooltip(mode) {
    showToastMessage(mode === 'latex' ? '✅ 已成功复制 LaTeX' : '✅ 已成功复制 Word 公式');
  }

  function ensureExportProgressEl() {
    initUI();
    if (!uiInited || exportProgressEl) return;

    const panel = document.createElement('div');
    panel.className = 'latex-copy-progress latex-ui-base';

    const label = document.createElement('div');
    label.className = 'latex-copy-progress-label';
    label.textContent = '正在导出 PNG…';

    const track = document.createElement('div');
    track.className = 'latex-copy-progress-track';

    const fill = document.createElement('div');
    fill.className = 'latex-copy-progress-fill';
    track.appendChild(fill);

    panel.appendChild(label);
    panel.appendChild(track);

    document.body.appendChild(panel);
    exportProgressEl = panel;
    exportProgressLabelEl = label;
    exportProgressFillEl = fill;
  }

  function showExportProgress({ percent = 0, text = '正在导出 PNG…', phaseCap = 100 } = {}) {
    ensureExportProgressEl();
    if (!exportProgressEl) return;

    const p = clampPercent(percent);
    const cap = clampPercent(phaseCap);
    exportProgressTarget = Math.max(exportProgressTarget, p);
    exportProgressCap = Math.max(exportProgressTarget, cap);
    exportProgressText = text || '正在导出 PNG…';
    exportProgressLastUpdateAt = Date.now();

    if (exportProgressDisplay < 0.01) {
      exportProgressDisplay = Math.max(0, Math.min(exportProgressTarget, p));
      exportProgressLastRenderInt = -1;
    }

    ensureProgressAnimationLoop();
    exportProgressEl.classList.add('show');
  }

  function hideExportProgress() {
    if (exportProgressAnimId) {
      try { cancelAnimationFrame(exportProgressAnimId); } catch (_) { }
    }
    exportProgressAnimId = 0;
    exportProgressDisplay = 0;
    exportProgressTarget = 0;
    exportProgressCap = 100;
    exportProgressText = '正在导出 PNG…';
    exportProgressLastUpdateAt = 0;
    exportProgressLastRenderInt = -1;

    if (!exportProgressEl) return;
    
    // 增加淡出动画逻辑
    exportProgressEl.classList.remove('show');
    const elToRemove = exportProgressEl;
    setTimeout(() => {
      if (elToRemove.parentNode) elToRemove.remove();
    }, 400);
    
    exportProgressEl = null;
    exportProgressLabelEl = null;
    exportProgressFillEl = null;
  }

  function updateShareButtonState({ enabled, shareBusy }) {
    if (!shareBtnEl || !shareBtnEl.isConnected) return false;
    const disabled = shareBusy || !enabled;
    shareBtnEl.classList.toggle('is-disabled', disabled);
    shareBtnEl.setAttribute('aria-disabled', disabled ? 'true' : 'false');
    shareBtnEl.textContent = shareBusy ? shareBusyIcon : shareIdleIcon;
    shareBtnEl.title = shareBusy ? '正在处理中…' : (enabled ? shareReadyTitle : shareDisabledTitle);
    return enabled;
  }

  return {
    initUI,
    initToggleButton,
    isUIInited: () => uiInited,
    tooltip,
    showToastMessage,
    showCopySuccessTooltip,
    showExportProgress,
    hideExportProgress,
    updateShareButtonState
  };
}