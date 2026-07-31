# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

"期末复习笔记" — 大学期末复习 + 高考题库学习平台。全栈应用，前端 Vue3 + TypeScript (Vite)，后端 Rust API (axum + sqlx)，PostgreSQL 16 (pgvector) + Redis 7.4，含 Prometheus/Grafana 监控。当前在 `refactor/arch-optimization` 分支上从零构建架构。

**注意：** 仓库根部保留了一批纯静态学习材料（`courses/`、`files/`、`theme.css`、`sw.js` 等），属于早期版本遗留。主代码是 Vue3 + Rust。

## 运行命令

```bash
npm run dev                # Vite 前端 dev server
npm run api                # Rust API (cargo run --manifest-path server-rs/Cargo.toml)
npm run build              # Vite 构建
npm run typecheck          # vue-tsc --noEmit
npm run test               # vitest run
npm run db:migrate         # cargo run --bin migrate (sqlx migrate)
npm run gaokao:enrich      # 题解补全 CLI (--dry-run 试跑)
```

Docker 一键环境：`docker compose up` 启动 postgres(pgvector) + redis + api + web + prometheus + grafana。环境变量见 `docker-compose.yml` 与 `server-rs/README.md`。

## 后端架构 (`server-rs/`)

- **`src/main.rs`** — axum 路由注册、`AppState`（PgPool + RedisPool + Ollama 配置）、schema 引导
- **`src/types.rs`** — 共享类型：`AppState`、`ApiError`、请求/响应 DTO、`CACHE_SECONDS`（60s Redis TTL）
- **`src/auth.rs`** — 注册/登录/会话 + API key 握手 + 学习进度快照
- **`src/gaokao.rs`** — 高考题查询、答题记录、薄弱点聚合、RAG 搜索/导入
- **`src/high_school.rs`** — 资料库（materials/chunks）、混合检索（关键词 ILIKE + 向量 kNN + rerank）
- **`src/indexer.rs`** — 资料索引流水线：文本抽取 → chunk → Ollama 嵌入 → generation 管理
- **`src/knowledge.rs`** / **`src/learning.rs`** — 知识图谱生成/浏览、对话、用户偏好
- **`src/admin.rs`** — 管理端：账号风控、运行时 Ollama 配置、资料上传

**关键模式：**
- 缓存：读路径先查 Redis（`cache_get`），miss 才查 PG 并 `cache_set`（TTL 60s）。Redis 不可用静默降级 PG。
- 错误：所有 handler 返回 `Result<_, ApiError>`，`sqlx::Error` 自动转 500。
- 向量检索：HNSW 索引 + `<=>` 余弦距离；`material_chunk_embeddings` 按 generation 版本化，活跃 generation 用 `is_active` 标记。
- 会话：session cookie → `token_hash` 查 `sessions JOIN users`；`visitor_api_keys` 走 Redis 加速。

## 数据库约定 (PostgreSQL + pgvector)

**迁移：** `server-rs/migrations/`，sqlx 自动运行，命名 `YYYYMMDDNNNN_name.sql`，必须可重复执行（`IF NOT EXISTS`）。

**性能红线（改数据库代码前必读）：**
- `study_snapshots` 的写必须用**单条原子 UPSERT**（`ON CONFLICT DO UPDATE` + GREATEST/加法语义），不要读-改-写。前端高频上报页面停留事件，并发读改写会丢计数。
- 嵌入写入用 **UNNEST 批量**（一次 `INSERT ... SELECT UNNEST(...)` / `UPDATE ... FROM UNNEST`），禁止逐行 INSERT/UPDATE。
- 全文/模糊搜索依赖 **pg_trgm GIN 索引**（`file_name`、`chunk_text`、`source_path`），新加 ILIKE 搜索列必须配套索引。
- 大表列表查询（`gaokao_questions`）用 OFFSET 分页，注意 `ORDER BY` 与复合索引匹配。
- 热门聚合接口（summary/subjects/rag summary）走 60s Redis 缓存。

**表规模注意：** `visitor_api_keys`、`auth_events`、`sessions`、`study_events` 无自动清理，长期运行会持续增长。

## 前端 (`src/`)

Vue3 + TypeScript + Pinia + vue-router。`src/main.ts` 入口。功能模块在 `src/views/`（按域分：high-school、knowledge、admin 等）、`src/features/high-school/`、`src/stores/`。KaTeX（数学渲染）、three.js/3d-force-graph（知识图谱可视化）等依赖走 npm。

## 环境变量（核心）

- `DATABASE_URL` — PostgreSQL，默认 `postgres://postgres:postgres@127.0.0.1:5432/exam_review`
- `REDIS_URL` — 可选 Redis，缺省降级 PG
- `CLIENT_ORIGIN` — CORS 允许源
- `OLLAMA_URL` / `EMBEDDING_MODEL` / `CHAT_MODEL` / `RERANK_URL` — 本地嵌入/对话/重排模型（Ollama）
- `MATERIAL_ROOT` — 资料库根目录
- `DATABASE_POOL_SIZE` — 连接池大小，默认 10
- `AI_CONFIG_SECRET` — AI 配置加密密钥

## Git 工作流

- 当前分支 `refactor/arch-optimization` 有大量**未提交/未跟踪的 WIP 文件**（`auth.rs`、`gaokao.rs`、`types.rs`、`feishu.rs` 是 untracked 新文件）。
- 本地默认 `git add -A && git commit`，**不 push** 除非明确要求。

## 遗留静态材料

`courses/`、`files/`、`theme.css`、`sw.js`、`ux.js` 等是早期纯静态版残留。图片托管在 Cloudflare R2（`https://r2.zzzzcx.cn`，bucket `web`，凭据在 `.env`），R2 上传流程见 `scripts/upload-r2.py`。这些在迁移完成前保持可访问，但新功能不要往里加。
