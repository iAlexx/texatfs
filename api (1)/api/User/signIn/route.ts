"use server";

import { NextResponse } from 'next/server';
import { api } from '@/app/utils/api-client';
import { toToken } from '@/app/utils/token-manager';
import { findValidTokenOf, cache } from '@/app/utils/token-cache';
import axios from 'axios';

export interface LoginResponse {
    status: boolean;
    html: string;
    result: {
        type: number;
        message: string;
    };
    notification: any[];
}

export async function POST(request: Request) {
    try {
        const body = await request.json();
        const { username, password } = body;

        if (!username || !password) {
            return NextResponse.json(
                { message: 'Username and password are required' },
                { status: 400 }
            );
        }

        let token = findValidTokenOf(username, password, new Date());
        if (token) {
            return NextResponse.json(
                {
                    token
                },
                { status: 200 }
            );
            /*try {
                const origin = new URL(request.url).origin;

                let testToken = await axios.post(`${origin}/api/Agent/getAgentAllWallets`, {
                    headers: {
                        Authorization: `Bearer ${token}`
                    }
                });

                if (testToken.status === 200) {
                    console.log(token)
                    console.log(testToken.data)

                    if (testToken.data !== "e") {
                        console.log("success")

                        return NextResponse.json(
                            {
                                token
                            },
                            { status: 200 }
                        );
                    }
                }
            } catch (e) {
                console.log(e);
            }*/
        }

        const response = await api.post<LoginResponse>(`/User/signIn`, {
            username,
            password,
        });

        if (response.data.result.type === 0 && response.data.result.message === 'dashboard') {
            cache(username, password, response.headers['set-cookie'] as string[]);

            return NextResponse.json(
                {
                    token: toToken(response.headers['set-cookie'] as string[])
                },
                { status: 200 }
            );
        }

        return NextResponse.json(
            { message: 'Invalid login request' },
            { status: 400 }
        );
    } catch (error) {
        return NextResponse.json(
            { message: 'Invalid request body, error: ' + error },
            { status: 400 }
        );
    }
}