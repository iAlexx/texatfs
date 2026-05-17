# Texas API session model (`@/app/utils/api-client`)

## How sign-in works

1. **Unauthenticated** `POST /User/signIn` via the base `api` axios instance (`TEXAS_API_BASE_URL`).
2. Texas responds with `Set-Cookie` headers on success (`result.type === 0`, `result.message === "dashboard"`).
3. [`toToken()`](../src/app/utils/token-manager.ts) JSON-serializes the cookie array → base64url **Bearer token**.
4. Route handlers call [`getServerApiClient(request)`](../src/app/utils/api-client.ts), which reads `Authorization: Bearer <token>` and rebuilds the `Cookie` header for upstream requests.

## Background worker (cron / TexasSyncService)

Workers **cannot** use `getServerApiClient(request)` because there is no incoming `Request`. Use:

```typescript
import { TexasSessionService } from "@/lib/services/TexasSessionService";

const session = new TexasSessionService();
const client = await session.getClient({ username, password });
// same Cookie-based session as the Mini App proxy routes
```

- [`token-cache.ts`](../src/app/utils/token-cache.ts) caches tokens in memory for ~55 minutes per username/password.
- Call `session.refresh(credentials)` after `401` from Texas.
- For multi-tenant cron, store one credential set per `public.users` row (vault / encrypted column) — not in git.

## Environment

| Variable | Purpose |
|----------|---------|
| `TEXAS_API_BASE_URL` | Texas dashboard API origin |
| `TEXAS_SYNC_USERNAME` / `TEXAS_SYNC_PASSWORD` | Default cron credentials (optional) |

## Security

- Never log Bearer tokens or Set-Cookie headers.
- Rotate credentials if exposed; invalidate cache via `invalidateToken()`.
