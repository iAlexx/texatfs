export interface ReportRenderData {
  ledger: {
    id: string;
    ledger_date: string;
    status: string;
    tebat: number;
    suhoubat: number;
    al_farq: number;
    al_harq: number;
    wasel_menho: number;
    wasel_eleih: number;
    baqi_qadim: number;
    al_nihai: number;
    discrepancy_flag: boolean;
  };
  user: {
    display_name: string | null;
    texas_username: string | null;
    role: string;
  };
  monthly_commission?: {
    month_key: string;
    burn_amount: number;
    percent: number | null;
    commission_amount: number | null;
    final_before_commission: number;
    final_after_commission: number | null;
    status: string;
  };
}
