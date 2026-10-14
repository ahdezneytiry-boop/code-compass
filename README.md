# 知码 · 读懂 AI 写的项目

**v0.4.0 项目阅读室**。给已经拿到 AI 代码、却不知道从哪儿看的人：打开项目 → 看全貌 → 一次读一小段。代码和白话解释并排显示。

先在 VS Code 搜索 **知码：读懂 AI 写的项目**。已经打开项目时直接点“带我读第一段”；否则点“打开 AI 代码文件夹”。

完整操作见 **docs/读懂AI代码-从这里开始.md**。本地结构导读无需 AI 密钥；复杂业务含义仍需结合需求核实。

## 我是第一次使用

推荐下载 **知码-0.4.0-新手使用包.zip**，右键“全部解压缩”，双击 **01-install.cmd**。在打开的窗口里点“安装知码”，成功后点“打开练习”。

找不到 VS Code 时，安装助手会指向官方下载页；不用输入命令，不需要安装 Python、Node.js 或数据库。双击 **先读我.html** 可以看到完整步骤；**常见词白话表.html** 可以搜索词语。

如果安装助手被系统限制，打开 VS Code 扩展页 → `…` → **从 VSIX 安装…** → 选择 `code-compass-zh-0.4.0.vsix`。随后用“文件 → 打开文件夹”打开使用包里的“练习项目”。

## 打开后做什么

点 **知码：读懂 AI 写的项目** → **打开 AI 代码文件夹** → **带我读第一段**。

- 左边：文件与推荐阅读顺序。
- 中间：真实代码片段，可以打开原文件对照。
- 右边：白话步骤、输入输出和必要的词语解释。
- 看不懂时：复制当前片段的提问，到常用 AI 中继续问。

支持 Python、HTML、JavaScript、TypeScript、React JSX / TSX；CSS、JSON、Markdown 辅助阅读。还有项目引用关系、阅读进度、备份恢复与旧版练习入口。

## 目前的边界

尚未提供运行沙盒、AI 对话、代码地图或团队同步。健康提示是规则检查的候选，不保证找出所有问题。自动修改只处理少量明确的冒号遗漏。新 API 与规范数据库是开发设计，尚未在插件中启用。

笔记保存在当前工作区，不改源码。移动项目或换电脑前，搜索“知码：备份我的笔记”；到新位置打开代码文件夹，再搜索“知码：从备份恢复笔记”。备份包含笔记与选中的代码片段，不包含完整项目或修复历史。恢复需要相同的子文件夹结构；缺失文件会跳过并说明，原备份仍保留。

## 我要继续开发

需要 Node.js 22.12+ 与 npm（只针对开发者）：

```powershell
npm install
npm run check
npm test
npm run build
```

用 VS Code 打开本项目，按 F5 启动示例扩展宿主。`npm run watch` 用于持续编译；`npm run package` 生成 VSIX。当前贡献 API 对照 VS Code 1.85 类型编译；真实宿主测试版本见 test-results/integration.json，最低版本尚需单独实测。

项目提供 pnpm-lock.yaml；锁定依赖可使用 pnpm install --frozen-lockfile。实际测试还包括 `node --test test/contracts.cjs`（设计契约）与 `node scripts/test-vscode.mjs`（独立 VS Code 测试窗口）。界面测试脚本需要 Playwright，通过 PLAYWRIGHT_MODULE 指定其安装位置。

v0.3 的实际存储与恢复协议见 `docs/笔记备份与冲突-v0.3.md`。

文档入口：`docs/界面与使用流程-v2.1.md`、`docs/技术修订-v2.1.md`、`docs/数据模型说明.md`、`docs/schema-v2.sql`、`docs/API说明.md`、`docs/openapi-v1.json`、`docs/开发任务与验收.md`。也可双击使用包中的 **开发者文档.html** 阅读。

原 v0.1 使用方式保存在 docs/development-v0.1.md，仅作历史参考。
