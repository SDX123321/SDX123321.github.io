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

## Route loading and high-school overview

The November 23, 2026 local comparison used production builds, baseline commit `60849b3`, and Chromium at 1440 × 900. Each route started in a fresh browser context with the service worker disabled. The table counts same-origin JavaScript and CSS fetched by the initial route, compressed by the same local server with gzip.

| Route | Baseline | Updated | Reduction | JS/CSS requests |
| --- | ---: | ---: | ---: | ---: |
| Home `/` | 87,485 B | 56,005 B | 36.0% | 3 → 3 |
| Probability `/courses/probability` | 206,420 B | 88,347 B | 57.2% | 6 → 14 |

The home page loads its resource catalog when readers approach it or choose the resource link. The high-school and knowledge-workspace styles load with their shells. Course pages download the selected course's content and navigation, with the view and content loader starting in parallel. The probability route trades more requests for less transferred code. Real-user page-load timing requires a separate measurement that includes third-party assets and network conditions.

The browser checks covered the eight course URLs, home search, resuming the most recent course, the resource catalog, theme switching, mobile layout, stale search responses, and an offline home reload. The service worker served a repeated hashed asset without reaching the server and left API responses outside its cache. Browser API checks used mocked responses.

`GET /api/high-school/overview` combines six SQL statements into one. The material totals and subject counts share a single scan, and the aggregate and latest index run use the same database snapshot. The old and new queries matched on an empty database and a fixture of 30,000 materials, 60,000 chunks, 23 subjects and two index runs. `EXPLAIN ANALYZE` on the fixture showed one `materials` scan. This check used an embedded PostgreSQL instance. A load test of the deployed API is still pending.

On November 26, 2026, the merged production build transferred 57,927 B of gzip JavaScript and CSS on the home route (3 requests) and 90,014 B on the probability route (14 requests). These values are 33.8% and 56.4% smaller than the `60849b3` baseline above. This run used a fresh Chromium context per route at 1440 × 900, blocked service workers, and counted same-origin assets. The browser run also verified course deep links, theme switching, mobile navigation, the resource catalog and visitor-key renewal with mocked API responses.
