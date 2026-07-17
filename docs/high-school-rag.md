# 高中资料库与本地 RAG

> 兼容说明：高中资料现已作为通用知识空间的 `high-school` 资料域保留。新代码优先使用
> `/api/knowledge/*` 与 `/workspace/high-school`；本页旧接口在迁移期继续可用。

## 通用知识空间

- `GET /api/domains` 返回高中、大学资料域及课程结构。
- `GET /api/knowledge/materials?domainId=...` 查询通用资料目录。
- `POST /api/knowledge/search` 在指定资料域检索切片。
- `GET /api/knowledge/graphs/current?domainId=...` 返回已发布共享图谱和当前账号的个人覆盖层。
- `npm run materials:index:university` 将 `src/content` 中的大学 HTML 课程纳入索引。
- 管理员通过 `/api/admin/knowledge/graph-runs` 生成草稿，审核后调用发布接口；学生只能修改自己的掌握度、收藏与笔记。

高中版入口为 `/high-school`，大学版继续使用 `/`。高中资料目录、下载、语义检索和问答由 Rust API 提供。

## 本机依赖

- PostgreSQL 17，数据库需提供 pgvector。向量列维度会按当前 Embedding 模型的实际输出自动调整；超过 2000 维时使用精确检索而不创建 HNSW 索引。
- LibreOffice，用于把旧 `.doc` 临时转换为 DOCX 后提取正文。
- Ollama，并安装 `bge-m3` 与 `qwen3:4b`。

环境变量：

```dotenv
MATERIAL_ROOT=C:\Users\zzz\Desktop\参考资料
MATERIAL_CACHE_DIR=C:\Users\zzz\AppData\Local\exam-review-materials
LIBREOFFICE_PATH=C:\Program Files\LibreOffice\program\soffice.exe
OLLAMA_URL=http://127.0.0.1:11434
EMBEDDING_MODEL=bge-m3
CHAT_MODEL=qwen3:4b
LIBREOFFICE_TIMEOUT_MS=30000
MATERIAL_RUN_STALE_MINUTES=5
AI_CONFIG_SECRET=replace-with-a-long-random-secret
```

Windows 下可按 pgvector 官方 `Makefile.win` 使用 Visual Studio x64 开发环境编译。常规安装后在数据库执行：

```sql
CREATE EXTENSION IF NOT EXISTS vector;
```

API 在 pgvector 不可用时仍能启动，资料目录、下载和关键词检索保持可用；`GET /api/high-school/overview` 的 `vectorEnabled` 会返回 `false`。

## 索引命令

```bash
# 只统计文件，不写数据库
npm run materials:index -- --dry-run

# 建立目录、哈希和去重关系，不抽取正文
npm run materials:index -- --catalog-only

# 增量抽取、切片并生成向量
npm run materials:index

# 重试此前抽取失败的文件
npm run materials:index -- --retry-failed
```

索引器排除 `.lnk`，音频、图片和 ZIP 只进入下载目录。DOC/DOCX/PDF 会切分为约 1,000 字、重叠 150 字的片段。相同 SHA-256 内容共享一个资料实体，原始路径保存在 `material_paths`。

每次运行写入 `material_index_runs`，可通过管理员接口查看状态：

```text
POST /api/admin/high-school/index-runs
GET  /api/admin/high-school/index-runs/:id
```

## 权限与接口

- 资料目录和混合检索公开。
- 原文件下载与生成式问答需要登录。
- 下载接口仅接受资料 UUID，并验证最终规范路径仍位于 `MATERIAL_ROOT`。
- 问答每用户每分钟最多 10 次、单用户单并发、全局两个生成任务。
- `POST /api/high-school/rag/answer` 返回 `application/x-ndjson`，事件类型为 `sources`、`delta`、`done` 或 `error`。
- `GET /api/high-school/rag/sources/:id` 登录后返回可预览的引用原文片段。
- `GET|POST /api/me/ai-providers` 管理 DeepSeek/OpenAI 兼容回答模型；API Key 使用 AES-256-GCM 加密保存且不会回传。
- `DELETE /api/me/ai-providers/:id` 删除个人模型配置。
- `GET /api/admin/overview` 返回账户、AI 用量、上传与风险概览。
- `GET /api/admin/accounts` 返回账户用量和活跃会话列表。
- `POST /api/admin/accounts/:id/risk` 暂停、恢复、锁定账号或撤销会话。
- `POST /api/admin/materials/upload` 上传不超过 50 MB 的资料并自动执行单文件索引。

管理员页面位于 `/high-school/admin`。新注册账户始终为 `student`；管理员角色只能通过受控数据库运维授予。连续五次登录失败会锁定账户 15 分钟，暂停账号会立即撤销全部会话。

## 验证

```bash
npm test
npm run typecheck
npm run lint
npm run build
cargo test --manifest-path server-rs/Cargo.toml
```
