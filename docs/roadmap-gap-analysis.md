# 知码 · PRD 差距分析与 v0.2 / v0.3 路线图

> 版本：v1.0 · 日期：2026-09-22
> 对照基线：产品文档 v2.0（PRD + 技术选型 + API 设计）
> 代码基线：`code-compass-zh` v0.1.0（`dist/extension.js` + `code-compass-zh-0.1.0.vsix`）
> 适用读者：项目维护者、下一阶段开发者

---

## 0. 文档目的

把 PRD v2.0 中的每一项功能与当前 v0.1.0 实际实现逐条对照，明确：

1. 哪些已经做完、做到什么程度；
2. 哪些只做了一半，差在哪；
3. 哪些完全没做，依赖什么前置条件；
4. 据此给出 v0.2、v0.3 两个版本的可执行范围、任务分解与验收标准。

本文档不重复 PRD 原文，只记录差异与决策。

---

## 1. 现状快照（v0.1.0 实际能力）

### 1.1 运行形态

- 纯 VSCode 扩展宿主内运行，**不启动 HTTP 服务**，不依赖 Node 侧 Python 环境。
- 技术栈：TypeScript strict + esbuild 打包为单文件 `dist/extension.js`；WASM 三件套（`tree-sitter.wasm` / `tree-sitter-python.wasm` / `tree-sitter-html.wasm` / `sql-wasm.wasm`）随包分发，离线可用。
- 存储：`sql.js`（SQLite WASM），数据库文件位于 VSCode workspace storage 下的 `notes.sqlite`，多窗口通过 `notes.sqlite.lock` 文件锁 + 原子替换保护。
- 已发布本地 `.vsix`（555 KB），未上架 Marketplace。

### 1.2 已实现能力清单

| 模块 | 实际能力 | 入口 |
| --- | --- | --- |
| 文件树 | 多根工作区；目录懒加载；仅显示 `.py` / `.html`；忽略符号链接与配置目录（node_modules / .git / __pycache__ / venv / dist / build） | `zhima.files` TreeView |
| 文件说明 | 首行 `after` 装饰器显示一句话 summary；overview 面板显示；路径规则推测层级 | `zhima.overview` |
| 术语悬停 | 52 条内置词条（`src/terms.ts`）+ 30 条入门词条（`src/beginnerTerms.ts`）；按语言区分；别名匹配；HoverProvider 卡片；QuickPick 搜索 | Hover / `zhima.terms` |
| 标注 | 选区或当前行添加；查看 / 编辑 / 删除；手动重新绑定；gutter 图标；SQLite 持久化；作者、时间、状态 | `zhima.notes` TreeView / 右键 |
| 锚点 | 选中文本快照 + SHA-256；唯一精确匹配后重定位；多处匹配或文本变化标记 `stale` | `core.relocate()` |
| 职责分区 | Tree-sitter AST 解析；5 类色带（route / business / data / ui / utility）；行号左侧 2px 色条；可选淡色背景；概览标尺；图例面板 | `core.inferLayer()` + `DecorationType` |
| 中文报错 | 11 条正则规则翻译（NameError / TypeError / AttributeError / ValueError / IndexError / KeyError / ImportError / IndentationError / SyntaxError / ZeroDivisionError / unused variable）；接入 Pylance 等外部诊断；支持粘贴报错手动解释 | `zhima.errors` / `zhima.translate` |
| 安全修复 | 仅支持 `else / try / finally` 单独成行缺冒号；AST 验证修复后语法错误数下降；`vscode.diff` 双文档预览；WorkspaceEdit 应用；不自动保存；历史记录（最近 30 条） | `zhima.previewFix` / `applyFix` |
| 健康提示 | 函数过长（默认 50 行）；参数过多（默认 5 个，不计 self/cls）；控制流嵌套过深（默认 4 层）；未使用局部变量（保守候选，跳过动态访问）；函数体精确重复（叶子 token 指纹）；HTML `<img>` 缺 alt | `zhima.health` / DiagnosticCollection |
| 安全边界 | 路径穿越防护（`fs.realpathSync` + `path.relative` 双向校验）；扩展名白名单；文件大小上限（默认 1 MB，可配）；拒绝符号链接越界 | `isAllowedUri()` |
| 新手引导 | Webview onboarding 页（`media/start.html`）；一键复制 examples 为练习项目；分步引导（创建练习 / 打开文件 / 添加标注 / 体验修复） | `zhima.start` |
| 配置 | `zhima.enabled` / `regionBackground` / `functionLines` / `nestingDepth` / `parameterCount` / `maxFileKB` / `ignoreDirectories` | Settings |

### 1.3 明确未实现（README 自述边界）

- 手动分区、自定义分区规则、模糊锚点、全项目相似度分析；
- 代码地图、项目导览路径；
- 沙盒执行（Pyodide）；
- 知识图谱、AI 结对；
- 团队知识库同步；
- Marketplace 发布。

---

## 2. PRD 逐项对照矩阵

状态标记：✅ 已完成 · 🟡 部分完成 · ❌ 未开始 · 🚫 本期不做

### 2.1 统一代码管理（PRD §4.1）

| 编号 | 功能 | 状态 | 差距说明 |
| --- | --- | --- | --- |
| F-01 | 多根工作区 | ✅ | `workspaceFolders` 遍历已支持 |
| F-02 | 文件类型图标 | 🟡 | TreeView 节点已显示"Python / HTML"文本标签，但未按"前端 / 后端 / 配置 / 文档"分类区分图标 |
| F-03 | 文件说明 Banner | ✅ | 首行 `after` 装饰器 |
| F-04 | 右键菜单增强 | 🟡 | 已有：添加标注 / 查看文件说明 / 预览修复；缺：查看调用链、沙盒运行（依赖地图与沙盒） |
| F-05 | 忽略目录 | ✅ | 配置项 `ignoreDirectories` |

### 2.2 代码分区可视化（PRD §4.2）

| 编号 | 功能 | 状态 | 差距说明 |
| --- | --- | --- | --- |
| R-01 | 行号左侧色带 | ✅ | 2px 左边框 |
| R-02 | 行背景淡色块 | ✅ | 可通过 `regionBackground` 开关 |
| R-03 | Gutter 图标 | ❌ | 仅 note 有 gutter 图标；分区类型无图标 |
| R-04 | 图例面板 | ✅ | overview 中折叠显示 |
| R-05 | 按路径 / 正则 / AST 自动匹配 | 🟡 | 路径正则 + AST 路由装饰器已支持；**用户自定义正则规则未开放** |
| R-06 | 手动框选设置分区 | ❌ | 未实现 |

### 2.3 名词提示（PRD §4.3）

| 编号 | 功能 | 状态 | 差距说明 |
| --- | --- | --- | --- |
| T-01 | 内置术语词典 | ✅ | 52 条正式 + 30 条入门词条 |
| T-02 | 悬停卡片式解释 | ✅ | MarkdownString 卡片 |
| T-03 | 术语高亮（可开关） | ❌ | 未实现 |
| T-04 | 术语详情页 + 知识图谱关联 | 🟡 | 详情用 modal 弹窗；无知识图谱 |
| T-05 | 自定义术语 | ❌ | 词典硬编码在 `src/terms.ts`，无用户自定义入口 |
| T-06 | AI 自动解释 | ❌ | 依赖 AI 结对 |

### 2.4 功能标注（PRD §4.4）

| 编号 | 功能 | 状态 | 差距说明 |
| --- | --- | --- | --- |
| A-01 | 在代码行或选区上添加标注 | ✅ | |
| A-02 | 查看 / 编辑 / 删除标注 | ✅ | |
| A-03 | 标注与源码分离存储 | ✅ | SQLite，不写源码 |
| A-04 | 代码变化后检测失效 | ✅ | SHA-256 + 唯一性校验 |
| A-05 | 按文件 / 项目 / 标签筛选 | 🟡 | 仅全量列表；无文件筛选、无标签字段、无搜索 |
| A-06 | 作者、时间、状态 | ✅ | 作者固定为"本地用户"（多用户场景待知识库阶段再做） |

### 2.5 中文报错与修复（PRD §4.5）

| 编号 | 功能 | 状态 | 差距说明 |
| --- | --- | --- | --- |
| E-01 | 中文翻译报错信息 | ✅ | 11 条规则 |
| E-02 | 原因说明 + 影响分析 | 🟡 | 有原因说明，无影响范围分析 |
| E-03 | 一键修复 + diff 预览 | 🟡 | 仅冒号补全；其他类型（缩进、括号配对、引号闭合）未做 |
| E-04 | 修复后侧边栏记录 | ✅ | history 表 |
| E-05 | 修复前影响范围提示 | ❌ | 依赖跨文件分析 |

### 2.6 代码健康度提示（PRD §4.6）

| 编号 | 功能 | 状态 | 差距说明 |
| --- | --- | --- | --- |
| H-01 | 函数过长 | ✅ | |
| H-02 | 嵌套过深 | ✅ | |
| H-03 | 重复代码 | 🟡 | 仅单文件内函数体精确 token 匹配；非跨文件 / 非相似度阈值 |
| H-04 | 未使用变量 | ✅ | 保守候选 |
| H-05 | 过长参数列表 | ✅ | |

### 2.7 代码地图（PRD §4.7）

| 编号 | 功能 | 状态 |
| --- | --- | --- |
| M-01 | 模块依赖图 | ❌ |
| M-02 | 调用关系图 | ❌ |
| M-03 | 数据流图 | ❌ |
| M-04 | 点击模块跳转 | ❌ |
| M-05 | 颜色表示复杂度 / 活跃度 | ❌ |
| M-06 | 高亮当前文件位置 | ❌ |

> 全部依赖 Webview（React Flow）与跨文件索引，v0.3 处理。

### 2.8 项目导览模式（PRD §4.8）

| 编号 | 功能 | 状态 |
| --- | --- | --- |
| G-01 ~ G-05 | 全部 | ❌ |

> 依赖代码地图的节点数据，v0.3 处理。

### 2.9 沙盒执行（PRD §4.9）

| 编号 | 功能 | 状态 |
| --- | --- | --- |
| S-01 ~ S-06 | 全部 | ❌ |

> 依赖 Pyodide 加载与 Worker 隔离，v0.3 处理。注意 `architecture.md` 已指出 PRD 中 `Promise.race` 不能真正终止 Python 执行，必须用 Worker `terminate()`。

### 2.10 知识图谱（PRD §4.10）

| 编号 | 功能 | 状态 |
| --- | --- | --- |
| K-01 ~ K-06 | 全部 | ❌ |

> 依赖向量嵌入与 LLM，v0.3 末或 v0.4 处理。

### 2.11 AI 结对（PRD §4.11）

| 编号 | 功能 | 状态 |
| --- | --- | --- |
| AI-01 ~ AI-06 | 全部 | ❌ |

> v0.3 处理，Ollama 本地优先。

### 2.12 团队知识库（PRD §4.12）

| 编号 | 功能 | 状态 |
| --- | --- | --- |
| KB-01 ~ KB-06 | 全部 | ❌ |

> 依赖 Git 原生 Markdown 存储，v0.4 处理。

---

## 3. 技术栈对照（PRD 规划 vs 实际选择）

| 模块 | PRD v2.0 规划 | v0.1.0 实际 | 决策理由（architecture.md 已述） |
| --- | --- | --- | --- |
| 后端 | NestJS + Fastify，`/v1` REST | 无后端，扩展宿主内直跑 | 暂无跨进程 / 团队访问需求；后续可在服务接口前加 API 层 |
| ORM / DB | SQLite + Prisma | SQLite + sql.js | 避免原生 Node ABI 与 VSCode 内嵌 Node 版本冲突 |
| Webview | React + Vite + Tailwind + Framer Motion + React Flow | 原生 TreeView / Hover / MarkdownString / `vscode.diff` | 键盘导航与主题适配由 VSCode 原生提供；第二阶段地图再引入 React |
| 代码解析 | Tree-sitter Python 绑定 | web-tree-sitter + 随包 WASM | 无需 Python 运行时；同时解析 Python / HTML |
| 沙盒 | Pyodide（浏览器内） | 未实现 | v0.3；需真正 Worker 隔离 |
| 本地 AI | Ollama | 未实现 | v0.3 |
| 流式输出 | SSE | 未实现 | v0.3 AI 阶段 |
| 发布 | vsce + Marketplace | 本地 .vsix | v0.3 末再考虑上架 |

**结论：** v0.1.0 的技术选型是 PRD 的"本地零配置子集"。v0.2 继续在原生架构内打磨；v0.3 才引入 Webview 与可选的本地服务进程。

---

## 4. v0.2 路线图：原生架构内体验完善

### 4.1 版本目标

> **不引入 Webview、不引入后端、不引入 AI。** 把现有原生架构下的 P0 / P1 缺口补完，让 MVP 达到"初学者可独立使用一周不卡壳"的完成度。

### 4.2 范围与任务分解

每个任务标注：**输入 → 输出 → 验收点**。

#### 任务 T1：词典增强（对应 T-03 / T-05）

| 子任务 | 说明 |
| --- | --- |
| T1.1 术语高亮开关 | 新增配置 `zhima.termHighlight`（默认 false）。开启后，对当前文件中命中词典的标识符加淡色背景（独立 `DecorationType`，可随 `enabled` 关闭）。需在 1000 行文件上实测无卡顿（< 100ms）。 |
| T1.2 自定义术语 | 在 SQLite 新增 `terms(id, key, title, definition, example, languages, aliases, createdAt)` 表；提供命令 `zhima.addCustomTerm`（QuickPick + InputBox 流程）；`findTerm()` 先查内置词典，再查用户自定义。自定义词条在术语面板中以"自定义"标签区分。 |
| T1.3 词典合并 | 把 `beginnerTerms.ts` 中的入门词条按 key 合并进正式词典（`source: "builtin-beginner"`），避免两套维护；悬停时按当前文件语言过滤。 |

**验收：**
- [ ] 开启高亮后，52 个内置词在 examples 项目中均有视觉反馈；
- [ ] 用户添加的自定义术语重启 VSCode 后仍存在；
- [ ] 关闭 `zhima.termHighlight` 后无任何残留装饰。

#### 任务 T2：标注系统增强（对应 A-05）

| 子任务 | 说明 |
| --- | --- |
| T2.1 文件筛选 | `zhima.notes` 面板顶部新增"按文件筛选"下拉（当前打开文件 / 全部）；点击文件树节点时，标注面板自动聚焦到该文件。 |
| T2.2 标签 | 标注内容支持 `#tag` 语法解析；面板顶部新增标签过滤行（点击标签筛选）；SQLite `notes.body` 中 JSON 增加 `tags: string[]` 字段，旧数据自动迁移为空数组。 |
| T2.3 排序与搜索 | 标注列表支持按"最近修改 / 文件路径"排序；新增命令 `zhima.searchNotes`（QuickPick 模糊匹配 content）。 |

**验收：**
- [ ] 在 examples 项目中创建 ≥ 5 条标注、打 ≥ 2 个标签，筛选与搜索均正确；
- [ ] 升级数据库后旧标注不丢失。

#### 任务 T3：分区规则增强（对应 R-03 / R-05）

| 子任务 | 说明 |
| --- | --- |
| T3.1 Gutter 类型图标 | 在 `regionTypes` 中为每类分区增加 `gutterIconPath`（用 16×16 SVG，按层类型区分），替代纯色条。 |
| T3.2 用户自定义路径规则 | 新增配置 `zhima.customRegionRules: Array<{ pattern: string; layer: 'route'|'business'|'data'|'ui'|'utility'; description?: string }>`。匹配逻辑在 `inferLayer()` 之前执行，命中即用用户层，否则回落到默认规则。 |

**验收：**
- [ ] 用户配置 `**/services/*.py → business` 后，`examples/backend/auth_service.py` 整文件被标为业务层；
- [ ] 规则优先级正确（用户规则 > AST 路由装饰器 > 路径默认）。

#### 任务 T4：安全修复扩展（对应 E-03）

| 子任务 | 说明 |
| --- | --- |
| T4.1 缩进修复 | 对 `IndentationError: unexpected indent` / `unexpected unindent` 类诊断，提供"对齐到上一级"的窄范围候选（仅在前后行缩进可唯一推断时提供）。 |
| T4.2 括号 / 引号闭合 | 当解析器报告 `ERROR` 节点位于未闭合括号 / 引号位置时，提供补全对应右括号或右引号的候选；仍走"AST 验证语法错误下降 + diff 预览 + 显式应用"协议。 |
| T4.3 影响范围提示 | 在修复预览弹窗中，列出受影响的函数名（基于 AST 包含关系），作为"影响范围"展示，不做跨文件影响分析。 |

**验收：**
- [ ] `examples/practice/missing_colon.py` 与新构造的缩进 / 括号错误用例均能给出候选；
- [ ] 每个候选仍可撤销、不自动保存。

#### 任务 T5：文件索引服务（为 v0.3 地图打基础）

| 子任务 | 说明 |
| --- | --- |
| T5.1 跨文件依赖表 | 在扩展宿主内维护一个内存索引：Python `import` / `from ... import ...` 提取被导入模块；HTML `<script src>` / `<link href>` 提取外部资源。文件保存时增量更新。 |
| T5.2 索引持久化 | 索引写入 SQLite（`file_index(uri, depends_on, kind, updatedAt)`），工作区打开时后台异步重建（不阻塞首屏）。 |
| T5.3 简单"被谁引用"视图 | 在 `zhima.files` 节点右键增加"查看被谁引用"，QuickPick 列出反向依赖；不画图，仅列表。 |

**验收：**
- [ ] 在 examples 项目中，`auth_controller.py` 能看到依赖 `auth_service.py`；
- [ ] 大项目（1000 文件）后台索引不阻塞 UI（用 `setTimeout` 分块处理）。

#### 任务 T6：工程化与质量

| 子任务 | 说明 |
| --- | --- |
| T6.1 单元测试扩充 | `test/core.test.cjs` 增加：分区规则、修复候选、relocate 锚点、translateError 全覆盖，目标行覆盖率 ≥ 80%。 |
| T6.2 集成测试 | 扩展 `scripts/test-vscode.mjs`：自动打开 examples、悬停术语、添加标注、触发修复，断言 UI 元素出现。 |
| T6.3 错误上报 | 所有 `output.appendLine` 集中加前缀 `[zhima]`；新增命令 `zhima.copyDiagnostics` 一键复制日志用于反馈。 |

### 4.3 v0.2 工期估算（单人）

| 阶段 | 工期 |
| --- | --- |
| T1 词典 | 3 天 |
| T2 标注 | 3 天 |
| T3 分区 | 2 天 |
| T4 修复 | 4 天 |
| T5 索引 | 5 天 |
| T6 工程化 | 3 天 |
| 缓冲 / 联调 / 打包 | 2 天 |
| **合计** | **约 3 周** |

### 4.4 v0.2 验收标准

对照 PRD §9 的 MVP 验收，补充：
- [ ] 术语高亮、自定义术语可用；
- [ ] 标注可按文件、标签筛选与搜索；
- [ ] 用户可自定义分区路径规则；
- [ ] 修复候选扩展到缩进 / 括号 / 引号；
- [ ] 跨文件依赖表建立，能查看"被谁引用"；
- [ ] 单元测试与集成测试通过；
- [ ] 打包为 `code-compass-zh-0.2.0.vsix`，在干净 VSCode 1.85+ 上安装后 examples 项目全流程走通。

---

## 5. v0.3 路线图：Webview 架构与可视化能力

### 5.1 版本目标

> **引入 Webview（React + Vite + Tailwind）与可选的本地 Pyodide。** 交付 PRD 第二阶段核心：代码地图、项目导览、沙盒执行、AI 结对。

### 5.2 前置架构工作

#### 任务 W1：Webview 工程骨架

| 子任务 | 说明 |
| --- | --- |
| W1.1 双打包 | 在 esbuild 之外增加 `webview/` 子目录，使用 Vite + React + TypeScript + Tailwind 构建 `dist/webview/index.html` 与 JS bundle。扩展宿主侧用 `vscode.WebviewViewProvider` 加载。 |
| W1.2 通信协议 | 定义 `postMessage` 类型契约（`request / response / event`），扩展宿主与 Webview 之间通过 JSON-RPC 风格消息通信；不在 Webview 中直接访问文件系统。 |
| W1.3 主题适配 | 使用 `@vscode/codicons` 与 CSS 变量（`--vscode-*`），保证暗色 / 亮色模式一致。 |
| W1.4 HMR | 开发时 Webview 指向 Vite dev server，打包时内联资源。 |

**验收：** 能在侧边栏打开一个 React Webview，点击按钮能触发扩展宿主命令并收到回包。

### 5.3 功能任务

#### 任务 T7：代码地图（对应 M-01 / M-02 / M-04 / M-06）

| 子任务 | 说明 |
| --- | --- |
| T7.1 节点数据 | 在 T5 索引基础上，用 Tree-sitter 提取每个文件的顶层函数 / 类作为节点；提取函数调用（同文件内 `identifier(` 形式）作为边。 |
| T7.2 React Flow 渲染 | Webview 中使用 `reactflow` 渲染模块依赖图；节点按层类型着色（复用现有 5 层颜色）；点击节点跳转到对应文件行。 |
| T7.3 当前文件高亮 | 扩展宿主在编辑器切换时通过 `postMessage` 通知 Webview，Webview 高亮对应节点。 |
| T7.4 跨语言链接 | 识别 HTML 中 `fetch("/api/...")` / `axios.post(...)` 路径，与 Python `@app.get("/api/...")` 路由做边关联（PRD §4.7 跨语言链接）。 |

**验收：** examples 项目打开后能看到 `login.html → auth_controller.py → auth_service.py` 的链路图，点击节点跳转正确。

#### 任务 T8：项目导览（对应 G-01 ~ G-05）

| 子任务 | 说明 |
| --- | --- |
| T8.1 核心路径识别 | 启发式规则：找入口（`app.py` / `main.py` / `index.html`）→ 路由层文件 → 业务层文件 → 数据层文件，生成有序步骤列表。 |
| T8.2 导览面板 | 在 Webview 中渲染步骤列表，当前步骤高亮；点击跳转。 |
| T8.3 手动调整 | 用户可拖拽调整步骤顺序、添加 / 删除步骤；导览路径存 SQLite。 |

#### 任务 T9：沙盒执行（对应 S-01 ~ S-06）

| 子任务 | 说明 |
| --- | --- |
| T9.1 Pyodide 加载 | 在 Webview 中按需加载 Pyodide（首次触发时加载，缓存到 IndexedDB）。 |
| T9.2 Worker 隔离 | 把 Pyodide 放在专用 Web Worker 中；超时通过 `worker.terminate()` 真正终止（修正 PRD 中 `Promise.race` 的错误假设）。 |
| T9.3 输入输出 | 右键"沙盒运行"→ Webview 侧栏打开输入框（JSON 参数）→ 捕获 stdout / stderr → 展示结果与耗时。 |
| T9.4 安全边界 | 禁用网络（Pyodide 不加载 `requests` 等网络包；CSP 限制 connect-src）；内存上限通过定期检查 `pyodide.runPython("import sys; ...")` 估算，超阈值终止。 |
| T9.5 HTML 沙盒 | HTML 片段在 Webview 中通过受限 iframe（`sandbox=""` 无 scripts、严格 CSP）渲染。 |

> **重要：** `architecture.md` 已记录 PRD 沙盒方案的三处错误假设（Promise.race、Worker 中 iframe、WASM 不等于禁网）。本任务按修正后的方案实现。

#### 任务 T10：AI 结对（对应 AI-01 ~ AI-03）

| 子任务 | 说明 |
| --- | --- |
| T10.1 配置 | 新增设置：`zhima.ai.provider`（`ollama` / `openai-compat`）、`zhima.ai.endpoint`、`zhima.ai.model`；API Key 存 `SecretStorage`，不写 settings.json。 |
| T10.2 Ollama 接入 | 通过 `http://localhost:11434/api/generate` 调用；默认模型 `qwen2.5-coder:7b`。 |
| T10.3 对话面板 | Webview 侧边栏对话 UI；右键"解释选中代码"自动把代码 + 文件路径 + 语言作为上下文发送。 |
| T10.4 引用依据 | 提示词要求模型引用具体文件与行号；响应中以 Markdown 链接形式给出，点击跳转。 |
| T10.5 隐私确认 | 首次使用弹窗说明"代码将发送到本地 Ollama"；用户确认后才发送；云端模型需单独二次确认。 |

> AI-04 / AI-05 云端兼容在 T10 中预留接口，默认不启用。

### 5.4 v0.3 工期估算（单人）

| 阶段 | 工期 |
| --- | --- |
| W1 Webview 骨架 | 5 天 |
| T7 代码地图 | 7 天 |
| T8 项目导览 | 3 天 |
| T9 沙盒 | 7 天 |
| T10 AI 结对 | 6 天 |
| 缓冲 / 联调 | 4 天 |
| **合计** | **约 5~6 周** |

### 5.5 v0.3 验收标准

- [ ] 侧边栏 React Webview 可加载、主题适配；
- [ ] examples 项目能看到模块依赖图与跨语言调用链路；
- [ ] 项目导览自动生成核心路径，可手动调整；
- [ ] 选中 Python 函数可在沙盒中运行并看到输出；超时与内存上限可触发；
- [ ] 本地 Ollama 在线时，能对选中代码给出带行号引用的解释；
- [ ] 打包为 `code-compass-zh-0.3.0.vsix`，安装体积仍控制在 5 MB 以内（Pyodide 按需加载，不打包进 vsix）。

---

## 6. 明确不做（v0.2 / v0.3 之外）

| 功能 | 计划版本 | 原因 |
| --- | --- | --- |
| 知识图谱（向量 + LLM 摘要） | v0.4 | 依赖 AI 结对稳定后再做；首次索引成本高 |
| 团队知识库（Git 原生 Markdown） | v0.4 | 需要多人使用验证后再设计存储格式 |
| 多语言扩展（JS / TS / Vue / Java / Go） | v0.4+ | 每加一种语言需新增 Tree-sitter WASM 与规则 |
| Marketplace 上架 | v0.3 末评估 | 依赖稳定与文档完善 |
| 完整 Git 客户端 / 终端模拟器 / 多人实时协作 | 永不做 | PRD §3.4 非目标 |

---

## 7. 风险与开放问题

| 风险 | 影响 | 对策 |
| --- | --- | --- |
| Webview 打包体积 | vsix 过大 | Pyodide 不打包进 vsix，首次运行从 CDN / 本地缓存加载；React bundle 用 esbuild 压缩到 < 200 KB |
| 大图性能（React Flow 节点 > 200） | Webview 卡顿 | 节点虚拟化；分层渲染（先画文件级，再展开函数级） |
| Pyodide 首次加载慢（~12 MB） | 用户等待 | 启动时后台预加载；首次显示加载进度条 |
| Ollama 未安装 | AI 功能不可用 | 检测到 Ollama 端点不可达时，明确提示"请先安装 Ollama 并拉取模型"，不静默失败 |
| SQLite 迁移 | 旧用户数据丢失 | 所有 schema 变更走 `PRAGMA user_version` + 迁移脚本；每次启动检查版本号 |
| 跨文件依赖准确性 | 地图误导初学者 | 节点旁标注"自动分析，仅供参考"；不替代实际调用 |
| PRD 中 API 设计（`/v1/...`） | 与本地扩展架构不一致 | v0.2 / v0.3 不实现 REST API；保留设计文档供未来团队版使用。本地功能通过扩展宿主直接调用，不走 HTTP |

### 开放问题（需产品决策）

1. **作者字段：** 当前固定为"本地用户"。团队知识库阶段是否改为读取 Git `user.name`？
2. **导览路径算法：** 启发式规则在结构不规范的项目上可能不准。是否允许用户完全手动创建导览路径？
3. **沙盒网络：** 是否允许用户显式开启"联网模式"（如 `pip install` 少量包）？默认关闭。
4. **AI 模型选择：** 默认推荐 `qwen2.5-coder:7b` 还是 `deepseek-coder:6.7b`？需在真实机器上做一次对比评测。

---

## 8. 附录：建议的目录结构演进

### 8.1 v0.2 结束时

```
src/
  extension.ts          # 入口、命令注册
  core.ts               # Tree-sitter 分析、健康规则、修复、锚点
  terms.ts              # 内置词典（合并 beginnerTerms）
  store.ts              # SQLite（notes / history / terms / file_index）
  onboarding.ts         # 新手引导
  index/
    dependencies.ts     # 跨文件依赖索引（T5）
  rules/
    fixIndent.ts        # T4.1
    fixBracket.ts       # T4.2
test/
  core.test.cjs
  fix.test.cjs
  index.test.cjs
```

### 8.2 v0.3 结束时

```
src/
  extension.ts
  core.ts
  terms.ts
  store.ts
  onboarding.ts
  index/
    dependencies.ts
    callGraph.ts        # T7
  webview/
    provider.ts         # WebviewViewProvider
    protocol.ts         # postMessage 契约
  sandbox/
    pyodideRunner.ts    # T9
    htmlRunner.ts
  ai/
    ollama.ts           # T10
    openaiCompat.ts
webview/                 # Vite + React 子项目
  src/
    panels/
      map/              # React Flow 代码地图
      guide/            # 导览
      chat/             # AI 对话
      sandbox/          # 沙盒输入输出
    components/
```

---

## 9. 一句话总结

> v0.1.0 已经把 PRD 第一阶段的"局部可读"跑通；**v0.2 在不换技术栈的前提下把缺口补成完成品，v0.3 才换 Webview 架构做可视化与智能。** 严格按版本边界交付，不提前引入复杂度。
