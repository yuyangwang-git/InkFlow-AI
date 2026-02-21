// ==UserScript==
// @name         InkFlow AI 2.0（公式复制 + 对话导出）
// @namespace    https://github.com/yuyangwang-git/InkFlow-AI
// @version      2.0.0
// @license      GPL-3.0-or-later
// @description  双击复制网页公式（Word MathML/LaTeX）；支持 ChatGPT 对话高分辨率导出。问题反馈请前往 GitHub Issues。
// @description:en  Double-click to copy formulas (Word MathML/LaTeX); supports high-resolution ChatGPT export. For feedback, please use GitHub Issues.
// @author       Yuyang Wang
// @match        *://*.chatgpt.com/*
// @match        *://*.gemini.google.com/*
// @match        *://*.deepseek.com/*
// @match        *://*.wikipedia.org/*
// @match        *://*.zhihu.com/*
// @match        *://*.stackexchange.com/*
// @require      https://cdn.jsdelivr.net/npm/katex@0.16.11/dist/katex.min.js
// @require      https://cdn.jsdelivr.net/npm/html-to-image@1.11.13/dist/html-to-image.min.js
// @grant        GM_xmlhttpRequest
// @connect      *
// @supportURL   https://github.com/yuyangwang-git/InkFlow-AI/issues
// @homepageURL  https://github.com/yuyangwang-git/InkFlow-AI
// @updateURL    https://raw.githubusercontent.com/yuyangwang-git/InkFlow-AI/main/main.user.js
// @downloadURL  https://raw.githubusercontent.com/yuyangwang-git/InkFlow-AI/main/main.user.js
// ==/UserScript==
