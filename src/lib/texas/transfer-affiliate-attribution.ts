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

function rowIdentityFields(bag: Record<string, unknown>): string[] {
  return [
    resolveId(bag, "affiliateId", "agentId", "userId", "id"),
    resolveId(bag, "fromId", "from_id", "fromAffiliateId"),
    resolveId(bag, "toId", "to_id", "toAffiliateId"),
  ].filter(Boolean);
}

function transferRecordKey(record: AgentTransferRecord): string {
  const bag = record as Record<string, unknown>;
  const explicit = resolveId(
    bag,
    "id",
    "transactionId",
    "transferId",
    "recordId"
  );
  if (explicit) return `id:${explicit}`;

  const type = resolveRecordType(record);
  const amount = extractRecordAmount(record);
  const fromId = resolveId(bag, "fromId", "from_id", "fromAffiliateId");
  const toId = resolveId(bag, "toId", "to_id", "toAffiliateId");
  const created = resolveId(bag, "createdAt", "date", "time");
  return `sig:${type}:${fromId}:${toId}:${amount}:${created}`;
}

/**
 * Deposit (type 2): credits agent at toId, or row affiliate/agent/user id.
 * Withdraw (type 3): credits agent at fromId, or row affiliate/agent/user id.
 *
 * Does NOT match deposit at fromId (sender) or withdraw at toId (receiver)
 * unless row-level affiliate fields match — avoids master-side double count.
 */
export function transferMatchesAffiliateForDeposit(
  record: AgentTransferRecord,
  affiliateId: string
): boolean {
  const id = affiliateId.trim();
  if (!id) return false;
  const bag = record as Record<string, unknown>;
  const rowAffiliate = resolveId(bag, "affiliateId", "agentId", "userId", "id");
  const toId = resolveId(bag, "toId", "to_id", "toAffiliateId");
  return toId === id || rowAffiliate === id;
}

export function transferMatchesAffiliateForWithdraw(
  record: AgentTransferRecord,
  affiliateId: string
): boolean {
  const id = affiliateId.trim();
  if (!id) return false;
  const bag = record as Record<string, unknown>;
  const rowAffiliate = resolveId(bag, "affiliateId", "agentId", "userId", "id");
  const fromId = resolveId(bag, "fromId", "from_id", "fromAffiliateId");
  return fromId === id || rowAffiliate === id;
}

export function isAmbiguousTransferAttribution(
  record: AgentTransferRecord,
  affiliateId: string
): boolean {
  const id = affiliateId.trim();
  if (!id) return false;
  const bag = record as Record<string, unknown>;
  const fromId = resolveId(bag, "fromId", "from_id", "fromAffiliateId");
  const toId = resolveId(bag, "toId", "to_id", "toAffiliateId");
  const rowAffiliate = resolveId(bag, "affiliateId", "agentId", "userId", "id");

  if (isDepositType(record)) {
    const viaTo = toId === id;
    const viaRow = rowAffiliate === id && rowAffiliate !== toId;
    return viaTo && viaRow;
  }
  if (isWithdrawType(record)) {
    const viaFrom = fromId === id;
    const viaRow = rowAffiliate === id && rowAffiliate !== fromId;
    return viaFrom && viaRow;
  }
  return false;
}

/**
 * Attribute Transaction-tab transfers to one agent (Reports → Transaction).
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
  ambiguous: number;
  duplicateSkipped: number;
} {
  const id = affiliateId.trim();
  if (!id) {
    return {
      totalDeposit: 0,
      totalWithdraw: 0,
      matchedDeposits: 0,
      matchedWithdraws: 0,
      skipped: records.length,
      ambiguous: 0,
      duplicateSkipped: 0,
    };
  }

  let totalDeposit = 0;
  let totalWithdraw = 0;
  let matchedDeposits = 0;
  let matchedWithdraws = 0;
  let skipped = 0;
  let ambiguous = 0;
  let duplicateSkipped = 0;
  const seen = new Set<string>();

  for (const record of records) {
    const key = transferRecordKey(record);
    if (seen.has(key)) {
      duplicateSkipped += 1;
      continue;
    }
    seen.add(key);

    const amount = extractRecordAmount(record);

    if (isDepositType(record)) {
      if (transferMatchesAffiliateForDeposit(record, id)) {
        if (isAmbiguousTransferAttribution(record, id)) ambiguous += 1;
        totalDeposit += amount;
        matchedDeposits += 1;
      } else {
        skipped += 1;
      }
    } else if (isWithdrawType(record)) {
      if (transferMatchesAffiliateForWithdraw(record, id)) {
        if (isAmbiguousTransferAttribution(record, id)) ambiguous += 1;
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
    ambiguous,
    duplicateSkipped,
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

/** Structured log payload for per-child transfer attribution. */
export function transferAttributionLogPayload(
  affiliateId: string,
  records: AgentTransferRecord[]
): Record<string, unknown> {
  const result = sumTransfersAttributedToAffiliate(records, affiliateId);
  return {
    affiliateId,
    depositTotal: result.totalDeposit,
    withdrawTotal: result.totalWithdraw,
    matchedDeposits: result.matchedDeposits,
    matchedWithdraws: result.matchedWithdraws,
    skipped: result.skipped,
    ambiguous: result.ambiguous,
    duplicateSkipped: result.duplicateSkipped,
    recordsFetched: records.length,
  };
}
