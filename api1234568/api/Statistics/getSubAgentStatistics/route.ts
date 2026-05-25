"use server";

import { NextResponse } from 'next/server';
import { getServerApiClient } from '@/app/utils/api-client';

export async function POST(request: Request) {
    const response = await getServerApiClient(request).post('/Statistics/getSubAgentStatistics', {
        start: 0,
        limit: 1000,
        filter: {
            currency: {
                action: "=",
                value: "multi",
                valueLabel: "multi"
            }
        }
    });

    return NextResponse.json(response.data, { status: 200 });
};