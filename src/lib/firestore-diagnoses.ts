import { apiFetch } from "./cloudbase";
import type { Diagnosis, NewDiagnosis } from "./types";

interface ApiListResponse {
  success?: boolean;
  error?: string;
  diagnoses?: Diagnosis[];
}

interface ApiDetailResponse {
  success?: boolean;
  error?: string;
  diagnosis?: Diagnosis;
}

interface ApiCreateResponse {
  success?: boolean;
  error?: string;
  id?: string;
}

/**
 * 客户端诊断记录访问层。
 * PostgreSQL 只能通过服务端 API route 访问（API Key 不能进客户端），
 * uid 由服务端从 accessToken 解析，客户端传入仅为保持旧签名兼容。
 */
export async function createDiagnosis(_userId: string, input: NewDiagnosis) {
  const res = await apiFetch("/api/diagnoses", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });

  const payload = (await res.json().catch(() => ({}))) as ApiCreateResponse;
  if (!res.ok || !payload?.success || !payload.id) {
    throw new Error(payload?.error ?? "创建诊断记录失败。");
  }
  return payload.id;
}

export async function listUserDiagnoses(_userId: string) {
  const res = await apiFetch("/api/diagnoses");
  const payload = (await res.json().catch(() => ({}))) as ApiListResponse;
  if (!res.ok || !payload?.success) {
    throw new Error(payload?.error ?? "无法读取诊断记录。");
  }
  return payload.diagnoses ?? [];
}

export async function getUserDiagnosis(id: string, _userId: string) {
  const res = await apiFetch(`/api/diagnoses/${encodeURIComponent(id)}`);
  if (res.status === 404) {
    return null;
  }
  const payload = (await res.json().catch(() => ({}))) as ApiDetailResponse;
  if (!res.ok || !payload?.success) {
    throw new Error(payload?.error ?? "无法读取诊断记录。");
  }
  return payload.diagnosis ?? null;
}

export async function deleteUserDiagnosis(id: string, _userId: string) {
  const res = await apiFetch(`/api/diagnoses/${encodeURIComponent(id)}`, { method: "DELETE" });
  if (!res.ok) {
    const payload = (await res.json().catch(() => ({}))) as ApiDetailResponse;
    throw new Error(payload?.error ?? "无法删除不属于当前用户的记录。");
  }
}
