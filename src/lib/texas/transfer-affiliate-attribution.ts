import type { AgentTransferRecord } from "@/lib/texas/types";
import { roundMoney } from "@/lib/accounting/formulas";

const DEPOSIT_TYPE = "2";
const WITHDRAW_TYPE = "3";

function resolveId(
  bag: Record<string, unknown>,
  ...keys: string[]
): string {
  for (const key of keys) {
    const v = bag[key];
    if (v !== undefined && v !== null && String(v).trim() !== "") {
      return String(v).trim();
    }
  }
  return "";
}

function resolveRecordType(record: AgentTransferRecord): string {
  const bag = record as Record<string, unknown>;
  const raw = bag.type ?? bag.typeId ?? "";
  return String(raw).trim().toLowerCase();
}

function parseAmount(raw: unknown): number {
  if (raw === undefined || raw === null || raw === "") return 0;
  const n = Number(String(raw).replace(/,/g, ""));
  return Number.isNaN(n) ? 0 : Math.abs(n);
}

function extractRecordAmount(record: AgentTransferRecord): number {
  const bag = record as Record<string, unknown>;
  for (const key of [
    "amount",
    "value",
    "total",
    "deposit",
    "withdraw",
    "left",
    "right",
    "chargeIn",
    "chargeOut",
  ]) {
    const raw = bag[key];
    if (raw === undefined || raw === null || raw === "") continue;
    const n = parseAmount(raw);
    if (n > 0) return n;
  }
  return 0;
}

function isDepositType(record: AgentTransferRecord): boolean {
  const t = resolveRecordType(record);
  return t === DEPOSIT_TYPE || t === "deposit";
}

function isWithdrawType(record: AgentTransferRecord): boolean {
  const t = resolveRecordType(record);
  return t === WITHDRAW_TYPE || t === "withdraw";
}

/**
 * Attribute Transaction-tab transfers to one agent (Reports → Transaction).
 *
 * Texas records use fromId/toId (not always affiliateId on the row):
 *   type 2 (Deposit):  master → agent  → credits agent at toId
 *   type 3 (Withdraw): agent → master → credits agent at fromId
 */
export function sumTransfersAttributedToAffiliate(
  records: AgentTransferRecord[],
  affiliateId: string
): {
  totalDeposit: number;
  totalWithdraw: number;
  matchedDeposits: number;
  matchedWithdraws: number;
  skipped: number;
} {
  const id = affiliateId.trim();
  if (!id) {
    return {
      totalDeposit: 0,
      totalWithdraw: 0,
      matchedDeposits: 0,
      matchedWithdraws: 0,
      skipped: records.length,
    };
  }

  let totalDeposit = 0;
  let totalWithdraw = 0;
  let matchedDeposits = 0;
  let matchedWithdraws = 0;
  let skipped = 0;

  for (const record of records) {
    const bag = record as Record<string, unknown>;
    const rowAffiliate = resolveId(
      bag,
      "affiliateId",
      "agentId",
      "userId",
      "id"
    );
    const fromId = resolveId(bag, "fromId", "from_id", "fromAffiliateId");
    const toId = resolveId(bag, "toId", "to_id", "toAffiliateId");
    const amount = extractRecordAmount(record);

    if (isDepositType(record)) {
      if (toId === id || fromId === id || rowAffiliate === id) {
        totalDeposit += amount;
        matchedDeposits += 1;
      } else {
        skipped += 1;
      }
    } else if (isWithdrawType(record)) {
      if (fromId === id || toId === id || rowAffiliate === id) {
        totalWithdraw += amount;
        matchedWithdraws += 1;
      } else {
        skipped += 1;
      }
    } else {
      skipped += 1;
    }
  }

  return {
    totalDeposit: roundMoney(totalDeposit),
    totalWithdraw: roundMoney(totalWithdraw),
    matchedDeposits,
    matchedWithdraws,
    skipped,
  };
}

export type TransferFilterProbeKey =
  | "affiliateId"
  | "agentId"
  | "userId"
  | "username"
  | "none";

export interface TransferFilterProbeResult {
  key: TransferFilterProbeKey;
  recordCount: number;
  totalDeposit: number;
  totalWithdraw: number;
  filterPayload: Record<string, unknown>;
}
