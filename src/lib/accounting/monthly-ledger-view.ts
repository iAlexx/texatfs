import { roundMoney, computeAlFarq, computeAlHarqFromAlFarq, computeAlNihai } from "@/lib/accounting/formulas";
import { reconcileLedger } from "@/lib/finance/reconciliation";

export type LedgerRowLike = {
  tebat: number | string | null;
  suhoubat: number | string | null;
  wasel_menho: number | string | null;
  wasel_eleih: number | string | null;
};

export function resolveMonthStart(ledgerDateIso: string): string {
  // ledgerDateIso is expected as YYYY-MM-DD
  const y = ledgerDateIso.slice(0, 4);
  const m = ledgerDateIso.slice(5, 7);
  return `${y}-${m}-01`;
}

export function computeMonthlyCumulativeLedgerView(params: {
  ledgerDate: string; // YYYY-MM-DD (used only for context)
  rowsFromMonthStartInclusive: LedgerRowLike[];
  baqiQadimFixedCarry: number; // al_nihai from most recent closed ledger strictly before month start
}): {
  tebatMtd: number;
  suhoubatMtd: number;
  waselMenhoMtd: number;
  waselEleihMtd: number;
  baqiQadimMtd: number;
  alFarqMtd: number;
  alHarqMtd: number;
  alNihaiMtd: number;
  discrepancyFlag: boolean;
} {
  const tebatSum = params.rowsFromMonthStartInclusive.reduce((acc, r) => {
    return acc + Number(r.tebat ?? 0);
  }, 0);
  const suhoubatSum = params.rowsFromMonthStartInclusive.reduce((acc, r) => {
    return acc + Number(r.suhoubat ?? 0);
  }, 0);
  const waselMenhoSum = params.rowsFromMonthStartInclusive.reduce((acc, r) => {
    return acc + Number(r.wasel_menho ?? 0);
  }, 0);
  const waselEleihSum = params.rowsFromMonthStartInclusive.reduce((acc, r) => {
    return acc + Number(r.wasel_eleih ?? 0);
  }, 0);

  const tebatMtd = roundMoney(tebatSum);
  const suhoubatMtd = roundMoney(suhoubatSum);
  const waselMenhoMtd = roundMoney(waselMenhoSum);
  const waselEleihMtd = roundMoney(waselEleihSum);

  const baqiQadimMtd = roundMoney(params.baqiQadimFixedCarry);

  const alFarqMtd = computeAlFarq(tebatMtd, suhoubatMtd);
  const alHarqMtd = computeAlHarqFromAlFarq(alFarqMtd);
  const alNihaiMtd = computeAlNihai({
    al_farq: alFarqMtd,
    wasel_menho: waselMenhoMtd,
    wasel_eleih: waselEleihMtd,
    baqi_qadim: baqiQadimMtd,
  });

  const reconcile = reconcileLedger({
    tebat: tebatMtd,
    suhoubat: suhoubatMtd,
    wasel_menho: waselMenhoMtd,
    wasel_eleih: waselEleihMtd,
  });

  return {
    tebatMtd,
    suhoubatMtd,
    waselMenhoMtd,
    waselEleihMtd,
    baqiQadimMtd,
    alFarqMtd,
    alHarqMtd,
    alNihaiMtd,
    discrepancyFlag: !reconcile.balanced,
  };
}

