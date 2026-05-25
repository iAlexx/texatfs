"use server";

import { NextResponse } from 'next/server';
import { getServerApiClient } from '@/app/utils/api-client';

export async function POST(request: Request) {
    const response = await getServerApiClient(request).post('/Statistics/getAgentsTransfers', {
        start: 0,
        limit: 1000,
        filter: {
            type: {
                action: "in",
                value: ["2", "3"],
                valueLabel: "Deposit,Withdraw",
                staticDataKey: "type"
            }
        }
    });

    return NextResponse.json(response.data, { status: 200 });
};