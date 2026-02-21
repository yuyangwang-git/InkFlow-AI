const TRANSPARENT_PIXEL = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR4nGNgYAAAAAMAASsJTYQAAAAASUVORK5CYII=';
const TRANSPARENT_BG = 'rgba(0, 0, 0, 0)';
const MAX_CAPTURE_DIMENSION = 16384;
const MAX_SEGMENT_CSS_HEIGHT = 9000;
const MIN_SEGMENT_CSS_HEIGHT = 900;
const TARGET_SEGMENT_COUNT = 2;
const MAX_TOTAL_CAPTURE_PIXELS = 72 * 1024 * 1024;
const MAX_PIXELS_PER_SEGMENT = 28 * 1024 * 1024;
const MAX_CAPTURE_SEGMENTS = 400;
const MAX_SEGMENT_CAPTURE_ATTEMPTS = 4;
const MIN_SEGMENT_RETRY_HEIGHT = 400;
const SEGMENT_RETRY_SCALE = 0.7;
const FONT_READY_TIMEOUT_MS = 1500;
const BLOCKED_RESOURCE_PATTERNS = [
  /^https?:\/\/www\.google\.com\/s2\/favicons/i
];
const INTERACTIVE_CAPTURE_SELECTORS = [
  '.latex-copy-actions',
  '.latex-copy-success',
  '.latex-tooltip',
  '[data-testid$="-turn-action-button"]',
  '[data-testid="copy-turn-action-button"]',
  '[data-testid="good-response-turn-action-button"]',
  '[data-testid="bad-response-turn-action-button"]',
  '[data-testid="composer-footer-actions"]',
  '[data-testid="send-button"]',
  '[data-testid="composer-plus-btn"]',
  'form'
];
const CONTENT_WIDTH_PRIMARY_SELECTORS = [
  '[data-message-author-role] .markdown',
  '[data-message-author-role] pre',
  '[data-message-author-role] table',
  '[data-message-author-role] img',
  '[data-message-author-role] .whitespace-pre-wrap',
  '[data-message-author-role] .user-message-bubble-color',
  '[data-message-author-role] .katex-display'
];
const CONTENT_WIDTH_FALLBACK_SELECTORS = ['[data-message-author-role]'];

let htmlToImageLoader = null;
const resourceDataUrlCache = new Map();

function hasHtmlToImageRenderer(lib) {
  return !!(
    lib &&
    (
      typeof lib.toBlob === 'function' ||
      typeof lib.toPng === 'function' ||
      typeof lib.toCanvas === 'function'
    )
  );
}

function nextAnimationFrame() {
  return new Promise(resolve => requestAnimationFrame(resolve));
}

function yieldToMainThread(delayMs = 0) {
  return new Promise(resolve => setTimeout(resolve, delayMs));
}

async function waitForFrames(count = 1) {
  const times = Math.max(1, Math.floor(count || 1));
  for (let i = 0; i < times; i++) await nextAnimationFrame();
}

async function waitForFontsReady(timeoutMs = FONT_READY_TIMEOUT_MS) {
  if (!document.fonts?.ready) return;
  await Promise.race([
    document.fonts.ready.catch(() => null),
    yieldToMainThread(Math.max(0, timeoutMs | 0))
  ]);
}

function normalizeBackgroundColor(color) {
  return (color && color !== TRANSPARENT_BG) ? color : undefined;
}

function getPageBackgroundColor() {
  return getComputedStyle(document.body || document.documentElement).backgroundColor;
}

function createProgressReporter(onProgress) {
  let lastPercent = -1;
  let lastLabel = '';
  return (percent, label) => {
    if (typeof onProgress !== 'function') return;
    const p = Math.max(0, Math.min(100, Math.round(Number(percent) || 0)));
    const l = String(label || '');
    if (p === lastPercent && l === lastLabel) return;
    lastPercent = p;
    lastLabel = l;
    try { onProgress({ percent: p, label: l }); } catch (_) { }
  };
}

export function isLikelyChatGPTConversationPage() {
  const host = (window.location.hostname || '').toLowerCase();
  if (host.endsWith('chatgpt.com') || host.endsWith('chat.openai.com')) return true;
  return !!document.querySelector('article[data-testid^="conversation-turn"], [data-testid="share-chat-button"]');
}

function sanitizeFilenamePart(name) {
  const safe = String(name || 'chatgpt_conversation').trim().replace(/[\/\\?%*:|"<>]/g, '-').replace(/\s+/g, ' ');
  return safe || 'chatgpt_conversation';
}

export function makePngFilename() {
  const d = new Date();
  const pad = n => String(n).padStart(2, '0');
  const stamp = `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
  return `${sanitizeFilenamePart(document.title)}_${stamp}.png`;
}

function getCommonAncestor(nodes) {
  if (!nodes || !nodes.length) return null;
  let candidate = nodes[0];
  while (candidate) {
    if (nodes.every(n => candidate === n || candidate.contains(n))) return candidate;
    candidate = candidate.parentElement;
  }
  return null;
}

function collectChatGPTConversationNodes() {
  const main = document.querySelector('main#main, main');
  const inMain = el => !main || main.contains(el);

  const turns = Array.from(document.querySelectorAll('article[data-testid^="conversation-turn"]')).filter(inMain);
  if (turns.length) return turns;

  const roleNodes = Array.from(document.querySelectorAll('[data-message-author-role]')).filter(inMain);
  if (roleNodes.length) return roleNodes;

  return [];
}

export function findChatGPTConversationRoot() {
  const nodes = collectChatGPTConversationNodes();
  if (!nodes.length) return null;

  let root = nodes.length === 1 ? nodes[0] : getCommonAncestor(nodes);
  if (!root) return null;

  // 若祖先过大（包含输入区），优先收窄到仅含消息的包裹层。
  const hasComposer = el => !!el?.querySelector?.('[data-testid="send-button"], [data-testid="composer-footer-actions"], [id^="prompt-textarea"], form textarea');
  if (hasComposer(root)) {
    const parent = nodes[0]?.parentElement;
    if (parent && nodes.every(n => parent.contains(n)) && !hasComposer(parent)) root = parent;
  }

  return root;
}

function stripInteractiveNodesForCapture(root) {
  if (!root) return;
  INTERACTIVE_CAPTURE_SELECTORS.forEach(sel => {
    root.querySelectorAll(sel).forEach(el => el.remove());
  });
}

function createOffscreenCaptureClone(sourceRoot) {
  const offscreenRoot = document.createElement('div');
  offscreenRoot.className = 'latex-share-capture-root';

  const clonedRoot = sourceRoot.cloneNode(true);
  stripInteractiveNodesForCapture(clonedRoot);

  const sourceRect = sourceRoot.getBoundingClientRect();
  const fallbackWidth = Math.max(320, Math.min(1200, Math.round(window.innerWidth * 0.9)));
  const baseWidth = Math.max(320, Math.ceil(sourceRect.width || sourceRoot.clientWidth || fallbackWidth));

  const computeConversationContentWidth = () => {
    const collectRects = selectors => {
      const rects = [];
      for (const sel of selectors) {
        const nodes = Array.from(sourceRoot.querySelectorAll(sel));
        for (const el of nodes) {
          const r = el.getBoundingClientRect();
          if (!r || r.width < 20 || r.height < 8) continue;
          rects.push(r);
        }
      }
      return rects;
    };

    const primaryRects = collectRects(CONTENT_WIDTH_PRIMARY_SELECTORS);
    const rects = primaryRects.length ? primaryRects : collectRects(CONTENT_WIDTH_FALLBACK_SELECTORS);
    if (!rects.length) return null;

    const minLeft = Math.min(...rects.map(r => r.left));
    const maxRight = Math.max(...rects.map(r => r.right));
    const width = Math.ceil(maxRight - minLeft);
    return Number.isFinite(width) && width > 0 ? width : null;
  };

  const contentWidth = computeConversationContentWidth();
  let targetWidth = baseWidth;
  if (contentWidth) {
    const desired = Math.ceil(contentWidth + 64);
    targetWidth = Math.max(320, Math.min(desired, baseWidth));
  }

  offscreenRoot.style.width = `${targetWidth}px`;
  offscreenRoot.style.maxWidth = `${targetWidth}px`;
  clonedRoot.style.width = `${targetWidth}px`;
  clonedRoot.style.maxWidth = `${targetWidth}px`;
  clonedRoot.style.minWidth = `${targetWidth}px`;
  clonedRoot.style.height = 'auto';
  clonedRoot.style.maxHeight = 'none';
  clonedRoot.style.overflow = 'visible';
  clonedRoot.style.boxSizing = 'border-box';

  offscreenRoot.appendChild(clonedRoot);
  document.documentElement.appendChild(offscreenRoot);
  return { offscreenRoot, clonedRoot };
}

function computeCaptureScale(width, height) {
  const dpr = Math.max(1, window.devicePixelRatio || 1);
  const targetRatio = Math.max(2, dpr);
  const byW = MAX_CAPTURE_DIMENSION / Math.max(1, width);
  const byH = MAX_CAPTURE_DIMENSION / Math.max(1, height);
  const scale = Math.min(targetRatio, byW, byH);
  return Number.isFinite(scale) && scale > 0 ? scale : 1;
}

function computeAdaptiveScaleCap(width, height, widthOnlyScale) {
  const area = Math.max(1, Math.ceil(width) * Math.ceil(height));
  const capByArea = Math.sqrt(MAX_TOTAL_CAPTURE_PIXELS / area);
  const safeCap = Number.isFinite(capByArea) && capByArea > 0 ? capByArea : 1;
  return Math.max(1, Math.min(widthOnlyScale, safeCap));
}

function resolvePixelRatio(width, height, scaleCap) {
  const baseScale = computeCaptureScale(width, height);
  if (!Number.isFinite(scaleCap) || scaleCap <= 0) return baseScale;
  return Math.min(baseScale, scaleCap);
}

function ensureHtmlToImageReady() {
  if (hasHtmlToImageRenderer(window.htmlToImage)) return Promise.resolve(window.htmlToImage);
  if (htmlToImageLoader) return htmlToImageLoader;

  htmlToImageLoader = new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = 'https://cdn.jsdelivr.net/npm/html-to-image@1.11.13/dist/html-to-image.min.js';
    s.async = true;
    s.onload = () => {
      if (hasHtmlToImageRenderer(window.htmlToImage)) resolve(window.htmlToImage);
      else reject(new Error('html-to-image loaded but unavailable'));
    };
    s.onerror = () => reject(new Error('Failed to load html-to-image'));
    document.head.appendChild(s);
  }).catch(err => {
    htmlToImageLoader = null;
    throw err;
  });

  return htmlToImageLoader;
}

function dataURLToBlob(dataUrl) {
  const s = String(dataUrl || '');
  const m = s.match(/^data:([^;,]+)?(;base64)?,(.*)$/);
  if (!m) throw new Error('Invalid data URL');
  const mime = m[1] || 'application/octet-stream';
  const isBase64 = !!m[2];
  const data = m[3] || '';
  if (!isBase64) return new Blob([decodeURIComponent(data)], { type: mime });

  const bin = atob(data);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Blob([bytes], { type: mime });
}

async function mapLimit(list, limit, worker) {
  const size = Array.isArray(list) ? list.length : 0;
  if (!size) return [];
  const lim = Math.max(1, Math.floor(limit || 1));
  const runners = Array(Math.min(lim, size)).fill(null);
  const results = Array(size);
  let cursor = 0;

  async function run() {
    while (cursor < size) {
      const idx = cursor++;
      results[idx] = await worker(list[idx], idx);
    }
  }

  for (let i = 0; i < runners.length; i++) runners[i] = run();
  await Promise.all(runners);
  return results;
}

function blobToDataURL(blob) {
  return new Promise((resolve, reject) => {
    try {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => reject(reader.error || new Error('FileReader failed'));
      reader.readAsDataURL(blob);
    } catch (err) {
      reject(err);
    }
  });
}

function pickReferer(rawUrl) {
  try {
    const host = new URL(rawUrl).hostname;
    if (host.endsWith('bing.net') || host.endsWith('microsoft.com')) return 'https://www.bing.com/';
    if (host.endsWith('baidu.com')) return 'https://baike.baidu.com/';
  } catch (_) { }
  return '';
}

function toAbsoluteHttpUrl(rawUrl) {
  const s = String(rawUrl || '').trim();
  if (!s) return '';
  if (s.startsWith('data:') || s.startsWith('blob:') || s.startsWith('about:') || s.startsWith('javascript:')) return '';
  if (/^https?:\/\//i.test(s)) return s;
  if (s.startsWith('//')) return `${window.location.protocol}${s}`;
  try {
    const u = new URL(s, window.location.href);
    if (u.protocol === 'http:' || u.protocol === 'https:') return u.href;
  } catch (_) { }
  return '';
}

function isBlockedResourceUrl(rawUrl) {
  const s = String(rawUrl || '');
  return BLOCKED_RESOURCE_PATTERNS.some(re => re.test(s));
}

function fetchAsDataURL(url) {
  const absUrl = toAbsoluteHttpUrl(url);
  if (!absUrl) return Promise.reject(new Error('Invalid image URL'));
  if (isBlockedResourceUrl(absUrl)) return Promise.reject(new Error('Blocked non-essential resource URL'));

  if (resourceDataUrlCache.has(absUrl)) return resourceDataUrlCache.get(absUrl);

  const referer = pickReferer(absUrl);
  const p = new Promise((resolve, reject) => {
    if (typeof GM_xmlhttpRequest === 'function') {
      GM_xmlhttpRequest({
        method: 'GET',
        url: absUrl,
        responseType: 'blob',
        timeout: 20000,
        headers: referer ? { Referer: referer } : {},
        onload: res => {
          if (!(res.status >= 200 && res.status < 300) || !res.response) {
            reject(new Error(`HTTP ${res.status}`));
            return;
          }
          blobToDataURL(res.response).then(resolve).catch(reject);
        },
        onerror: reject,
        ontimeout: () => reject(new Error('timeout'))
      });
      return;
    }

    fetch(absUrl, { mode: 'cors', credentials: 'omit', cache: 'force-cache' })
      .then(resp => {
        if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
        return resp.blob();
      })
      .then(blobToDataURL)
      .then(resolve)
      .catch(reject);
  });

  resourceDataUrlCache.set(absUrl, p);
  p.catch(() => resourceDataUrlCache.delete(absUrl));
  return p;
}

function pickImageUrl(img) {
  if (!img) return '';
  const candidates = [
    img.currentSrc,
    img.getAttribute?.('src'),
    img.getAttribute?.('data-src'),
    img.getAttribute?.('data-original')
  ];
  for (const c of candidates) {
    const url = toAbsoluteHttpUrl(c);
    if (url && !isBlockedResourceUrl(url)) return url;
  }
  return '';
}

async function deCrossOriginAllImages(scopeEl) {
  const imgs = Array.from(scopeEl?.querySelectorAll?.('img') || []);
  if (!imgs.length) return;

  await mapLimit(imgs, 4, async img => {
    try {
      img.setAttribute('referrerpolicy', 'no-referrer');
      img.setAttribute('crossorigin', 'anonymous');
      const url = pickImageUrl(img);
      if (!url) return;

      const dataUrl = await fetchAsDataURL(url);
      await new Promise((resolve, reject) => {
        const done = () => resolve();
        const fail = () => reject(new Error('Image load failed'));
        img.addEventListener('load', done, { once: true });
        img.addEventListener('error', fail, { once: true });
        img.src = dataUrl;
      });
      img.removeAttribute('srcset');
      if (typeof img.decode === 'function') {
        try { await img.decode(); } catch (_) { }
      }
    } catch (_) {
      try {
        img.removeAttribute('srcset');
        img.src = TRANSPARENT_PIXEL;
      } catch (_) { }
    }
  });
}

async function replaceCssUrlsWithDataUrls(cssValue) {
  const value = String(cssValue || '');
  if (!value || value === 'none' || value.indexOf('url(') < 0) return value;

  const urlRe = /url\((['"]?)([^)"']+)\1\)/gi;
  const urls = [];
  let m;
  while ((m = urlRe.exec(value)) !== null) {
    urls.push(m[2]);
  }
  if (!urls.length) return value;

  const parts = await Promise.all(urls.map(async raw => {
    const abs = toAbsoluteHttpUrl(raw);
    if (!abs) return `url("${raw}")`;
    if (isBlockedResourceUrl(abs)) return 'none';
    try {
      const dataUrl = await fetchAsDataURL(abs);
      return `url("${dataUrl}")`;
    } catch (_) {
      return 'none';
    }
  }));

  let i = 0;
  return value.replace(urlRe, () => parts[i++] || 'none');
}

async function inlineBackgroundImages(scopeEl) {
  if (!scopeEl?.querySelectorAll) return;
  let candidates = [];
  try {
    candidates = Array.from(scopeEl.querySelectorAll('[style*="background"],[style*="mask"],[class*="bg-"],[class*="avatar"],[class*="icon"],[class*="source"]'));
  } catch (_) {
    candidates = [];
  }
  candidates.unshift(scopeEl);

  const seen = new Set();
  const nodes = [];
  for (const el of candidates) {
    if (!el || el.nodeType !== 1) continue;
    if (seen.has(el)) continue;
    seen.add(el);
    nodes.push(el);
  }

  await mapLimit(nodes, 4, async el => {
    let cs = null;
    try { cs = getComputedStyle(el); } catch (_) { cs = null; }
    if (!cs) return;

    const bg = cs.backgroundImage;
    if (bg && bg !== 'none' && bg.indexOf('url(') >= 0) {
      const nextBg = await replaceCssUrlsWithDataUrls(bg);
      if (nextBg && nextBg !== bg) el.style.backgroundImage = nextBg;
    }

    const mask = cs.maskImage || cs.webkitMaskImage;
    if (mask && mask !== 'none' && mask.indexOf('url(') >= 0) {
      const nextMask = await replaceCssUrlsWithDataUrls(mask);
      if (nextMask && nextMask !== mask) {
        el.style.maskImage = nextMask;
        el.style.webkitMaskImage = nextMask;
      }
    }
  });
}

async function ensureFontEmbedCss(h2i, scopeNode, renderCtx) {
  if (!renderCtx) return null;
  if (renderCtx.fontEmbedCssResolved) return renderCtx.fontEmbedCSS || null;
  renderCtx.fontEmbedCssResolved = true;
  if (typeof h2i.getFontEmbedCSS !== 'function') return null;
  try {
    renderCtx.fontEmbedCSS = await h2i.getFontEmbedCSS(scopeNode);
  } catch (_) {
    renderCtx.fontEmbedCSS = null;
  }
  return renderCtx.fontEmbedCSS || null;
}

async function renderWithHtmlToImage(clonedRoot, width, height, backgroundColor, scaleCap, renderCtx) {
  const h2i = await ensureHtmlToImageReady();
  const fontEmbedCSS = await ensureFontEmbedCss(h2i, clonedRoot, renderCtx);
  const baseOptions = {
    width,
    height,
    pixelRatio: resolvePixelRatio(width, height, scaleCap),
    cacheBust: false,
    imagePlaceholder: TRANSPARENT_PIXEL,
    backgroundColor: normalizeBackgroundColor(backgroundColor),
    preferredFontFormat: 'woff2',
    ...(fontEmbedCSS ? { fontEmbedCSS } : {}),
    filter: node => {
      const el = node;
      if (!el || !el.tagName) return true;
      if (el.tagName === 'SCRIPT' || el.tagName === 'STYLE') return false;
      return true;
    }
  };

  const renderOnce = async options => {
    if (typeof h2i.toBlob === 'function') {
      const blob = await h2i.toBlob(clonedRoot, options);
      if (blob) return blob;
    }

    if (typeof h2i.toPng === 'function') {
      const dataUrl = await h2i.toPng(clonedRoot, options);
      if (dataUrl) return dataURLToBlob(dataUrl);
    }

    if (typeof h2i.toCanvas === 'function') {
      const canvas = await h2i.toCanvas(clonedRoot, options);
      if (canvas && typeof canvas.toBlob === 'function') {
        const blob = await new Promise(resolve => {
          try { canvas.toBlob(resolve, 'image/png'); } catch (_) { resolve(null); }
        });
        if (blob) return blob;
      }
    }
    return null;
  };

  const first = await renderOnce(baseOptions);
  if (first) return first;

  const fallback = await renderOnce({
    ...baseOptions,
    skipFonts: true,
    fontEmbedCSS: ''
  });
  if (fallback) return fallback;

  throw new Error('html-to-image failed to generate PNG blob');
}

export async function renderConversationRootToBlob(sourceRoot, options = {}) {
  const reportProgress = createProgressReporter(options?.onProgress);
  reportProgress(1, '准备导出内容…');
  await waitForFontsReady();
  reportProgress(3, '等待页面稳定…');
  await waitForFrames(2);
  reportProgress(6, '开始渲染…');

  async function captureOnce({ prepareResources }) {
    let offscreenRoot = null;
    try {
      const cloned = createOffscreenCaptureClone(sourceRoot);
      offscreenRoot = cloned.offscreenRoot;
      const clonedRoot = cloned.clonedRoot;
      const renderCtx = { fontEmbedCssResolved: false, fontEmbedCSS: null };

      if (prepareResources) {
        reportProgress(10, '兼容模式：处理资源…');
        try { await deCrossOriginAllImages(clonedRoot); } catch (_) { }
        try { await inlineBackgroundImages(clonedRoot); } catch (_) { }
        await waitForFrames();
      }

      const rect = clonedRoot.getBoundingClientRect();
      const width = Math.max(1, Math.ceil(rect.width || clonedRoot.clientWidth || sourceRoot.clientWidth || 800));
      const height = Math.max(1, Math.ceil(clonedRoot.scrollHeight || rect.height || sourceRoot.scrollHeight || sourceRoot.clientHeight || 1));
      const bg = getPageBackgroundColor();
      const fullScale = computeCaptureScale(width, height);
      const widthOnlyScale = computeCaptureScale(width, 1);
      const adaptiveScaleCap = computeAdaptiveScaleCap(width, height, widthOnlyScale);
      const segmentScale = Math.min(widthOnlyScale, adaptiveScaleCap);
      const shouldSegment = fullScale + 0.001 < segmentScale;

      if (!shouldSegment) {
        reportProgress(24, '渲染图像…');
        const blob = await renderWithHtmlToImage(clonedRoot, width, height, bg, adaptiveScaleCap, renderCtx);
        reportProgress(88, '渲染完成');
        return [blob];
      }

      const segmentRoot = document.createElement('div');
      segmentRoot.style.width = `${width}px`;
      segmentRoot.style.maxWidth = `${width}px`;
      segmentRoot.style.minWidth = `${width}px`;
      segmentRoot.style.overflow = 'hidden';
      segmentRoot.style.position = 'relative';
      segmentRoot.style.boxSizing = 'border-box';
      segmentRoot.style.background = normalizeBackgroundColor(bg) || 'transparent';

      if (clonedRoot.parentNode) clonedRoot.parentNode.replaceChild(segmentRoot, clonedRoot);
      segmentRoot.appendChild(clonedRoot);
      clonedRoot.style.transformOrigin = 'top left';

      const maxByDim = Math.max(1, Math.floor(MAX_CAPTURE_DIMENSION / Math.max(1, segmentScale)));
      const byTargetCount = Math.max(1, Math.ceil(height / TARGET_SEGMENT_COUNT));
      const byPixelBudget = Math.max(
        1,
        Math.floor(MAX_PIXELS_PER_SEGMENT / Math.max(1, width * segmentScale * segmentScale))
      );
      const plannedHeight = Math.max(
        MIN_SEGMENT_CSS_HEIGHT,
        Math.min(MAX_SEGMENT_CSS_HEIGHT, maxByDim, byTargetCount, byPixelBudget)
      );
      const estimatedSegments = Math.max(1, Math.ceil(height / plannedHeight));
      const blobs = [];
      let offset = 0;
      let guard = 0;

      while (offset < height) {
        guard++;
        if (guard > MAX_CAPTURE_SEGMENTS) throw new Error('Too many capture segments');
        const currentSeg = blobs.length + 1;
        const segBase = 20 + Math.round(((currentSeg - 1) / estimatedSegments) * 62);
        reportProgress(segBase, `渲染分段 ${currentSeg}/${estimatedSegments}…`);

        let partHeight = Math.min(plannedHeight, Math.max(1, height - offset));
        let partBlob = null;
        let attempt = 0;

        while (!partBlob) {
          attempt++;
          if (attempt > MAX_SEGMENT_CAPTURE_ATTEMPTS) throw new Error('Segment capture failed');

          segmentRoot.style.height = `${partHeight}px`;
          clonedRoot.style.transform = `translateY(-${offset}px)`;
          await waitForFrames();

          try {
            partBlob = await renderWithHtmlToImage(segmentRoot, width, partHeight, bg, adaptiveScaleCap, renderCtx);
          } catch (err) {
            const nextHeight = Math.floor(partHeight * SEGMENT_RETRY_SCALE);
            if (nextHeight < MIN_SEGMENT_RETRY_HEIGHT) throw err;
            partHeight = nextHeight;
          }
        }

        blobs.push(partBlob);
        offset += partHeight;
        const segDone = 20 + Math.round((Math.min(currentSeg, estimatedSegments) / estimatedSegments) * 62);
        reportProgress(segDone, `已完成分段 ${Math.min(currentSeg, estimatedSegments)}/${estimatedSegments}`);
        await yieldToMainThread();
      }

      reportProgress(88, '分段渲染完成');
      return blobs;
    } finally {
      if (offscreenRoot?.parentNode) offscreenRoot.remove();
    }
  }

  try {
    return await captureOnce({ prepareResources: false });
  } catch (firstErr) {
    console.warn('[latex-copy] 快速渲染失败，回退到资源内联模式:', firstErr);
    reportProgress(8, '快速路径失败，切换兼容模式…');
    return await captureOnce({ prepareResources: true });
  }
}
