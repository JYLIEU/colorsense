/**
 * 服务端 PostgreSQL 访问层（仅 Node.js 运行时，供 API routes 使用）。
 *
 * 本环境的 CloudBase 只有 PostgreSQL 实例（没有文档数据库），
 * 通过网关接口 `POST /v1/rdb/exec-pgsql` 执行 SQL。
 *
 * - 写操作/DDL 必须带 `role: "cloudbase_postgres"`，否则以只读事务运行并失败。
 * - 成功（200）返回 JSON 行数组（DDL/写操作通常为 `[]`）；
 *   失败（400）返回 `{ code, message, requestId }`。
 *
 * 请勿将本文件 import 到客户端组件 —— `CLOUDBASE_APIKEY` 是服务端密钥。
 */

const envId = process.env.NEXT_PUBLIC_CLOUDBASE_ENV_ID;
const apiKey = process.env.CLOUDBASE_APIKEY;

export type SqlParameter = string | number | boolean | null | Date | Buffer;

export interface DbError extends Error {
  code: string;
  requestId?: string;
}

function toDbError(payload: { code?: string; message?: string; requestId?: string }): DbError {
  const error = new Error(payload.message ?? "Database error") as DbError;
  error.code = payload.code ?? "DATABASE_ERROR";
  error.requestId = payload.requestId;
  return error;
}

/**
 * 执行一条 SQL，返回行数组（无结果集时为空数组）。
 *
 * @param text SQL 语句，使用 `$1, $2...` 占位符
 * @param parameters 参数值（会安全转义，禁止拼接字符串 SQL）
 */
export async function sql<T = Record<string, unknown>>(text: string, parameters: SqlParameter[] = []): Promise<T[]> {
  if (!envId || !apiKey) {
    console.error("[db] Missing configuration", {
      envIdPresent: Boolean(envId),
      apiKeyPresent: Boolean(apiKey),
    });
    throw new Error("CloudBase database is not configured: need NEXT_PUBLIC_CLOUDBASE_ENV_ID and CLOUDBASE_APIKEY.");
  }

  const response = await fetch(`https://${envId}.api.tcloudbasegateway.com/v1/rdb/exec-pgsql`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({ sql: text, parameters, role: "cloudbase_postgres" }),
  });

  const raw = await response.text();
  let parsed: unknown = null;
  try {
    parsed = raw ? JSON.parse(raw) : null;
  } catch {
    // 非 JSON 响应
  }

  if (!response.ok) {
    const errorPayload = parsed as { code?: string; message?: string; requestId?: string } | null;
    console.error("[db] SQL failed", {
      status: response.status,
      code: errorPayload?.code,
      message: errorPayload?.message,
      sql: text.slice(0, 200),
    });
    throw toDbError(errorPayload ?? { message: `HTTP ${response.status}` });
  }

  if (Array.isArray(parsed)) {
    return parsed as T[];
  }

  // 部分写操作可能返回非数组信封，统一为空结果
  return [];
}

/** 将 timestamptz 查询结果转为 ISO 字符串，兼容 null。 */
export function toIsoString(value: unknown): string | null {
  if (value === null || value === undefined) {
    return null;
  }
  if (typeof value === "string") {
    return value;
  }
  if (value instanceof Date) {
    return value.toISOString();
  }
  return String(value);
}
