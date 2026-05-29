import type { AgentTransferRecord } from "@/lib/texas/types";
import { roundMoney } from "@/lib/accounting/formulas";

const DEPOSIT_TYPE = "2";
const WITHDRAW_TYPE = "3";

const RECEIVER_FIELDS = ["toId", "to_id", "toAffiliateId", "toUserId", "toAgentId"];
const SENDER_FIELDS = ["fromId", "from_id", "fromAffiliateId", "fromUserId", "fromAgentId"];
const ROW_FIELDS = ["affiliateId", "agentId", "userId", "id", "playerId", "accountId"];
const AMOUNT_FIELD_CANDIDATES = [
  "amount",
  "value",
  "total",
  "deposit",
  "withdraw",
  "left",
  "right",
  "chargeIn",
  "chargeOut",
  "credit",
  "debit",
  "balance",
  "sum",
] as const;

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

/** Collect nested identity values (agent.id, user.id, from.id, to.id, etc). */
function collectNestedIds(bag: Record<string, unknown>): string[] {
  const out: string[] = [];
  for (const parentKey of ["agent", "user", "from", "to", "player", "account"]) {
    const child = bag[parentKey];
    if (child && typeof child === "object") {
      const childBag = child as Record<string, unknown>;
      const id = resolveId(childBag, "id", "affiliateId", "agentId", "userId");
      if (id) out.push(id);
    }
  }
  return out;
}

export interface MatchSides {
  receiver: boolean;
  sender: boolean;
  row: boolean;
  nested: boolean;
  receiverId: string;
  senderId: string;
  rowId: string;
}

export function matchAffiliateSides(
  record: AgentTransferRecord,
  affiliateId: string
): MatchSides {
  const id = affiliateId.trim();
  const bag = record as Record<string, unknown>;
  const receiverId = resolveId(bag, ...RECEIVER_FIELDS);
  const senderId = resolveId(bag, ...SENDER_FIELDS);
  const rowId = resolveId(bag, ...ROW_FIELDS);
  const nestedIds = collectNestedIds(bag);
  return {
    receiver: !!id && receiverId === id,
    sender: !!id && senderId === id,
    row: !!id && rowId === id,
    nested: !!id && nestedIds.includes(id),
    receiverId,
    senderId,
    rowId,
  };
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

export function extractRecordAmount(record: AgentTransferRecord): {
  amount: number;
  field: string | null;
} {
  const bag = record as Record<string, unknown>;
  for (const key of AMOUNT_FIELD_CANDIDATES) {
    const raw = bag[key];
    if (raw === undefined || raw === null || raw === "") continue;
    const n = parseAmount(raw);
    if (n > 0) return { amount: n, field: key };
  }
  return { amount: 0, field: null };
}

export function isDepositType(record: AgentTransferRecord): boolean {
  const t = resolveRecordType(record);
  return t === DEPOSIT_TYPE || t === "deposit";
}

export function isWithdrawType(record: AgentTransferRecord): boolean {
  const t = resolveRecordType(record);
  return t === WITHDRAW_TYPE || t === "withdraw";
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
  const { amount } = extractRecordAmount(record);
  const fromId = resolveId(bag, ...SENDER_FIELDS);
  const toId = resolveId(bag, ...RECEIVER_FIELDS);
  const created = resolveId(bag, "createdAt", "date", "time");
  return `sig:${type}:${fromId}:${toId}:${amount}:${created}`;
}

/**
 * Deposit (type 2): agent is the RECEIVER (toId) or named on the row.
 * Kept for back-compat — returns the canonical expected-side match.
 */
export function transferMatchesAffiliateForDeposit(
  record: AgentTransferRecord,
  affiliateId: string
): boolean {
  const sides = matchAffiliateSides(record, affiliateId);
  return sides.receiver || sides.row || sides.nested;
}

/**
 * Withdraw (type 3): agent is the SENDER (fromId) or named on the row.
 * Kept for back-compat — returns the canonical expected-side match.
 */
export function transferMatchesAffiliateForWithdraw(
  record: AgentTransferRecord,
  affiliateId: string
): boolean {
  const sides = matchAffiliateSides(record, affiliateId);
  return sides.sender || sides.row || sides.nested;
}

export function isAmbiguousTransferAttribution(
  record: AgentTransferRecord,
  affiliateId: string
): boolean {
  const sides = matchAffiliateSides(record, affiliateId);
  if (isDepositType(record)) {
    return sides.receiver && sides.row && sides.receiverId !== sides.rowId;
  }
  if (isWithdrawType(record)) {
    return sides.sender && sides.row && sides.senderId !== sides.rowId;
  }
  return false;
}

export interface TransferAttributionResult {
  totalDeposit: number;
  totalWithdraw: number;
  matchedDeposits: number;
  matchedWithdraws: number;
  skipped: number;
  ambiguous: number;
  duplicateSkipped: number;
  /** Records counted but matched on an unexpected side (deposit via sender-only / withdraw via receiver-only). */
  suspiciousDeposits: number;
  suspiciousWithdraws: number;
  /** Records of a transfer type whose amount could not be detected. */
  zeroAmountRecords: number;
}

/**
 * Attribute Transaction-tab transfers to one agent (Reports → Transaction).
 *
 * ROBUST attribution: a record is attributed to the target when the affiliate id
 * appears on ANY strong identity field (receiver / sender / row / nested), and is
 * then classified by `type` (2=deposit, 3=withdraw). This mirrors the proven live
 * grouping that historically produced correct deposit AND withdraw totals.
 *
 * Records matched on an unexpected side (e.g. a withdraw whose target sits on toId
 * instead of fromId) are STILL counted but flagged as suspicious — never silently
 * dropped — so production shape differences cannot zero-out real money.
 */
export function sumTransfersAttributedToAffiliate(
  records: AgentTransferRecord[],
  affiliateId: string
): TransferAttributionResult {
  const id = affiliateId.trim();
  const empty: TransferAttributionResult = {
    totalDeposit: 0,
    totalWithdraw: 0,
    matchedDeposits: 0,
    matchedWithdraws: 0,
    skipped: id ? 0 : records.length,
    ambiguous: 0,
    duplicateSkipped: 0,
    suspiciousDeposits: 0,
    suspiciousWithdraws: 0,
    zeroAmountRecords: 0,
  };
  if (!id) return empty;

  let totalDeposit = 0;
  let totalWithdraw = 0;
  let matchedDeposits = 0;
  let matchedWithdraws = 0;
  let skipped = 0;
  let ambiguous = 0;
  let duplicateSkipped = 0;
  let suspiciousDeposits = 0;
  let suspiciousWithdraws = 0;
  let zeroAmountRecords = 0;
  const seen = new Set<string>();

  for (const record of records) {
    const key = transferRecordKey(record);
    if (seen.has(key)) {
      duplicateSkipped += 1;
      continue;
    }
    seen.add(key);

    const sides = matchAffiliateSides(record, id);
    const matchedAnySide =
      sides.receiver || sides.sender || sides.row || sides.nested;
    const { amount } = extractRecordAmount(record);
    const deposit = isDepositType(record);
    const withdraw = isWithdrawType(record);

    if (!matchedAnySide || (!deposit && !withdraw)) {
      skipped += 1;
      continue;
    }

    if (amount === 0) zeroAmountRecords += 1;

    if (deposit) {
      totalDeposit += amount;
      matchedDeposits += 1;
      const expectedSide = sides.receiver || sides.row || sides.nested;
      if (!expectedSide && sides.sender) suspiciousDeposits += 1;
      if (isAmbiguousTransferAttribution(record, id)) ambiguous += 1;
    } else {
      totalWithdraw += amount;
      matchedWithdraws += 1;
      const expectedSide = sides.sender || sides.row || sides.nested;
      if (!expectedSide && sides.receiver) suspiciousWithdraws += 1;
      if (isAmbiguousTransferAttribution(record, id)) ambiguous += 1;
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
    suspiciousDeposits,
    suspiciousWithdraws,
    zeroAmountRecords,
  };
}

export interface TransferRecordDiagnostic {
  transactionId: string;
  type: string;
  amount: number;
  amountField: string | null;
  fromId: string;
  toId: string;
  rowAffiliateId: string;
  matchedReceiver: boolean;
  matchedSender: boolean;
  matchedRow: boolean;
  matchedNested: boolean;
  classifiedAs: "deposit" | "withdraw" | "other";
  outcome: "deposit" | "withdraw" | "skipped" | "duplicate";
  suspicious: boolean;
  reason: string;
}

export interface AffiliateTransferDiagnostics {
  affiliateId: string;
  totalRecords: number;
  type2Count: number;
  type3Count: number;
  otherTypeCount: number;
  allDepositAmountSum: number;
  allWithdrawAmountSum: number;
  attributed: TransferAttributionResult;
  matchingRecords: TransferRecordDiagnostic[];
  suspiciousWithdrawRecords: TransferRecordDiagnostic[];
}

/**
 * Full per-record attribution diagnostics for a single affiliate (used by the
 * debug script). Surfaces every matching or suspicious record with the reason
 * it was counted or skipped — no silent drops.
 */
export function diagnoseAffiliateTransfers(
  records: AgentTransferRecord[],
  affiliateId: string
): AffiliateTransferDiagnostics {
  const id = affiliateId.trim();
  let type2Count = 0;
  let type3Count = 0;
  let otherTypeCount = 0;
  let allDepositAmountSum = 0;
  let allWithdrawAmountSum = 0;
  const matchingRecords: TransferRecordDiagnostic[] = [];
  const suspiciousWithdrawRecords: TransferRecordDiagnostic[] = [];
  const seen = new Set<string>();

  for (const record of records) {
    const bag = record as Record<string, unknown>;
    const { amount, field } = extractRecordAmount(record);
    const deposit = isDepositType(record);
    const withdraw = isWithdrawType(record);

    if (deposit) {
      type2Count += 1;
      allDepositAmountSum += amount;
    } else if (withdraw) {
      type3Count += 1;
      allWithdrawAmountSum += amount;
    } else {
      otherTypeCount += 1;
    }

    const sides = matchAffiliateSides(record, id);
    const matchedAnySide =
      sides.receiver || sides.sender || sides.row || sides.nested;
    if (!matchedAnySide) continue;

    const key = transferRecordKey(record);
    const duplicate = seen.has(key);
    if (!duplicate) seen.add(key);

    let outcome: TransferRecordDiagnostic["outcome"] = "skipped";
    let suspicious = false;
    let reason = "";

    if (duplicate) {
      outcome = "duplicate";
      reason = "duplicate record key";
    } else if (deposit) {
      outcome = "deposit";
      const expectedSide = sides.receiver || sides.row || sides.nested;
      suspicious = !expectedSide && sides.sender;
      reason = suspicious
        ? "deposit matched only on sender side (fromId) — verify direction"
        : "deposit matched on receiver/row/nested";
    } else if (withdraw) {
      outcome = "withdraw";
      const expectedSide = sides.sender || sides.row || sides.nested;
      suspicious = !expectedSide && sides.receiver;
      reason = suspicious
        ? "withdraw matched only on receiver side (toId) — production alternate shape"
        : "withdraw matched on sender/row/nested";
    } else {
      outcome = "skipped";
      reason = "unrecognized type (not 2/3)";
    }

    const diag: TransferRecordDiagnostic = {
      transactionId: resolveId(bag, "id", "transactionId", "transferId", "recordId"),
      type: String(bag.type ?? bag.typeId ?? ""),
      amount,
      amountField: field,
      fromId: sides.senderId,
      toId: sides.receiverId,
      rowAffiliateId: sides.rowId,
      matchedReceiver: sides.receiver,
      matchedSender: sides.sender,
      matchedRow: sides.row,
      matchedNested: sides.nested,
      classifiedAs: deposit ? "deposit" : withdraw ? "withdraw" : "other",
      outcome,
      suspicious,
      reason,
    };
    matchingRecords.push(diag);
    if (withdraw && suspicious) suspiciousWithdrawRecords.push(diag);
  }

  return {
    affiliateId: id,
    totalRecords: records.length,
    type2Count,
    type3Count,
    otherTypeCount,
    allDepositAmountSum: roundMoney(allDepositAmountSum),
    allWithdrawAmountSum: roundMoney(allWithdrawAmountSum),
    attributed: sumTransfersAttributedToAffiliate(records, id),
    matchingRecords,
    suspiciousWithdrawRecords,
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
    suspiciousDeposits: result.suspiciousDeposits,
    suspiciousWithdraws: result.suspiciousWithdraws,
    zeroAmountRecords: result.zeroAmountRecords,
    recordsFetched: records.length,
  };
}
