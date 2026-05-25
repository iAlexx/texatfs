"use server";

import { getServerApiClient } from "@/app/utils/api-client";
import { NextResponse } from "next/server";

export async function POST(request: Request) {
    try {
        const res = await getServerApiClient(request).post('/UserNotification/getAllUserNotifications', {
            start: 0,
            limit: 1000,
            filter: {}
        });
        if (res.status === 200) {
            return NextResponse.json(res.data, { status: 200 });
        }
    } catch (error) {
        console.error("Failed to fetch notifications", error);
        return NextResponse.json({ error: "Failed to fetch notifications" }, { status: 500 });
    }
}