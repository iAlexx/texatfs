"use server";

import { NextResponse } from 'next/server';
import { getServerApiClient } from '@/app/utils/api-client';

export async function POST(request: Request) {
    let body = await request.json();
    let { playerId, amount, currencyCode } = body;

    const response = await getServerApiClient(request).post('/Player/withdrawFromPlayer', {
        amount: -amount,
        comment: null,
        playerId: playerId,
        currencyCode: currencyCode,
        currency: currencyCode,
        moneyStatus: 5
    });

    if (response.status == 200 && response.data.status == true && response.data.result?.balance)
        return NextResponse.json(response.data.result, { status: 200 });
    else
        return NextResponse.json(response.data, { status: 401 });
};

/*
response (if amount is available in the player wallet):
{
    "status": true,
    "html": "",
    "result": {
        "balance": "4500.00", //for agent
        "creditLine": "0.00",
        "credit": "0.00",
        "availability": "4500.00",
        "bonus": "0.00",
        "currencyCode": "NSP"
    },
    "notification": []
}

response (if amount is not available in the player wallet):
{
    "status": true,
    "html": "",
    "result": false,
    "notification": [
        {
            "code": 1,
            "content": "Amount is greater than account balance",
            "title": "",
            "autoHideAfter": 5000,
            "list": [],
            "status": "error"
        }
    ]
}
*/