# InkFlow AI 2.0：AI 公式复制与对话导出

面向普通用户的 Tampermonkey 脚本。安装后即可在常见 AI/知识网站中：

- 双击复制公式（Word MathML / LaTeX 两种模式）
- 一键导出 ChatGPT 对话为 PNG

## 安装

- Greasy Fork：  
  [点击安装](https://greasyfork.org/zh-CN/scripts/566889-%E5%A4%8D%E5%88%B6ai%E7%BD%91%E9%A1%B5%E5%85%AC%E5%BC%8F-word-latex)

## 支持网站

- `chatgpt.com`
- `gemini.google.com`
- `deepseek.com`
- `wikipedia.org`
- `zhihu.com`
- `stackexchange.com`

## 使用方式

1. 打开上述任意支持网站。
2. 右下角切换复制模式：
   - `Word 公式`：复制为 MathML（适合粘贴到 Word 公式）
   - `LaTeX | Markdown`：复制为 LaTeX 文本
3. 双击公式完成复制。
4. 在 ChatGPT 页面点击右下角导出按钮，可将当前对话导出为 PNG。

## 2.0 重大更新

- 对话导出升级为高分辨率分段渲染 + 自动拼接
- 导出链路加入进度反馈（百分比 + 阶段提示）
- 导出性能和稳定性优化（超长对话、超大图像更稳）
- 脚本结构重构，后续维护和迭代更稳定

## 常见问题

### 1. 为什么导出慢？

- 对话越长、代码块/表格越多，导出越耗时。
- 2.0 已加入进度显示和分段处理，长对话会明显更稳定。

### 2. 导出时页面有点卡怎么办？

- 导出本质是浏览器内渲染大图，会占用 CPU/GPU。
- 建议关闭其他高负载标签页后再导出。

### 3. 为什么有时 Word 粘贴效果不一致？

- 不同站点公式结构不同，Word 对 MathML 兼容性也有差异。
- 可切换到 LaTeX 模式作为替代。

## 隐私说明

- 脚本不上传你的对话或公式内容到项目服务器。
- 导出与复制都在本地浏览器中完成。

## 反馈

- 问题反馈：请通过项目仓库的 `Issues` 页面提交

## License

GNU GPL v3（详见 `LICENSE`）
