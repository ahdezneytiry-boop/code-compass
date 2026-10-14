# API 设计契约 v1（尚未作为 HTTP 服务实现）

**v0.3 补充：** 当前仍没有 HTTP 服务。已实现的备份、恢复和版本冲突是插件本地能力，命令与数据格式见《笔记备份与冲突-v0.3》。以下 OpenAPI 继续作为未来服务草案。

机器可读定义：openapi-v1.json（OpenAPI 3.1）。当前插件 v0.2.0 没有监听端口；安装后不能直接请求这些网址。此契约供后续本地服务适配器开发，不增加当前新手安装步骤。

## 设计约定

- 统一 `/v1`；只监听 `127.0.0.1`，随机端口由启动握手取得。每次启动随机 Bearer Token，通过宿主内部通信交换，不放在网址或普通设置里。默认拒绝浏览器 Origin，Host 必须与本次端口一致，防 DNS rebinding。
- 根目录必须先由宿主文件夹选择器授权；`rootGrantId` / `workspaceGrantId` 只能由这个操作产生。接口不允许提交任意系统绝对路径。所有 ID 查询也必须重新验证所属项目权限，不能仅验证“知道这个 ID”。
- 创建返回 201；后台任务返回 202 与 Job；读取 / 修改返回 200；删除元数据返回 204。删除元数据绝不删除源码。
- 可变资源读取返回 ETag，例如 `"v3"`；PATCH / DELETE 携带 If-Match。缺少前提用 400 明确提示，版本不一致用 412，不能覆盖另一窗口刚改的内容。
- 创建资源、启动任务、应用修复需要 Idempotency-Key。键与调用身份、项目、操作绑定，保存 24h；同键同正文返回原结果，同键不同正文返回 409。
- 列表 limit 默认 50、最大 200；使用不透明 nextCursor，游标绑定筛选条件，稳定排序规则为创建时间与 ID。只要不是全量快照，就必须说明并发变更可能改变后续页。
- 字段名 camelCase，UUID ID，UTC ISO 时间；位置 0 起始、UTF-16、半开区间；展示时行号加一。坐标、片段、偏移和哈希由服务联合校验。
- 请求体默认最大 1 MiB；代码片段最大 32,000 字符；笔记最多 10,000 字符；标签最多 20 个；图搜索最大 10 跳；输出流和 stdout/stderr 必须有总量限制。字符限制不替代字节限制。
- 统一错误：`{error:{code,message,requestId,details:[{field,reason}]}}`。未知内部错误不回显服务器路径、令牌或源码。

## 按模块阅读

| 模块 | 主要路径 | 说明 |
| --- | --- | --- |
| 工作区 / 项目 | /workspaces、/projects、/projects/{projectId}/roots | 增删改查元数据；目录授权来自宿主 |
| 文件 | /projects/{projectId}/tree、/files、/files/{fileId}/content | 懒加载目录；只读受授权源码；取消原始方案的通用 PUT /files |
| 词典 / 笔记 | /terms、/annotations、/annotations/{id}/reanchor、/annotations/check-stale | 内置词只读；笔记内容修改与重新定位分开 |
| 规则 / 健康 | /region-rules、/health/issues、/health/scan | 规则验证；检查任务可取消；结果绑定文件哈希 |
| 任务 | /jobs/{jobId}、/jobs/{jobId}/cancel | 所有长任务使用同一状态机 |
| 地图 / 导览 | /maps、/maps/build、/guides | 节点与边分别分页；步骤批量更新要原子执行 |
| 知识图谱 | /graph/search、/graph/entities/{id}/neighbors、/graph/path | 每个推断保留依据与置信度 |
| 报错 / 修复 | /diagnostics/translate、/diagnostics/{id}/fix-preview、/fix-previews/{id}/apply | 不再使用 action=apply 的含糊通用接口；预览与批准绑定 |
| 沙盒 | /sandbox/runs、/sandbox/runs/{id}/result | 仅编排宿主隔离运行器；能力未实现则 501；不在服务端直接执行用户代码 |
| AI / 对话 | /ai/explain、/ai/explain/stream、/chat/sessions | 用户同意绑定精确内容；默认关闭；模型结果必须引用证据 |
| 知识库 | /kb/entries、/kb/sync | 只写受限知识目录；Git 同步冲突返回 409，不自动覆盖 |
| 能力 | /capabilities | 客户端按实际能力隐藏或禁用入口 |

## 示例：创建一条笔记

以下 ID 和哈希仅为格式示意，需要替换为真实项目、文件和内容，不能照抄调用。

```http
POST /v1/annotations
Authorization: Bearer <本次启动令牌>
Idempotency-Key: note-create-unique-key-001
Content-Type: application/json
```

正文包括 projectId、fileId、range、startOffset、endOffset、selectedText、codeHash、fileHash、content、tags。服务先校验文件是否在授权范围，再确认片段与内容版本一致，然后保存笔记并返回 ID、版本与 ETag。源码完全不变。

## 后台任务与流

状态机：queued → running → succeeded / failed / cancelled。完成态不可倒退。取消 queued 任务可立即生效；取消 running 任务要等实际执行器停止后才报告 cancelled。进度未知时允许保持原进度，不捏造百分比。

AI 流使用 POST + fetch 读取 text/event-stream（原生 EventSource 不支持此 POST 正文）。事件包括 meta、delta、citation、error、done；15 秒发送注释心跳；断开连接取消请求。不自动重连并重复发送代码；用户重新发起必须再次验证授权、预算和内容版本。

## 应用修复的边界

预览响应含精确 edits、baseHash、documentVersion 与过期时间。只有宿主的修改对比 UI 可以发放 approvalId；它绑定此预览并一次性使用。应用接口必须同时验证批准、文件内容、编辑器版本。通过 WorkspaceEdit 写入未保存文档，可撤销；返回 saved=false。API 客户端不能自己生成“用户同意”的布尔值来绕过预览。

## 仍需实施的契约细节

SQL 中有些不可变分析实体不存 version：API 的 version 使用分析批次修订号，由适配器返回，不能伪造支持 If-Match 的编辑能力。可变资源使用持久化 version。请求 / 响应模型与 SQL 并非机械一比一，映射层负责组合坐标、证据、关联数据与只读字段。

新 HTTP 层必须完成鉴权、资源归属、分页、幂等、限流、取消和错误一致性集成测试后才开启；当前的结构校验只能证明契约格式正确。
