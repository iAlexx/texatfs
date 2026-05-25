import { NextResponse } from 'next/server';
import { getServerApiClient } from '@/app/utils/api-client';

export async function POST(request: Request) {
    let body = await request.json();

    const response = await getServerApiClient(request).post('/Player/registerPlayer', body);

    return NextResponse.json(response.data, { status: 200 });
};
