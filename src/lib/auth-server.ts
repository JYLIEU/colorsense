import { getCloudbaseAdminDebugState } from "./cloudbase-admin";
import { headers } from "next/headers";

export interface VerifiedUser {
  uid: string;
  email?: string;
  email_verified?: boolean;
}

/**
 * 校验请求头中的 CloudBase accessToken（客户端 `auth.getAccessToken()` 获得），
 * 返回对应的用户信息；失败或未登录返回 null。
 */
export async function verifyAuth(): Promise<VerifiedUser | null> {
  const authHeader = headers().get("Authorization");
  const token = authHeader?.startsWith("Bearer ") ? authHeader.slice("Bearer ".length).trim() : "";

  if (process.env.NODE_ENV !== "production") {
    console.info("[auth-debug]", {
      authorizationHeaderPresent: Boolean(authHeader),
      tokenPresent: Boolean(token),
      tokenLength: token.length,
      ...getCloudbaseAdminDebugState(),
    });
  }

  if (!token) {
    return null;
  }

  try {
    return await verifyCloudBaseAccessToken(token);
  } catch (error) {
    const code = typeof error === "object" && error !== null && "code" in error ? String(error.code) : "unknown";
    const message = error instanceof Error ? error.message : String(error);
    console.error("[auth-debug] verifyAccessToken failed", { code, message });
    return null;
  }
}

export async function requireAuth() {
  const user = await verifyAuth();
  if (!user) {
    throw new Error("Unauthorized");
  }
  return user;
}

/**
 * 用用户的 accessToken 调用 CloudBase 网关的用户信息接口来校验登录态。
 * 失败返回 null（401/网络错误/无 uid 均视为未登录）。
 */
async function verifyCloudBaseAccessToken(token: string): Promise<VerifiedUser | null> {
  const envId = process.env.NEXT_PUBLIC_CLOUDBASE_ENV_ID;

  if (!envId) {
    console.error("[auth-debug] cloudbase server config missing", {
      envIdPresent: Boolean(envId),
    });
    return null;
  }

  let response: Response;
  try {
    response = await fetch(`https://${envId}.api.tcloudbasegateway.com/auth/v1/user/me`, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/json",
      },
    });
  } catch (error) {
    console.error("[auth-debug] user/me request failed", {
      message: error instanceof Error ? error.message : String(error),
    });
    return null;
  }

  if (response.status === 401 || response.status === 403) {
    return null;
  }

  const raw = await response.text();
  let parsed: any = null;
  try {
    parsed = JSON.parse(raw);
  } catch {
    // 非 JSON 响应
  }

  const data = parsed?.data ?? parsed;
  const uid = data?.uid || data?.sub;

  // 拒绝匿名凭证：公开的 publishable key 也能换回 sub=anon，不能当作登录用户
  const isAnonymous = uid === "anon" || data?.name === "anonymous" || data?.sub === "anon";
  if (!uid || isAnonymous) {
    console.error("[auth-debug] user/me returned no uid or anonymous", {
      status: response.status,
      body: raw.slice(0, 300),
    });
    return null;
  }

  return {
    uid,
    email: data?.email ?? undefined,
    email_verified: data?.email_verified ?? data?.emailVerified ?? undefined,
  };
}
