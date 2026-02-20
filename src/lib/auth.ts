/**
 * 認証用パスワードを環境変数から取得します。
 */
export async function getPassword(): Promise<string> {
  const password = process.env.AUTH_PASSWORD;
  if (!password) {
    throw new Error('AUTH_PASSWORD is not set in environment variables');
  }
  return password;
}

/**
 * 入力されたパスワードが正しいか検証します。
 */
export async function verifyPassword(input: string): Promise<boolean> {
  try {
    const correctPassword = await getPassword();
    return input === correctPassword;
  } catch (error) {
    console.error('Error in verifyPassword:', error);
    return false;
  }
}
