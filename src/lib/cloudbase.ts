/**
 * CloudBase 客户端封装（仅浏览器环境使用）。
 *
 * 服务端（API routes）请使用 `@/lib/cloudbase-admin`，不要 import 本文件。
 */

import cloudbase from "@cloudbase/js-sdk";

const envId = process.env.NEXT_PUBLIC_CLOUDBASE_ENV_ID;

export function isCloudbaseConfigured() {
  return Boolean(envId);
}

type CloudbaseApp = ReturnType<typeof cloudbase.init>;

let _app: CloudbaseApp | null = null;

/**
 * 获取 CloudBase 应用实例（懒加载，仅在浏览器环境可用）。
 * 未配置环境 ID 或在服务端渲染时返回 null。
 */
export function getCbApp(): CloudbaseApp | null {
  if (typeof window === "undefined") {
    return null;
  }
  if (!envId) {
    return null;
  }
  if (!_app) {
    _app = cloudbase.init({ env: envId });
  }
  return _app;
}

export function getCbAuth() {
  const app = getCbApp();
  return app ? app.auth() : null;
}

export function getCbDb() {
  const app = getCbApp();
  return app ? app.database() : null;
}

/**
 * 获取当前登录用户的访问令牌，用于调用后端 API 的 Authorization 头。
 * 未初始化或未登录时返回 null。
 */
export async function getCbAccessToken(): Promise<string | null> {
  const auth = getCbAuth();
  if (!auth) {
    return null;
  }
  try {
    const res = await auth.getAccessToken();
    return res?.accessToken ?? null;
  } catch {
    return null;
  }
}

/**
 * 统一的登录用户类型，对齐 Firebase `User` 在本项目中使用到的字段，
 * 使原有消费 `currentUser` 的页面无需改造。
 */
export interface AuthUser {
  uid: string;
  email: string | null;
  displayName: string | null;
  photoURL?: string | null;
  emailVerified: boolean;
  providerData: { providerId: string }[];
  /** 返回访问令牌（accessToken），用于调用后端 API 的 Authorization 头。 */
  getIdToken: (forceRefresh?: boolean) => Promise<string>;
}

interface CloudbaseUserInfo {
  uid?: string;
  sub?: string;
  email?: string;
  displayName?: string;
  name?: string;
  picture?: string;
  email_verified?: boolean;
}

/**
 * 将 CloudBase 用户信息转换为项目内统一的 AuthUser。
 */
export function toAuthUser(info: CloudbaseUserInfo): AuthUser {
  const uid = info.uid || info.sub || "";
  return {
    uid,
    email: info.email ?? null,
    displayName: info.displayName || info.name || null,
    photoURL: info.picture ?? null,
    // CloudBase 邮箱注册必须通过 OTP 验证，字段缺失时视为已验证，与服务端语义一致。
    emailVerified: info.email_verified !== false,
    providerData: [{ providerId: "password" }],
    getIdToken: async () => {
      const auth = getCbAuth();
      if (!auth) {
        throw new Error("cloudbase auth is not available");
      }
      const res = await auth.getAccessToken();
      return res.accessToken;
    },
  };
}

/**
 * 调用自家 API route 时自动附加当前登录用户的 Authorization 头。
 * 服务端通过 `verifyAuth()` 校验该令牌，因此客户端无需关心 uid 传递。
 */
export async function apiFetch(url: string, init: RequestInit = {}): Promise<Response> {
  const token = await getCbAccessToken();
  const headers = new Headers(init.headers ?? undefined);
  if (token) {
    headers.set("Authorization", `Bearer ${token}`);
  }
  return fetch(url, { ...init, headers });
}

/**
 * 服务端时间。CloudBase 数据库实例提供 `serverDate()`（类型声明缺失，运行时存在），
 * 不可用时回退为客户端当前时间。
 */
export function cbServerDate(): Date {
  const db = getCbDb();
  if (!db) {
    return new Date();
  }
  const maybeServerDate = (db as unknown as { serverDate?: () => unknown }).serverDate;
  if (typeof maybeServerDate === "function") {
    try {
      const value = maybeServerDate.call(db);
      if (value instanceof Date) {
        return value;
      }
    } catch {
      // 回退
    }
  }
  return new Date();
}
