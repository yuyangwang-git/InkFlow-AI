## One-Click Copy ChatGPT Formulas & Export Conversations as Images

This is a **Tampermonkey userscript**. After installation, you can use it on ChatGPT, Gemini, and other supported websites to:

- ✅ **Double-click to copy formulas** (supports **Word equations / LaTeX**)
- ✅ **Export conversations as high-resolution PNG images with one click** (currently ChatGPT only)

**No registration required. No configuration needed. Install and use immediately.**

### Key Features

#### 1) Copy as Word Equation

![Word Equation Demo](https://raw.githubusercontent.com/yuyangwang-git/InkFlow-AI/refs/heads/main/img/word.gif)

#### 2) Copy as LaTeX

![LaTeX Copy Demo](https://raw.githubusercontent.com/yuyangwang-git/InkFlow-AI/refs/heads/main/img/latex.gif)

#### 3) Export Conversation as PNG

![Export PNG Demo](https://raw.githubusercontent.com/yuyangwang-git/InkFlow-AI/refs/heads/main/img/save.gif)

### Installation

Greasy Fork installation link: 👉 [Click to Install](https://greasyfork.org/zh-CN/scripts/566889)

#### Installation Steps

1. Install the browser extension **Tampermonkey**
2. Open the installation link above
3. Click **“Install this script”**
4. Refresh any supported website to start using it

### Supported Websites

Currently supported:

- `chatgpt.com`
- `gemini.google.com`
- `deepseek.com`
- `wikipedia.org`
- `zhihu.com`
- `stackexchange.com`

> Conversation image export is currently supported only for ChatGPT. Support for more platforms will be added in future updates.

### How to Use

#### Copy Formulas (Word / LaTeX)

1. Open a supported website (e.g., ChatGPT)
2. Select the copy mode in the bottom-right corner:
   - `Word Equation`: Copies as **MathML** (can be directly pasted into Word equations)
   - `LaTeX | Markdown`: Copies as **LaTeX text**
3. Double-click any formula on the page
4. Paste into Word or a Markdown editor

#### Export ChatGPT Conversation as Image (PNG)

1. Open a ChatGPT conversation page
2. Click the **“Export”** button in the bottom-right corner
3. Wait for the progress bar to complete
4. The PNG image will download automatically

### FAQ

#### Why is exporting sometimes slow?

The longer the conversation and the more code blocks it contains, the longer the rendering time.

> Consider taking a short break while waiting for the export to complete.

#### Why does Word formatting sometimes look inconsistent?

Possible reasons include:

- Differences in formula structures across websites
- Inconsistent MathML compatibility in different versions of Word

### Privacy Statement

- Your conversation content is **never uploaded**
- All operations are performed locally in your browser

### Feedback & Suggestions

If you encounter issues or have feature suggestions, please submit feedback through the project repository’s **Issues** page.

### License

GNU GPL v3  
See the `LICENSE` file for details.