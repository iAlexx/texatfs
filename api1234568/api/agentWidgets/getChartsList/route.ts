"use server";

import { NextResponse } from 'next/server';
import { getServerApiClient } from '@/app/utils/api-client';

export async function POST(request: Request) {
    const response = await getServerApiClient(request).post('/agentWidgets/getChartsList', {
        filter: {
            date: {
                action: 'between',
                from: '2026/01/01',
                to: '2026/01/31',
            },
        },
        widgetsNamesLists: {
            charts: ['productsReportByPlayersTotalsForChart'],
        },
    });

    return NextResponse.json(response.data, { status: 200 });
};