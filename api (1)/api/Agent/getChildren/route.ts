import { NextResponse } from 'next/server';
import { getServerApiClient } from '@/app/utils/api-client';

export async function POST(request: Request) {
    const response = await getServerApiClient(request).post('/Agent/getChildren', {
        start: 0,
        limit: 20,
        filter: {
            self: {
                action: "=",
                value: true,
                valueLabel: true
            }
        },
        isNextPage: false,
        searchBy: {
            agentChildrenList: ""
        }
    });

    return NextResponse.json(response.data, { status: 200 });
};

/*
response:
{
    "status": true,
    "html": "",
    "result": {
        "records": [
            {
                "affiliateId": "2633181",
                "username": "madred1122@agent.nsp",
                "role": "2",
                "mainCurrency": "NSP",
                "status": "2",
                "address": null,
                "email": "madred1122@agent.nsp",
                "promoCode": null
            }
        ],
        "totalRecordsCount": "24",
        "titles": null,
        "total": null
    },
    "notification": []
}
*/