import { SecretManagerServiceClient } from '@google-cloud/secret-manager';

// Secret Manager クライアントの初期化
// ※ ローカル環境やビルド時には不要な場合もあるため、必要なタイミングでインスタンス化するか、
// グローバルに1つだけ持つようにします。ここではトップレベルで初期化しますが、
// GCP環境以外でエラーにならないよう注意が必要です。
let secretManagerClient: SecretManagerServiceClient | null = null;
function getSecretManagerClient() {
  if (!secretManagerClient) {
    secretManagerClient = new SecretManagerServiceClient();
  }
  return secretManagerClient;
}

/**
 * 認証用パスワードを取得します。
 * 本番環境(NODE_ENV === 'production') では Secret Manager から取得し、
 * それ以外は環境変数(AUTH_PASSWORD) から取得します。
 */
export async function getPassword(): Promise<string> {
  if (process.env.NODE_ENV === 'production') {
    try {
      const client = getSecretManagerClient();
      // プロジェクトIDは環境変数から取得するか、お使いの環境に合わせて適宜変更してください。
      // Cloud Run / App Hosting 環境ではGCPプロジェクトIDが自動的に注入されることが多いですが、
      // 明示的に指定する場合は GOOGLE_CLOUD_PROJECT 等の環境変数を利用します。
      const projectId = process.env.GOOGLE_CLOUD_PROJECT || process.env.GCP_PROJECT;
      if (!projectId) {
        throw new Error('GCP_PROJECT or GOOGLE_CLOUD_PROJECT is not set');
      }

      const name = `projects/${projectId}/secrets/al-thumbnail-password/versions/latest`;
      const [version] = await client.accessSecretVersion({ name });
      const payload = version.payload?.data?.toString();
      if (!payload) {
        throw new Error('Secret payload is empty');
      }
      return payload;
    } catch (error) {
      console.error('Failed to get password from Secret Manager:', error);
      throw error;
    }
  }

  // ローカル開発用
  const localPassword = process.env.AUTH_PASSWORD;
  if (!localPassword) {
    throw new Error('AUTH_PASSWORD is not set in environment variables');
  }
  return localPassword;
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
