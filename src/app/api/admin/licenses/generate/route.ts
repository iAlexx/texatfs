import { NextResponse } from "next/server";
import {
  AdminAuthError,
  LICENSE_DURATIONS,
  requireAdmin,
  type AdminAuthInput,
  type LicenseDurationMonths,
} from "@/lib/admin/auth";
import type { GenerateLicenseResponse } from "@/lib/admin/types";
import { getSupabaseServiceClient } from "@/lib/supabase/server";
import { formatSupabaseError } from "@/lib/utils/supabase-error";

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";
export const runtime = "nodejs";

interface GenerateBody extends AdminAuthInput {
  durationMonths: LicenseDurationMonths;
  notes?: string;
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as GenerateBody;
    const auth = requireAdmin(body);

    const duration = body.durationMonths;
    if (!LICENSE_DURATIONS.includes(duration)) {
      return NextResponse.json(
        { error: "durationMonths must be 1, 3, 6, or 12" },
        { status: 400 }
      );
    }

    const supabase = getSupabaseServiceClient();
    const { data: key, error } = await supabase.rpc("generate_license_key", {
      p_duration_months: duration,
      p_created_by: null,
      p_notes:
        body.notes?.trim() ||
        `Generated via Super Admin dashboard (telegram ${auth.telegramUserId})`,
    });

    if (error) {
      throw formatSupabaseError(error);
    }

    const payload: GenerateLicenseResponse = {
      key: String(key),
      duration_months: duration,
    };

    return NextResponse.json(payload);
  } catch (e) {
    if (e instanceof AdminAuthError) {
      return NextResponse.json({ error: e.message }, { status: e.status });
    }
    const msg = e instanceof Error ? e.message : "Server error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
