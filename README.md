# 期末复习笔记

面向大学期末考试与江苏高考真题复习的互动学习站点。在线地址：[web.zzzzcx.com](https://web.zzzzcx.com)。

## 技术栈

- Vue 3 + Composition API
- TypeScript（严格模式）
- Vue Router 4
- Vite 6
- Lucide 图标
- KaTeX / MathJax 数学公式渲染
- 原生 CSS 设计系统，支持深色与浅色主题

## 主要功能

- 九门课程的结构化笔记与响应式章节导航
- 课程、章节和知识点搜索
- PDF、PPT、DOCX 等复习资料筛选与访问
- 江苏高考 2020–2026 真题筛选、答案展开和完成进度
- 操作系统调度、页面置换、银行家算法与磁盘调度模拟
- 算法课程章节测验与知识闪卡
- 课程自测、错题本、阅读进度和返回上次课程
- 深色 / 浅色主题、移动端目录、键盘快捷键与无障碍焦点状态

学习状态继续使用原有 `localStorage` 键，升级后不会主动清除主题、错题或测验进度。

## 本地开发

```bash
pnpm install
pnpm dev
```

开发服务器默认运行在 `http://localhost:5173`。

## 质量检查与构建

```bash
pnpm typecheck
pnpm lint
pnpm build
pnpm preview
```

生产文件输出至 `dist/`。项目部署到 GitHub Pages，路由回退由 `public/404.html` 处理。

## 目录说明

```text
src/
├─ components/       通用展示组件
├─ composables/      Vue 组合式状态
├─ content/          从旧站迁移的课程正文 HTML
├─ data/             课程、资料与高考题库数据
├─ features/         测验、资料库等业务功能
├─ router/           Vue Router 配置
├─ styles/           设计系统与课程样式
└─ views/            首页、课程与高考题库页面
```

`courses/` 中保留课程正文的历史交互脚本和原始页面，供内容兼容及迁移校对使用；线上应用入口为 `src/main.ts`。

## 开发约定

- UI 与内容使用简体中文（`zh-CN`）。
- 新组件使用 `.vue`，业务逻辑优先使用 TypeScript。
- 图标统一使用 Lucide，不使用 emoji 作为界面图标。
- 可点击元素必须具备 hover、键盘焦点和明确的可访问名称。
- 修改后至少运行 `pnpm typecheck && pnpm lint && pnpm build`。
- 默认只在本地提交，不主动推送远端。

# Exam Review Knowledge Workspace

The Rust API and Vue application provide shared high-school and university learning spaces, versioned RAG indexing, AI-assisted practice, and subject knowledge graphs.

## Engineering delivery

- Local production stack: `docker compose up --build`
- API documentation: `/api/docs` (Swagger UI) and `server-rs/openapi.yaml`
- Health and observability: `/health/live`, `/health/ready`, `/metrics`, Prometheus and Grafana provisioning
- Database migrations: `npm run db:migrate`
- Verification: `npm run lint`, `npm run typecheck`, `npm run test:coverage`, and Rust checks in `.github/workflows/ci.yml`
- Load baseline: `npm run perf:smoke` or `k6 run perf/k6-smoke.js`

See [Production deployment](docs/production-deployment.md), [Performance baseline](docs/performance-report.md), and [Changelog](CHANGELOG.md) for release evidence and operating procedures.
