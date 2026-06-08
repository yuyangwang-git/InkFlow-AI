## 一键复制 ChatGPT 公式 & 导出对话图片

这是一个 **Tampermonkey（油猴）脚本**。安装后，你可以在 ChatGPT、Gemini 等网站中：

- ✅ **双击复制公式**（支持 **Word 公式 / LaTeX**）
- ✅ **一键导出对话为高清 PNG 图片** （暂只支持 ChatGPT）

**无需注册，无需配置，安装即可使用。**

### 功能亮点

#### 1) Word 公式复制

![Word 公式复制演示](https://raw.githubusercontent.com/yuyangwang-git/InkFlow-AI/refs/heads/main/img/word.gif)

#### 2) LaTeX 复制

![LaTeX 复制演示](https://raw.githubusercontent.com/yuyangwang-git/InkFlow-AI/refs/heads/main/img/latex.gif)

#### 3) 对话导出 PNG

![对话导出 PNG 演示](https://raw.githubusercontent.com/yuyangwang-git/InkFlow-AI/refs/heads/main/img/save.gif)

### 安装方法

Greasy Fork 安装地址：👉 [点击安装](https://greasyfork.org/zh-CN/scripts/566889)

#### 安装步骤

1. 安装浏览器扩展 **Tampermonkey（油猴）**
2. 打开上方安装链接
3. 点击 **“安装此脚本”**
4. 刷新支持的网站页面即可使用

### 支持网站

目前支持以下网站：

- `chatgpt.com`
- `gemini.google.com`
- `deepseek.com`
- `wikipedia.org`
- `zhihu.com`
- `stackexchange.com`

对话图片导出暂只支持 ChatGPT，后续会持续扩展。

### 使用方法

#### 复制公式（Word / LaTeX）

1. 打开支持的网站（例如 ChatGPT）
2. 在页面右下角选择复制模式：
   - `Word 公式`：复制为 **MathML**（可直接粘贴到 Word 公式中）
   - `LaTeX | Markdown`：复制为 **LaTeX 文本**
3. 双击页面中的公式
4. 粘贴到 Word / Markdown 编辑器即可

#### 导出 ChatGPT 对话为图片（PNG）

1. 打开 ChatGPT 对话页面
2. 点击右下角 **“导出”** 按钮
3. 等待进度条完成
4. 自动下载 PNG 图片

### 常见问题（FAQ）

#### 为什么导出比较慢？

对话越长、代码块越多，渲染时间通常越久。

> 建议摸鱼以等待导出完成。

#### 为什么 Word 粘贴效果偶尔不一致？

可能原因包括：

- 不同网站的公式结构存在差异
- Word 对 MathML 的兼容性表现不完全一致

### 隐私说明

- 不会上传你的对话内容
- 所有操作均在本地浏览器中完成

### 反馈与建议

如遇到问题或有功能建议，请通过项目仓库的 **Issues** 页面提交反馈。

### License

GNU GPL v3  
详见 `LICENSE` 文件。
