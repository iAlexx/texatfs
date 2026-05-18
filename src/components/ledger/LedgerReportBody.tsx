"use client";

import { LedgerRow } from "@/components/ledger/LedgerRow";
import type { DailyLedger } from "@/lib/supabase/database.types";

export function LedgerReportBody({ ledger }: { ledger: DailyLedger }) {
  return (
    <>
      {ledger.discrepancy_flag && (
        <div className="mb-4 rounded-md border border-accent-negative/40 bg-destructive/10 px-4 py-2 text-sm text-accent-negative">
          تنبيه: يوجد فرق بين مصدر Texas وواصل WhatsApp
        </div>
      )}

      <section className="panel-brushed-steel">
        <header className="panel-brushed-steel-header">
          <p className="text-xs uppercase tracking-widest text-steel-500">
            Texas API movement
          </p>
        </header>
        <LedgerRow labelAr="تبات" labelEn="Tebat" value={ledger.tebat} />
        <LedgerRow labelAr="سحوبات" labelEn="Suhoubat" value={ledger.suhoubat} />
        <LedgerRow
          labelAr="الفرق"
          labelEn="Al-Farq"
          value={ledger.al_farq}
          variant="emphasis"
        />
        <LedgerRow labelAr="الحرق" labelEn="Al-Harq" value={ledger.al_harq} />
      </section>

      <section className="panel-brushed-steel mt-4">
        <header className="panel-brushed-steel-header">
          <p className="text-xs uppercase tracking-widest text-steel-500">
            WhatsApp confirmations
          </p>
        </header>
        <LedgerRow
          labelAr="واصل منه"
          labelEn="Wasel Menho"
          value={ledger.wasel_menho}
          signed={false}
        />
        <LedgerRow
          labelAr="واصل إليه"
          labelEn="Wasel Eleih"
          value={ledger.wasel_eleih}
          signed={false}
        />
      </section>

      <section className="panel-brushed-steel mt-4">
        <header className="panel-brushed-steel-header">
          <p className="text-xs uppercase tracking-widest text-steel-500">
            Balance
          </p>
        </header>
        <LedgerRow
          labelAr="باقي قديم"
          labelEn="Baqi Qadim"
          value={ledger.baqi_qadim}
          signed={false}
        />
        <LedgerRow
          labelAr="النهائي"
          labelEn="Al-Nihai"
          value={ledger.al_nihai}
          variant="final"
          signed={false}
        />
      </section>
    </>
  );
}
