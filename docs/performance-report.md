# Performance test baseline

## Workload

The repository provides `perf/k6-smoke.js` for a repeatable one-minute API workload and `npm run perf:smoke` for environments without k6. The workload covers liveness, database readiness, and domain metadata with concurrent users.

Default acceptance criteria:

- HTTP error rate below 1%.
- P95 response time below 500 ms.
- P99 response time below 1,000 ms.

## Reproduce

```bash
k6 run -e BASE_URL=https://learn.example.com -e VUS=20 -e DURATION=1m perf/k6-smoke.js
PERF_BASE_URL=http://127.0.0.1:8787 PERF_DURATION_SECONDS=60 PERF_CONCURRENCY=20 npm run perf:smoke
```

Store the k6 JSON summary as a CI or release artifact. Results are environment-specific and must include image version, host size, PostgreSQL size, dataset size, Ollama model, and test timestamp. A local baseline is appended during delivery verification; it is evidence of smoke behavior, not a production capacity guarantee.

## Local delivery baseline

Run at 2026-07-12 22:17 CST against the optimized Rust 2.1.0 binary on Windows, local PostgreSQL, 10 concurrent workers, and a 10-second duration:

| Metric | Result |
| --- | ---: |
| Requests | 47,380 |
| Throughput | 4,738 requests/second |
| Errors | 0 (0%) |
| P50 | 1.49 ms |
| P95 | 4.58 ms |
| P99 | 15.92 ms |
| Maximum | 445.31 ms |

The tested routes were `/health/live`, `/health/ready`, and `/api/domains`. RAG generation and Ollama inference are intentionally excluded because their capacity depends on the selected model and accelerator; production acceptance must run a separate model-specific scenario.
