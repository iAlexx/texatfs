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
}
