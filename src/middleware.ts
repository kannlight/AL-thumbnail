import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { verifyToken } from '@/lib/jwt';

// 認証が必要なルートのパターン
// MEMO: 今回は /chat と /api/chat 以下を保護対象とする
export const config = {
    matcher: ['/chat/:path*', '/api/chat/:path*'],
};

export async function middleware(request: NextRequest) {
    // auth_token Cookie を取得
    const token = request.cookies.get('auth_token')?.value;

    if (!token) {
        // トークンが無い場合はログインページ(/)へリダイレクト
        return NextResponse.redirect(new URL('/', request.url));
    }

    // トークンの検証
    const isValid = await verifyToken(token);

    if (!isValid) {
        // トークンが無効な場合（期限切れ、署名不正など）もリダイレクト
        // 既存の無効なCookieは削除しておく
        const response = NextResponse.redirect(new URL('/', request.url));
        response.cookies.delete('auth_token');
        return response;
    }

    // 認証成功: リクエストをそのまま通す
    return NextResponse.next();
}
