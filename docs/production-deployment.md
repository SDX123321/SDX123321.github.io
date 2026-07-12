# Production deployment

## Release inputs

- Build the immutable API and web images from `Dockerfile.api` and `Dockerfile.web`.
- Pushing a semantic version tag such as `v2.1.0` publishes both images to GHCR through `.github/workflows/release.yml`.
- Copy `.env.production.example` to a secret store and replace every placeholder. Never commit the resulting file.
- Provision PostgreSQL 16 with pgvector, Redis 7, persistent material storage, and a reachable Ollama service.
- Back up PostgreSQL before applying a release. The API and `npm run db:migrate` both apply tracked SQLx migrations idempotently.

## Docker Compose

```bash
cp .env.production.example .env
docker compose build
docker compose up -d
curl --fail http://127.0.0.1:8787/health/ready
```

The compose stack exposes the application on port 8080, Prometheus on 9090, and Grafana on 3000. Restrict the latter two at the firewall or reverse proxy.

## Kubernetes

1. Publish both images and replace the image names in `deploy/k8s/api.yaml` and `deploy/k8s/web.yaml`.
2. Update host names in `configmap.yaml` and `ingress.yaml`.
3. Create `exam-review-secrets` from the organization secret manager using `secret.example.yaml` as the key list.
4. Ensure the cluster provides the `ReadOnlyMany` materials PVC, ingress controller, TLS secret, database, Redis, and Ollama.
5. Apply the manifests, excluding the example secret.

```bash
kubectl apply -f deploy/k8s/namespace.yaml
kubectl apply -f deploy/k8s/configmap.yaml
kubectl apply -f deploy/k8s/api.yaml -f deploy/k8s/web.yaml -f deploy/k8s/ingress.yaml
kubectl -n exam-review rollout status deployment/exam-review-api
```

`/health/live` is process liveness. `/health/ready` verifies PostgreSQL before accepting traffic. `/metrics` is scraped by Prometheus directly or through the optional ServiceMonitor.

## Migration and rollback

Migrations live in `server-rs/migrations` and are recorded by SQLx in `_sqlx_migrations`. The legacy startup schema bootstrap remains temporarily for compatibility; every new schema change must be a numbered migration.

For rollback, restore the database backup if a migration is not backward compatible, deploy the prior image pair, and activate the previous embedding generation from the administrator interface. Do not delete the previous vector generation until the release observation window has ended.

## Operations

- Alerts: readiness unavailable for 2 minutes, API error rate above 1%, P95 above 500 ms, no active embedding generation, or a stalled index job.
- Logs: collect stdout/stderr with the deployment platform and redact credentials and document contents.
- Backups: daily PostgreSQL backups plus material-storage snapshots; test restoration quarterly.
- Ollama: pin model names, verify embedding dimensions after changes, and keep the previous model available during index rebuild.
- Release gate: CI green, migration backup complete, OpenAPI lint clean, smoke load test within thresholds, and rollback owner assigned.
