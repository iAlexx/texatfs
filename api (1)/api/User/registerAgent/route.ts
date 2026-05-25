"use server";

import { NextResponse } from 'next/server';
import { getServerApiClient } from '@/app/utils/api-client';

export async function POST(request: Request) {
    let body = await request.json();
    let email = body.email;
    let password = body.password;
    let agentRole = body.agentRole;
    let parentAffiliateId = body.parentAffiliateId;
    let mainCurrency = body.mainCurrency;

    const response = await getServerApiClient(request).post('/User/registerAgent', {
        affiliate: {
            email: email,
            password: password,
            agentRole: agentRole,
            parentAffiliateId: parentAffiliateId,
            termsAndCond: true,
            mainCurrency: mainCurrency,
            confirmPassword: password
        }
    });

    return NextResponse.json(response.data, { status: 200 });
};