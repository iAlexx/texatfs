import { NextResponse } from 'next/server';
import { getServerApiClient } from '@/app/utils/api-client';

export async function POST(request: Request) {
    let body = await request.json();
    let affiliateUsername = body.affiliateUsername;
    let playerUserName = body.playerUserName; //for find the playerId for a player with its username

    let filters = {};

    if (playerUserName) {
        filters = {
            playerUserName: {
                action: "=",
                value: playerUserName,
                valueLabel: playerUserName
            }
        };
    }

    const response = await getServerApiClient(request).post('/Statistics/getPlayersStatisticsPro', {
        start: 0,
        limit: playerUserName ? 1 : 1000,
        filter: {
            affiliateUsername: {
                action: "=", // or "=" depending on backend, usually "like" for text search or "=" for exact
                value: affiliateUsername,
                valueLabel: affiliateUsername
            },
            ...filters
        },
        searchBy: { // Adding generic searchBy if needed, often required by this backend structure
            getPlayersStatisticsPro: ""
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
                "affiliateUsername": "dashboard_test@texas.nsp",
                "playerId": "375997748",
                "deleted": "NOK",
                "username": "elias-test",
                "registrationDate": "2026-01-22 01:40:49",
                "affiliateId": "2652045",
                "bannerId": "0",
                "linkId": "0",
                "city": null,
                "device": "Empty",
                "country": null,
                "surname": null,
                "name": null,
                "email": "elias0test@dashboard.test",
                "currency": "NSP",
                "planName": "SYSTEM__AGENT",
                "commissionTypeId": "0",
                "isConfigurable": "0",
                "isAgent": "1",
                "note": null,
                "metaTags": "",
                "isVerified": "0"
            }
        ],
        "totalRecordsCount": "1",
        "titles": null,
        "total": null
    },
    "notification": []
}
*/