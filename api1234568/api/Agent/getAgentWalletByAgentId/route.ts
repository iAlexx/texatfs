"use server";

import { NextResponse } from 'next/server';
import { getServerApiClient } from '@/app/utils/api-client';

export async function POST(request: Request) {
    let body = await request.json();
    let { affiliateId, currencyCode } = body;

    const response = await getServerApiClient(request).post('/Agent/getAgentWalletByAgentId', {
        affiliateId: affiliateId,
        currencyCode: currencyCode
    });

    if (response.status == 200 && response.data.status == true && response.data.result?.balance)
        return NextResponse.json(response.data, { status: 200 });
    else
        return NextResponse.json(response.data, { status: 401 });
};

/*
response:
{
    "status": true,
    "html": "",
    "result": {
        "transactionId": "738001610",
        "affiliateId": "2633177",
        "actionType": "3",
        "date": "2026-01-31 04:33:22",
        "creditLine": "0",
        "credit": "0",
        "availability": "3080",
        "balance": "3080",
        "bonus": "0",
        "frozenBalance": "0"
    },
    "notification": []
}
*/