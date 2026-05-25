"use server";

import { NextResponse } from 'next/server';
import { getServerApiClient } from '@/app/utils/api-client';

export async function POST(request: Request) {
    let body = await request.json();
    let affiliateId = body.affiliateId;

    const response = await getServerApiClient(request).post('/Agent/getAgentAvailableCurrencies', {
        affiliateId: affiliateId
    });

    return NextResponse.json(response.data, { status: 200 });
};