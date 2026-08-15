// @vitest-environment jsdom

import { beforeEach, describe, expect, it } from 'vitest';
import { getTarget } from '../src/site-targets.js';

describe('站点公式适配', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('从 ChatGPT 当前公式节点读取 LaTeX', () => {
    const latex = String.raw`\frac{a}{b}`;
    document.body.innerHTML = `
      <span data-math-source="${latex}" aria-label="${latex}">
        <span class="katex"><span class="katex-html">a/b</span></span>
      </span>
    `;

    const target = getTarget('https://chatgpt.com/c/example');
    const formula = document.querySelector(target.elementSelector);
    const renderedChild = formula.querySelector('.katex');

    expect(target.elementSelector).toBe('[data-math-source]');
    expect(target.getLatex(formula)).toBe(latex);
    expect(target.getLatex(renderedChild)).toBe(latex);
  });

  it('KaTeX 站点仍从 annotation 读取 LaTeX', () => {
    const latex = String.raw`x^2 + y^2`;
    document.body.innerHTML = `
      <span class="katex">
        <span class="katex-mathml">
          <math><semantics><annotation encoding="application/x-tex">${latex}</annotation></semantics></math>
        </span>
      </span>
    `;

    const target = getTarget('https://gemini.google.com/app/example');
    const formula = document.querySelector(target.elementSelector);

    expect(target.getLatex(formula)).toBe(latex);
  });
});
