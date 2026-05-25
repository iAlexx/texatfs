"use server";

import { NextResponse } from 'next/server';
import { getServerApiClient } from '@/app/utils/api-client';

export async function POST(request: Request) {
    let body = await request.json();
    let agentRole = body.agentRole || "70";

    const response = await getServerApiClient(request).post('/Agent/getChildrenFilteredByRole', {
        start: 0,
        limit: 1000,
        filter: { role: { action: "=", value: agentRole, valueLabel: agentRole } },
        searchBy: { getChildrenFilteredByRole: "" }
    });

    return NextResponse.json(response.data, { status: 200 });
};