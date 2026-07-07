# Rust API 服务

`server-rs` 使用 `axum + tokio + sqlx + deadpool-redis + tower-http` 重写原 Express API，默认监听 `127.0.0.1:8787`，保持前端 `VITE_API_BASE_URL || http://127.0.0.1:8787` 的访问方式不变。

## 环境变量

- `DATABASE_URL`：PostgreSQL 连接串，默认 `postgres://postgres:postgres@127.0.0.1:5432/exam_review`。
- `API_PORT`：API 端口，默认 `8787`。
- `CLIENT_ORIGIN`：允许携带 cookie 的前端源，默认 `http://127.0.0.1:4173`。
- `REDIS_URL`：可选 Redis 缓存地址。Redis 不可用时会静默降级到 PostgreSQL。
- `LOCAL_MODEL_URL`：题解补全 CLI 的 OpenAI-compatible 服务地址，默认 `http://127.0.0.1:11434/v1`。
- `LOCAL_MODEL_NAME`：题解补全 CLI 的模型名，默认 `local-gaokao-solver`。

## 常用命令

```bash
npm run api
npm run api:js
npm run gaokao:enrich -- --dry-run --limit 20
npm run gaokao:enrich -- --limit 50
```

`api` 和 `api:rust` 启动 Rust 服务；`api:js` 保留原 Express 服务作为短期回退。`gaokao:enrich` 会遍历已有标准答案但缺少有效题解的题目，生成分步骤解析或标记为 `needs_review`。

## 兼容接口

- `GET /api/gaokao/summary`
- `GET /api/gaokao/subjects`
- `GET /api/gaokao/questions`
- `POST /api/gaokao/attempts`
- `GET /api/gaokao/weaknesses`
- `POST /api/auth/register`
- `POST /api/auth/login`
- `POST /api/auth/logout`
- `GET /api/me`
- `GET /api/me/stats`
- `POST /api/me/import-local`
- `POST /api/study/event`

`/api/gaokao/questions` 支持 `subject`、`year`、`difficulty`、`quality`、`sourceType`、`hasSolution`、`solutionStatus`、`cursor`、`limit`，返回 `{ questions, pageInfo }`，并保留顶层 `questions` 字段兼容旧前端解析。
