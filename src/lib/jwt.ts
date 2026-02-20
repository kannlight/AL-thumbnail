import { SignJWT, jwtVerify } from 'jose';

// 環境変数 JWT_SECRET から Uint8Array のキーを生成
function getJwtSecret(): Uint8Array {
    const secret = process.env.JWT_SECRET;
    if (!secret) {
        // 開発時にはとりあえず固定文字列でフォールバックさせるか、エラーにします。
        // 本番では必須です。
        if (process.env.NODE_ENV === 'production') {
            throw new Error('JWT_SECRET is not set');
        }
        return new TextEncoder().encode('fallback_secret_for_local_development_only');
    }
    return new TextEncoder().encode(secret);
}

const ALG = 'HS256';

/**
 * 認証成功時にトークンを生成します。
 */
export async function signToken(): Promise<string> {
    const secret = getJwtSecret();
    const token = await new SignJWT({ authenticated: true })
        .setProtectedHeader({ alg: ALG })
        .setIssuedAt()
        // トークンの有効期限を24時間に設定
        .setExpirationTime('24h')
        .sign(secret);

    return token;
}

/**
 * 送信されたトークンの有効性を検証します。
 */
export async function verifyToken(token: string): Promise<boolean> {
    try {
        const secret = getJwtSecret();
        await jwtVerify(token, secret);
        return true;
    } catch (error) {
        // 期限切れや署名不正などはエラーとして catch されます
        return false;
    }
}
