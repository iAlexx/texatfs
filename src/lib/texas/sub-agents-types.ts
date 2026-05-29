import type { MtdTexasStrategy } from "@/lib/accounting/mtd-ledger-metrics";

export type SubAgentMetricsSource =
  | "mtd_snapshot"
  | "mtd_daily_rows"
  | "live_texas_fallback"
  | "empty_no_data";

export interface SubAgentMtdMetrics {
  tebat_mtd: number;
  suhoubat_mtd: number;
  al_farq_mtd: number;
  al_harq_mtd: number;
  wasel_menho_mtd: number;
  wasel_eleih_mtd: number;
  baqi_qadim: number;
  al_nihai_mtd: number;
  texas_strategy: MtdTexasStrategy;
  current_snapshot_found?: boolean;
  baseline_snapshot_found?: boolean;
  daily_rows_count?: number;
  is_empty_fallback?: boolean;
}

export interface SubAgentWhatsAppStatus {
  group_exists: boolean;
  group_id: string | null;
  group_name: string | null;
  parent_whatsapp_verified: boolean;
}

export type SubAgentCommissionDisplayStatus =
  | "none"
  | "pending_percent"
  | "completed"
  | "expired"
  | "failed";

export interface SubAgentCommissionStatus {
  month_key: string;
  status: SubAgentCommissionDisplayStatus;
  percent: number | null;
  commission_amount: number | null;
  final_before_commission: number | null;
  final_after_commission: number | null;
}
