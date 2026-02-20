/**
 * MCP (Model Context Protocol) クライアント
 * 公式 MCP SDK を使用して SSE トランスポートで MCP サーバーと通信する
 */
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { SSEClientTransport } from "@modelcontextprotocol/sdk/client/sse.js";

const MCP_TIMEOUT_MS = 30_000;
const MCP_MAX_RETRIES = 3;

export class McpClient {
    private readonly serverUrl: string;
    private readonly authToken: string;

    constructor(serverUrl: string, authToken: string) {
        this.serverUrl = serverUrl;
        this.authToken = authToken;
    }

    // -------------------------------------------------------
    // ツールの実行（リトライロジック付き）
    // -------------------------------------------------------
    async executeTool(
        toolName: string,
        args: Record<string, unknown>
    ): Promise<unknown> {
        let lastError: Error | null = null;

        for (let attempt = 0; attempt < MCP_MAX_RETRIES; attempt++) {
            if (attempt > 0) {
                const delay = Math.pow(2, attempt - 1) * 1_000;
                await sleep(delay);
            }

            try {
                return await this._executeToolOnce(toolName, args);
            } catch (err) {
                lastError = err instanceof Error ? err : new Error(String(err));
                console.warn(
                    `[McpClient] ツール実行失敗 (試行 ${attempt + 1}/${MCP_MAX_RETRIES}): ${lastError.message}`
                );
            }
        }

        throw new Error(
            `MCPツール "${toolName}" の実行に失敗しました（最大リトライ回数超過）: ${lastError?.message}`
        );
    }

    // -------------------------------------------------------
    // 実際のツール実行（1回分）
    // SDK の Client + SSEClientTransport を使用
    // -------------------------------------------------------
    private async _executeToolOnce(
        toolName: string,
        args: Record<string, unknown>
    ): Promise<unknown> {
        const url = new URL(this.serverUrl);
        const authToken = this.authToken;

        // SSEClientTransport を生成
        const transport = new SSEClientTransport(url, {
            eventSourceInit: {
                fetch: (input: string | URL | Request, init?: RequestInit) => {
                    const headers = new Headers(init?.headers);
                    headers.set("Authorization", `Bearer ${authToken}`);
                    return fetch(input, { ...init, headers });
                },
            },
            requestInit: {
                headers: {
                    Authorization: `Bearer ${authToken}`,
                },
            },
        });

        // MCP Client を生成
        const client = new Client({
            name: "al-thumbnail-client",
            version: "1.0.0",
        });

        try {
            // 接続
            await client.connect(transport);
            console.log(`[McpClient] MCP サーバーに接続成功`);

            // ツール実行（タイムアウト付き）
            const result = await withTimeout(
                client.callTool({ name: toolName, arguments: args }),
                MCP_TIMEOUT_MS,
                `MCPツール "${toolName}" がタイムアウトしました (${MCP_TIMEOUT_MS / 1000}秒)`
            );

            console.log(`[McpClient] ツール "${toolName}" 実行成功`);
            return result;
        } finally {
            // 必ず切断する
            try {
                await client.close();
            } catch {
                // 切断エラーは無視
            }
        }
    }

    // 後方互換性のために残す
    async connect(): Promise<void> { }
    async disconnect(): Promise<void> { }
}

// -------------------------------------------------------
// ユーティリティ
// -------------------------------------------------------
function sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

function withTimeout<T>(
    promise: Promise<T>,
    ms: number,
    message: string
): Promise<T> {
    return new Promise<T>((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error(message)), ms);
        promise
            .then((val) => {
                clearTimeout(timer);
                resolve(val);
            })
            .catch((err) => {
                clearTimeout(timer);
                reject(err);
            });
    });
}
