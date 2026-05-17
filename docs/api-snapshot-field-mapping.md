# Texas API → `api_snapshots` field mapping

## `Agent/getAgentAllWallets` → `raw_wallets` + `balance`

**Endpoint:** `POST /Agent/getAgentAllWallets`  
**Code:** [`TexasSyncService.fetchAgentWallet`](../src/lib/services/TexasSyncService.ts)

| `api_snapshots` column | JSON path | Status |
|------------------------|-----------|--------|
| `balance` | `result[0].balance` | Confirmed (route comment) |
| `currency_code` | `result[0].currencyCode` | Confirmed |
| `raw_wallets` | `result[0]` | Full object |

## `Statistics/getSubAgentStatistics` → `raw_statistics` + aggregates

**Endpoint:** `POST /Statistics/getSubAgentStatistics`  
**Polling:** `start` / `limit` / `filter.currency = multi` — see [`TexasSyncService.fetchAllSubAgentStatistics`](../src/lib/services/TexasSyncService.ts)  
**Schema template:** [`docs/samples/getSubAgentStatistics.sample.json`](samples/getSubAgentStatistics.sample.json)

| `api_snapshots` column | JSON path | Status |
|------------------------|-----------|--------|
| `total_deposit` | `result.records[].totalDeposit` or `result.total.totalDeposit` | Inferred — verify live |
| `total_withdraw` | `result.records[].totalWithdraw` or `result.total.totalWithdraw` | Inferred — verify live |
| `ngr` | `result.records[].ngr` or `result.total.ngr` | Inferred — verify live |
| `raw_statistics` | merged paginated `result` object | Stored by sync service |

### Per-role resolution ([`mapSubAgentStatistics`](../src/lib/texas/statistics-mapper.ts))

| Role | Logic |
|------|--------|
| `player` / `master` | Row where `affiliateId === users.texas_affiliate_id` |
| `super_master` | Prefer `result.total` footer; else sum all `records` |

### Field mapping configuration

All JSON keys are defined in **[`src/lib/texas/texas-mapping.config.ts`](../src/lib/texas/texas-mapping.config.ts)**.  
Change that file only when live keys differ — `statistics-mapper.ts` reads from it via `field-resolver.ts`.

## Delta fields (Accounting Engine)

| Ledger field | Formula |
|--------------|---------|
| `tebat` | `current.total_deposit - previous.total_deposit` |
| `suhoubat` | `current.total_withdraw - previous.total_withdraw` |
| `al_farq` | `tebat - suhoubat` |
| `al_harq` | `current.ngr` (confirm delta vs absolute with business) |

## Session / cron

See [`docs/api-client-session.md`](api-client-session.md).
