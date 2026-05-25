# Texas API → `api_snapshots` field mapping

## `Agent/getAgentAllWallets` → `raw_wallets` + `balance`

**Endpoint:** `POST /Agent/getAgentAllWallets`  
**Code:** [`TexasSyncService.fetchAgentWallet`](../src/lib/services/TexasSyncService.ts)

| `api_snapshots` column | JSON path | Status |
|------------------------|-----------|--------|
| `balance` | `result[0].balance` | Confirmed |
| `currency_code` | `result[0].currencyCode` | Confirmed |
| `raw_wallets` | `result[0]` | Full object |

**Note:** The wallet also contains `currentWallet`, `availability`, `credit`, `creditLine`, `bonus` — these are position/credit metadata, NOT the agent's financial balance. The `balance` field is the correct source.

## `Statistics/getSubAgentStatistics` → `raw_statistics` + aggregates

**Endpoint:** `POST /Statistics/getSubAgentStatistics`  
**Polling:** `start` / `limit` / `filter.currency = multi`  
**Sample:** [`docs/samples/getSubAgentStatistics.sample.json`](samples/getSubAgentStatistics.sample.json)

| `api_snapshots` column | JSON path | Status |
|------------------------|-----------|--------|
| `total_deposit` | `result.records[].totalDeposit` or `result.total.totalDeposit` | Confirmed |
| `total_withdraw` | `result.records[].totalWithdraw` or `result.total.totalWithdraw` | Confirmed |
| `ngr` | `result.records[].ngr` or `result.total.ngr` | Confirmed |
| `raw_statistics` | merged paginated `result` object | Stored by sync service |

### Per-role resolution ([`mapSubAgentStatistics`](../src/lib/texas/statistics-mapper.ts))

| Role | Logic |
|------|--------|
| `player` / `master` | Single row where `affiliateId === users.texas_affiliate_id` |
| `super_master` | Prefer `result.total` footer; else sum all `records` |

### CRITICAL: Standard vs tree-grid fields

Some Texas API responses include both financial columns AND tree-grid columns on the same row:

| Field | Meaning | Use for |
|-------|---------|---------|
| `totalDeposit` | Total deposits (financial) | ✅ **tebat** |
| `totalWithdraw` | Total withdrawals (financial) | ✅ **suhoubat** |
| `ngr` | Net gaming revenue | ✅ **ngr** |
| `left` | Tree-grid layout position | ❌ NOT a financial field |
| `right` | Tree-grid layout position | ❌ NOT a financial field |
| `bonus` | Bonus/promotional credit | ❌ NOT ngr |
| `creditLine` | Credit line limit | ❌ NOT ngr |

The field resolver uses `left`/`right` ONLY as a last-resort fallback when standard financial fields are completely absent from the row. See [`field-resolver.ts`](../src/lib/texas/field-resolver.ts).

### Field mapping configuration

All JSON keys are defined in **[`src/lib/texas/texas-mapping.config.ts`](../src/lib/texas/texas-mapping.config.ts)**.  
Change that file only when live keys differ — `statistics-mapper.ts` reads from it via `field-resolver.ts`.

## Daily ledger calculation (Accounting Engine)

| Ledger field | Formula | Source |
|--------------|---------|--------|
| `tebat` | `current.total_deposit - previous.total_deposit` | Texas API snapshot delta |
| `suhoubat` | `current.total_withdraw - previous.total_withdraw` | Texas API snapshot delta |
| `al_farq` | `tebat - suhoubat` | Computed |
| `al_harq` | `= al_farq` | Business rule: burn equals net difference |
| `wasel_menho` | Sum of confirmed outgoing WhatsApp transactions | WhatsApp confirmed (source='whatsapp') |
| `wasel_eleih` | Sum of confirmed incoming WhatsApp transactions | WhatsApp confirmed (source='whatsapp') |
| `baqi_qadim` | Previous day's `al_nihai` | Previous closed ledger |
| `al_nihai` | `al_farq + wasel_eleih - wasel_menho + baqi_qadim` | Computed |

### Result orientation

| Condition | Arabic | Status |
|-----------|--------|--------|
| `al_nihai >= 0` | له ✅ | Credit — system owes the agent |
| `al_nihai < 0` | عليه 🛑 | Debit — agent owes the system |

## Session / cron

See [`docs/api-client-session.md`](api-client-session.md).
