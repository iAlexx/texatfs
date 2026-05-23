# Accounting & Ledger Engine (Phase 3)

## Formula reference

| Arabic label | DB column | Formula |
|--------------|-----------|---------|
| Tebat | `tebat` | `current.total_deposit − previous.total_deposit` |
| Suhoubat | `suhoubat` | `current.total_withdraw − previous.total_withdraw` |
| Al Farq | `al_farq` | `tebat − suhoubat` |
| Al Harq | `al_harq` | `al_farq` (net portal delta — burn equals Al Farq) |
| Wasel Menho | `wasel_menho` | Sum of confirmed `wasel_menho` transactions (DB trigger) |
| Wasel Eleih | `wasel_eleih` | Sum of confirmed `wasel_eleih` transactions (DB trigger) |
| Baqi Qadim | `baqi_qadim` | Previous **closed** day `al_nihai` |
| Al Nihai | `al_nihai` | `al_farq + wasel_eleih − wasel_menho + baqi_qadim` |

## Code layout

| Module | Role |
|--------|------|
| [`formulas.ts`](../src/lib/accounting/formulas.ts) | Pure math — unit tested |
| [`ledger-engine.ts`](../src/lib/accounting/ledger-engine.ts) | Deterministic 4-step pipeline |
| [`ledger-sync-flight.ts`](../src/lib/accounting/ledger-sync-flight.ts) | In-process sync coalescing (userId + date) |
| [`ledger-integrity.ts`](../src/lib/accounting/ledger-integrity.ts) | Reconciliation validation — flag only, never auto-correct |
| [`balance-orientation.ts`](../src/lib/accounting/balance-orientation.ts) | له / عليه credit-debit labels |
| [`AccountingService.ts`](../src/lib/accounting/AccountingService.ts) | Sequential source loading + persist |
| [`SupabaseAccountingRepository.ts`](../src/lib/accounting/SupabaseAccountingRepository.ts) | `daily_ledgers` / `api_snapshots` / wasel sums |
| [`DailyReportOrchestrator.ts`](../src/lib/services/DailyReportOrchestrator.ts) | TexasSync + deterministic accounting pipeline |

## Usage

```typescript
import { AccountingService } from "@/lib/accounting";
import { TexasSyncService } from "@/lib/services/TexasSyncService";

const accounting = new AccountingService();

const report = accounting.generateDailyReport({
  userId: "...",
  ledgerDate: "2026-05-17",
  currentSnapshot: syncResult.snapshot,
  previousSnapshot: null,
  existingLedger: { id: "...", wasel_menho: 500, wasel_eleih: 2000, baqi_qadim: 0 },
  previousDayLedger: { al_nihai: 22800, ledger_date: "2026-05-16" },
});
```

## Texas field mapping

Update [`texas-mapping.config.ts`](../src/lib/texas/texas-mapping.config.ts) only when live JSON keys differ.

## Tests

```bash
npm run test:accounting
```
