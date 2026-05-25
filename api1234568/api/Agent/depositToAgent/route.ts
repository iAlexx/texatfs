"use server";

import { NextResponse } from 'next/server';
import { getServerApiClient } from '@/app/utils/api-client';

export async function POST(request: Request) {
    let body = await request.json();
    let { affiliateId, email, amount, currencyCode, role } = body;

    const response = await getServerApiClient(request).post('/Agent/depositToAgent', {
        amount: amount,
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
        "balance": "5000.00",
        "creditLine": "0.00",
        "credit": "0.00",
        "availability": "5000.00",
        "bonus": "0.00",
        "currencyCode": "NSP"
    },
    "notification": [
        {
            "code": 1,
            "content": "Successful transaction",
            "title": "",
            "autoHideAfter": 5000,
            "list": [],
            "status": "success"
        }
    ]
}
*/