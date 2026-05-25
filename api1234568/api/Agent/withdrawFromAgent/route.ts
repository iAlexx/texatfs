"use server";

import { NextResponse } from 'next/server';
import { getServerApiClient } from '@/app/utils/api-client';

export async function POST(request: Request) {
    let body = await request.json();
    let { affiliateId, email, amount, currencyCode, role } = body;

    const response = await getServerApiClient(request).post('/Agent/withdrawFromAgent', {
        amount: -amount,
        comment: null,
        affiliateId: affiliateId,
        moneyStatus: 3,
        currencyCode: currencyCode,
        username: `${affiliateId}-${email}`,
        role: role,
        mainCurrency: currencyCode,
        status: "2",
        address: null,
        email: email,
        promoCode: null
    });

    if (response.status == 200 && response.data.status == true && response.data.result?.balance)
        return NextResponse.json(response.data.result, { status: 200 });
    else
        return NextResponse.json(response.data, { status: 401 });
};

/*
response:
{
    "status": true,
    "html": "",
    "result": {
        "balance": "10000.00", // for the super agent that take money from the agent
        "creditLine": "0.00",
        "credit": "0.00",
        "availability": "10000.00",
        "bonus": "0.00",
        "currencyCode": "NSP"
    },
    "notification": []
}
*/