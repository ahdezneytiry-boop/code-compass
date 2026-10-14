# MVP 技术说明与原文档落地差异

## 架构

```text
VS Code Extension Host
  ├─ extension.ts：TreeView / Hover / Decorations / Diagnostics / WorkspaceEdit
  ├─ core.ts：Tree-sitter Python / HTML、健康规则、锚点、错误翻译、窄范围修复
  ├─ terms.ts：按语言区分的本地词典
  └─ store.ts：sql.js SQLite + 原子替换 + 写锁
       └─ VS Code workspace storage / notes.sqlite
```

插件不会启动 HTTP 服务。此阶段全在本地扩展宿主运行，读写均采用 VS Code 或 Node API。优先完成第一阶段验收闭环，不要求初学者安装和管理 NestJS 服务。

## 与产品 v2.0 的取舍

| 原方案 | MVP 实现 | 原因 / 后续 |
| --- | --- | --- |
| NestJS + Fastify + `/v1` API | 插件内本地服务模块 | 暂无跨进程 / 团队访问需求；后续可在服务接口前加 API 层 |
| SQLite + Prisma | SQLite + sql.js | 不依赖原生 Node ABI，避免 VS Code 内嵌 Node 与系统 Node 版本冲突；后续可迁移数据库层 |
| React Webview | 原生 TreeView、Markdown Hover、编辑器装饰、原生 diff | 键盘导航与主题适配由 VS Code 提供；第二阶段地图再引入 React Flow |
| Tree-sitter Python 绑定 | web-tree-sitter + 随包 WASM | 无需 Python 运行时；同时解析 Python / HTML |
| CommentController | TreeView + gutter 标记 | 满足标注闭环；未来可增加原生线程式评论 |
| 模糊锚点迁移 | 唯一文本匹配 + 哈希校验 | 对含糊匹配保持失效，避免错误关联 |
| 学习模式隐藏原生面板 | 切换插件自身装饰和诊断 | 不修改用户已有 IDE 布局 |
| 全量索引性能目标 | 当前文件分析 + 文件树懒加载 | 本版不声称达到 1000 文件 5 秒全量索引指标 |

## 分析与性能边界

文档变化使用 350 ms 防抖。每个打开文档按版本缓存分析结果，关闭后释放缓存；Tree-sitter 树在单次分析结束后释放。当前实现做单文件重新解析，不虚称已实现 Tree-sitter 增量编辑。1 MB 为默认大小上限，可配置。未来需要把大文件分析放入 Worker，避免复杂文件阻塞扩展宿主。

函数长度、参数与嵌套通过 AST 判断；未使用局部变量只报告单次出现的简单赋值，忽略下划线名称，并在动态局部访问时跳过检查；这不是全量数据流分析。重复检测比较函数体的叶子 token，保留字符串值，过滤注释和空白，只报告足够长的精确重复候选。

分区优先级：文件层默认规则 → 顶层 AST 分区覆盖。导入为工具层；框架路由装饰器按 AST 节点中的模式识别；其余函数 / 类作为业务层候选。不会以颜色评价代码质量。

## 持久化

`notes` 表：`id TEXT PRIMARY KEY, uri TEXT, body TEXT`，URI 有索引。JSON body 包含 ID、URI、UTF-16 起止偏移、文本快照、SHA-256、内容、作者、时间和状态。偏移通过 VS Code `offsetAt/positionAt` 互转，匹配 VS Code 的字符串坐标语义。`history` 表保存最近修复记录。

每次写入：独占文件锁 → 重新加载最新数据库 → SQLite 事务 → 导出临时文件 → 原子重命名 → 释放锁。多个窗口不会各自用旧数据库快照覆盖所有记录。锁冲突会明确提示重试；异常进程退出留下的锁需要关闭相关窗口后手动清理，避免擅自打破其他窗口的锁。

未保存代码只在内存重算标注位置；已保存代码才更新持久化锚点。标注内容变更可独立持久化。打开文件时复核锚点；已删除、改名且未打开的文件不会在后台全量扫描，旧标注保留供用户整理。工作区搬迁没有自动迁移。

## 修复协议

1. 只产生非常窄的候选（独立 `else / try / finally` 行缺少冒号）。
2. 跳过字符串和注释；用 AST 检查修改后语法错误数量是否减少。
3. 显示两份不可编辑的文档快照做 diff。
4. 用户点“应用修复”后再次检查原文件 URI、工作区范围、版本和内容。
5. 用 WorkspaceEdit 应用，可撤销，不自动保存；写入修复记录。

语法改善并不证明业务正确，因此始终保留预览和显式应用。未知报错原样保留，规则无法匹配时不编造原因。

## 原文档中需在第二阶段修正的假设

- `Promise.race()` 只能结束等待，不能终止正在执行的 Python。真正的执行超时需要独立 Worker，并在超时后 terminate Worker。
- 普通 Web Worker 无 DOM，不能在 Worker 中创建 iframe。HTML 预览需在 Webview 中使用受限 iframe 和严格 CSP。
- WASM 本身不等于禁网；Pyodide 与 JavaScript 桥接可触达宿主暴露的能力。禁网必须在宿主能力、CSP 和执行边界中逐项验证。
- 轮询内存不等于严格内存上限，不能保证运行时不会在两次采样之间超限。需要选定可实际强制限制资源的执行方案。
- 文档列出的 `treesitter_analyze_file` 等名称不是本项目所依赖的 Tree-sitter 标准接口；本版使用 `Parser.init`、语言 WASM 加载和 AST 节点遍历。

这些功能尚未开放，插件不会将普通执行包装成“安全沙盒”。

## 后续建议顺序

1. 扩展词典、可配置职责规则和诊断规则，完善人工测试与无障碍验收。
2. 文件索引服务与跨文件调用关系，再接入 React Flow 地图和导览路径。
3. 定义可测试的沙盒边界后实现 Worker 执行、超时中止与资源约束。
4. 本地模型适配、显式代码发送确认、SecretStorage、输出引用。
5. 在团队协作确有需要时增加 API 层和 Git 知识库同步。

官方参考：

- [VS Code Extension API](https://code.visualstudio.com/api/references/vscode-api)
- [Tree View](https://code.visualstudio.com/api/extension-guides/tree-view)
- [VSIX 打包](https://code.visualstudio.com/api/working-with-extensions/publishing-extension)
- [Tree-sitter Web bindings](https://github.com/tree-sitter/tree-sitter/tree/master/lib/binding_web)
- [sql.js](https://github.com/sql-js/sql.js)
