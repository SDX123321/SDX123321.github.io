# Engineering delivery evidence

Release candidate: **2.1.0**, prepared 2026-07-12.

## Delivery matrix

| Requirement | Evidence | Verification |
| --- | --- | --- |
| Container packaging | `Dockerfile.api`, `Dockerfile.web`, `.dockerignore`, `docker-compose.yml` | GitHub Actions builds both images; Docker is not installed on the delivery workstation |
| CI/CD | `.github/workflows/ci.yml` plus the existing VPS workflow | PR and branch checks cover frontend, Rust, OpenAPI, migrations, coverage, and images |
| OpenAPI/Swagger | `server-rs/openapi.yaml`, `/api/docs`, `/api/docs/openapi.yaml` | Redocly lint passes |
| Database migrations | `server-rs/migrations`, `npm run db:migrate`, SQLx startup runner | Baseline migration applied successfully to local PostgreSQL |
| Test coverage | `npm run test:coverage`, CI coverage artifacts | 12 frontend tests pass; 35.61% statements and 31.88% branches |
| Backend tests | Rust unit tests and CI artifact workflow | 7 tests pass |
| Performance test | `perf/k6-smoke.js`, `scripts/perf-smoke.mjs`, `docs/performance-report.md` | Local optimized build: 47,380 requests, 0 errors, P95 4.58 ms |
| Metrics | `/metrics`, `deploy/prometheus.yml`, provisioned Grafana dashboard | Prometheus exposition queried successfully from the release binary |
| Production deployment | `docs/production-deployment.md`, `.env.production.example` | Compose and Kubernetes procedures include backup and rollback |
| Health and probes | `/health/live`, `/health/ready`, Docker health checks, Kubernetes probes | Both health routes returned success from release 2.1.0 |
| Release record | `CHANGELOG.md`, package and Rust versions set to 2.1.0 | Semantic version and dated change record are tracked |
| Review history | `codex/production-delivery` branch with separate feature and delivery commits | Branch can be reviewed as a pull request against `main` |

## Commands reproduced

```text
npm run lint                    passed with 1 existing warning
npm run typecheck               passed
npm run test:coverage           12/12 passed
npm run build                   passed
cargo test --all-targets        7/7 passed
npm run db:migrate              passed
redocly lint                    passed
npm run perf:smoke              passed, zero errors
```

Rust Clippy currently reports eight non-fatal style warnings in pre-existing feature code. CI exposes them but does not yet fail the pipeline on warnings. The frontend lint has one unused-function warning. These are recorded technical debt rather than hidden from the release evidence.

## Traceability

- OpenAPI documents the core operational, knowledge, graph, indexing, and Ollama administration interfaces.
- SQLx records applied migrations in `_sqlx_migrations`; the compatibility `CREATE/ALTER` bootstrap remains temporarily while legacy databases transition.
- CI uploads coverage reports so each run retains machine-readable evidence instead of relying on console claims.
- Prometheus tracks API availability, database pool state, active embedding generations, and indexing jobs; Grafana is provisioned from version-controlled files.
- The previous embedding generation and prior application image form the operational rollback pair described in the deployment guide.
