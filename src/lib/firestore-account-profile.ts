import { apiFetch } from "@/lib/cloudbase";

export interface AccountProfile {
  nickname: string;
  email: string;
  createdAt?: unknown;
  updatedAt?: unknown;
}

/**
 * 读取当前登录用户的账户资料（昵称、邮箱）。
 * uid 由服务端根据 accessToken 解析，客户端传入仅为保持旧签名兼容。
 */
export async function getAccountProfile(_userId: string): Promise<AccountProfile | null> {
  try {
    const res = await apiFetch("/api/account/profile");
    if (!res.ok) {
      return null;
    }
    const payload = (await res.json()) as { success?: boolean; profile?: AccountProfile | null };
    if (!payload?.success || !payload.profile) {
      return null;
    }
    return payload.profile;
  } catch {
    return null;
  }
}

export async function saveAccountProfile(_userId: string, email: string, nickname: string) {
  const trimmedNickname = nickname.trim();
  if (!trimmedNickname) {
    throw new Error("NICKNAME_REQUIRED");
  }

  const res = await apiFetch("/api/account/profile", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ nickname: trimmedNickname, email }),
  });

  if (!res.ok) {
    let error = "SAVE_FAILED";
    try {
      const payload = (await res.json()) as { error?: string };
      if (payload?.error) {
        error = payload.error;
      }
    } catch {
      // 忽略解析错误
    }
    throw new Error(error);
  }
}
