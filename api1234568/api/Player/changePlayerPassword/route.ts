"use server";

import { NextResponse } from 'next/server';
import { getServerApiClient } from '@/app/utils/api-client';

export async function POST(request: Request) {
    let body = await request.json();
    let { playerId, password } = body;

    const response = await getServerApiClient(request).post('/Player/changePlayerPassword', {
        playerId: playerId,
        password: password
    });

    if (response.status == 200 && response.data.status == true && response.data.result == true)
        return NextResponse.json(response.data, { status: 200 });
    else
        return NextResponse.json(response.data, { status: 401 });
};

/*
response:
{
    "status":true,
    "html":"",
    "result":true,
    "notification":[]
}
*/