export const FORMULA_SELECTOR = '[data-latex], span.katex';

export function getKaTeXLatex(el) {
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

function getHostname(url) {
  try {
    return new URL(url, window.location.href).hostname.toLowerCase();
  } catch (_) {
    return '';
  }
}

function isSameOrSubdomain(hostname, domain) {
  return hostname === domain || hostname.endsWith(`.${domain}`);
}

export function getTarget(url) {
  const host = getHostname(url);
  if (!host) return null;
  return targetEntries.find(([key]) => isSameOrSubdomain(host, key))?.[1] || null;
}

export function extractExistingMathML(el) {
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
