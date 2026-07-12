# Changelog

All notable changes follow Keep a Changelog. Releases use semantic versioning.

## [2.1.0] - 2026-07-12

### Added

- Shared high-school and university knowledge workspaces with versioned RAG indexing.
- Runtime Ollama configuration, subject knowledge graphs, suggested questions, and question completeness filtering.
- Docker and Kubernetes production packaging with health probes.
- SQLx migrations, OpenAPI/Swagger documentation, Prometheus metrics, Grafana provisioning, CI coverage artifacts, and repeatable load tests.

### Changed

- Rust API is the primary backend and supports configurable bind hosts.
- Embeddings are generation-versioned so rebuilds no longer remove the active index.

### Security

- Production secrets are represented only by templates and injected at runtime.
- Global Ollama runtime changes remain administrator-only and audited.
