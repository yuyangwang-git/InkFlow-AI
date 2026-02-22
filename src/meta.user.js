// ==UserScript==
// @name         ChatGPT 公式一键复制 / 对话保存为图片
// @name:en      ChatGPT One-Click Formula Copy / Save Conversation as Image
// @namespace    https://github.com/yuyangwang-git/InkFlow-AI
// @version      2.0.0
// @license      GPL-3.0-or-later
// @description  双击公式即可快速复制，支持直接粘贴到 Word 或以 LaTeX 格式使用；还可以把整段 ChatGPT 对话保存为高清 PNG 图片，方便分享和保存。如有问题，可前往 GitHub 提交反馈。
// @description:en  Double-click a formula to quickly copy it. It supports direct pasting into Word or using it in LaTeX format. You can also save the entire ChatGPT conversation as a high-resolution PNG image for easy sharing and archiving. If you have any questions, please visit GitHub to submit feedback.
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
