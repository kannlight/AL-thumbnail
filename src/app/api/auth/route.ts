import { NextRequest, NextResponse } from 'next/server';
import { verifyPassword } from '@/lib/auth';
import { signToken } from '@/lib/jwt';

export async function POST(request: NextRequest) {
    try {
        const body = await request.json();
        const { password } = body;

        if (!password) {
            return NextResponse.json(
                { error: 'パスワードが入力されていません' },
                { status: 400 }
            );
        }

        // パスワードの検証
        const isValid = await verifyPassword(password);

        if (!isValid) {
            return NextResponse.json(
                { error: 'パスワードが正しくありません' },
                { status: 401 }
            );
        }

        // 認証成功時: JWTトークンを生成
        const token = await signToken();

        // レスポンスを作成し、Cookieにトークンをセット
        const response = NextResponse.json(
            { success: true },
            { status: 200 }
        );

        response.cookies.set({
            name: 'auth_token',
            value: token,
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            sameSite: 'strict',
            path: '/',
            maxAge: 60 * 60 * 24, // 24時間
        });

        return response;
    } catch (error) {
        console.error('Auth API Error:', error);
        return NextResponse.json(
            { error: 'サーバーエラーが発生しました' },
            { status: 500 }
        );
    }
}
