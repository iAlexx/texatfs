"use server";

import { NextResponse } from 'next/server';
import { getServerApiClient } from '@/app/utils/api-client';

export async function POST(request: Request) {
    let body = await request.json();
    let { playerId } = body;

    const response = await getServerApiClient(request).post('/Player/getPlayerBalanceById', {
        playerId: playerId,
    });

    if (response.status == 200 && response.data.status == true && response.data.result[0]?.balance)
        return NextResponse.json(response.data.result[0], { status: 200 });
    else
        return NextResponse.json(response.data, { status: 401 });
};

/*
response:
{
    "status": true,
    "html": "",
    "result": [
        {
            "balance": 500,
            "currencyCode": "NSP",
            "main": true
        }
    ],
    "notification": []
}
*/