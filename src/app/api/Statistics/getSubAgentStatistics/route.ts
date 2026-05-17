import type { TexasFilterMap } from "@/lib/texas/types";

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";
export const runtime = "nodejs";

type RouteBody = {
  start?: number;
  limit?: number;
  filter?: TexasFilterMap;
  paginate?: boolean;
};

/**
 * Proxy route — same contract as the Texas dashboard bundle.
 * Set `paginate: true` to merge all pages server-side.
 */
export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as RouteBody;
  const { getServerApiClient } = await import("@/app/utils/api-client");
  const client = getServerApiClient(request);

  if (body.paginate) {
    const { fetchAllSubAgentStatistics } = await import(
      "@/lib/texas/fetch-sub-agent-statistics"
    );
    const result = await fetchAllSubAgentStatistics(client, {
      pageSize: body.limit,
      extraFilter: body.filter,
      paginate: true,
    });
    return Response.json(result.response, { status: 200 });
  }

  const response = await client.post("/Statistics/getSubAgentStatistics", {
    start: body.start ?? 0,
    limit: body.limit ?? 1000,
    filter: body.filter ?? {
      currency: {
        action: "=",
        value: "multi",
        valueLabel: "multi",
      },
    },
  });

  return Response.json(response.data, { status: 200 });
}
