"use server";

import { NextResponse } from 'next/server';
import { getServerApiClient } from '@/app/utils/api-client';

export async function POST(request: Request) {
    const response = await getServerApiClient(request).post('/Agent/getAgentAllWallets');

    return NextResponse.json(response.data?.result[0], { status: 200 });
};

/*
response:
{
    "status": true,
    "html": "",
    "result": [
        {
            "currencyName": "New Syrian Pound",
            "currencyCode": "NSP",
            "availableWallet": "0.00",
            "mainCurrency": "NSP",
            "creditLine": "0",
            "credit": "0",
            "availability": "10000",
            "balance": "10000",
            "bonus": "0",
            "frozenBalance": "0",
            "withAmount": "0.00\/0.00",
            "currentWallet": "0.00"
        }
    ],
    "notification": []
}
*/