# ADR-0003: Batched writes for service_logs

**Date:** 2025-12-01  
**Status:** Accepted

## Context

Every API request emitted one `INSERT` into `service_logs`. Under moderate load (50 req/s) this meant 50 single-row INSERTs per second — enough to create measurable write latency and connection pool pressure on the shared PostgreSQL instance.

## Decision

Buffer log rows in process memory and flush them as a single multi-row `INSERT` either when the buffer reaches `BATCH_MAX_SIZE` (default 100) or after `BATCH_FLUSH_MS` (default 1000 ms), whichever comes first.

```
[request] → push to pendingLogs[] → scheduleFlush()
                                         ↓ (after 1 s or 100 rows)
                                   INSERT (batch) INTO service_logs
```

A SIGTERM handler calls `flush()` so the last batch is persisted before the process exits.

Both constants are overridable via `SERVICE_LOG_BATCH_SIZE` and `SERVICE_LOG_FLUSH_MS` env vars.

## Consequences

**Positive:**
- 50–100× fewer INSERTs under normal load
- No added latency on the hot request path (timer-based)

**Negative:**
- Up to one batch of logs (≤ 100 rows, ≤ 1 s) can be lost on a hard crash
- Test code bypasses batching to keep assertions synchronous
