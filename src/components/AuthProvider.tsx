"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { getCbAuth, isCloudbaseConfigured, toAuthUser, type AuthUser } from "@/lib/cloudbase";
import { getAccountProfile, type AccountProfile } from "@/lib/firestore-account-profile";

const DEFAULT_ACCOUNT_LABEL = "已登录用户";

export interface AuthContextValue {
  currentUser: AuthUser | null;
  accountProfile: AccountProfile | null;
  accountLabel: string;
  loading: boolean;
  isAuthenticated: boolean;
  refreshCurrentUser: () => Promise<AuthUser | null>;
  refreshAccountProfile: () => Promise<AccountProfile | null>;
  logout: () => Promise<void>;
}

export const AuthContext = createContext<AuthContextValue | undefined>(undefined);

interface PickedUserInfo {
  uid: string;
  email?: string;
  displayName?: string;
  email_verified?: boolean;
}

/** 兼容 CloudBase 多种返回形状（{data:{...}} / {...} / {user:{...}}）。 */
function pickUserInfo(raw: unknown): PickedUserInfo {
  const outer = (raw as { data?: unknown } | null | undefined)?.data ?? raw;
  const record = (outer as Record<string, unknown> | null) ?? {};
  const user = (record.user as Record<string, unknown> | null) ?? {};
  return {
    uid: String(record.uid ?? record.sub ?? user.uid ?? user.sub ?? ""),
    email: (record.email as string | undefined) ?? (user.email as string | undefined),
    displayName: (record.displayName as string | undefined) ?? (record.name as string | undefined) ?? (user.displayName as string | undefined) ?? (user.name as string | undefined),
    email_verified: (record.email_verified as boolean | undefined) ?? (user.email_verified as boolean | undefined),
  };
}

async function fetchCurrentAuthUser(forceRefresh = false): Promise<AuthUser | null> {
  const auth = getCbAuth();
  if (!auth) {
    return null;
  }

  try {
    if (forceRefresh && typeof (auth as { refreshUser?: () => Promise<unknown> }).refreshUser === "function") {
      try {
        await (auth as { refreshUser: () => Promise<unknown> }).refreshUser();
      } catch {
        // 忽略刷新失败，继续读取缓存用户
      }
    }

    const picked = pickUserInfo(await auth.getUser());
    if (picked.uid) {
      return toAuthUser(picked);
    }

    // getUser 未返回 uid（可能未登录），再确认一次登录态
    const statePicked = pickUserInfo(await auth.getLoginState());
    return statePicked.uid ? toAuthUser(statePicked) : null;
  } catch (error) {
    console.error("[AuthProvider] 获取用户信息失败", error);
    return null;
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [currentUser, setCurrentUser] = useState<AuthUser | null>(null);
  const [accountProfile, setAccountProfile] = useState<AccountProfile | null>(null);
  const [loading, setLoading] = useState(true);

  const refreshCurrentUser = useCallback(async () => {
    const user = await fetchCurrentAuthUser(true);
    setCurrentUser(user);
    return user;
  }, []);

  const refreshAccountProfile = useCallback(async () => {
    if (!currentUser?.uid) {
      setAccountProfile(null);
      return null;
    }
    const profile = await getAccountProfile(currentUser.uid);
    setAccountProfile(profile);
    return profile;
  }, [currentUser?.uid]);

  const logout = useCallback(async () => {
    const auth = getCbAuth();
    if (auth) {
      try {
        await auth.signOut();
      } catch (error) {
        console.error("[AuthProvider] 登出失败", error);
      }
    }
    setCurrentUser(null);
    setAccountProfile(null);
  }, []);

  useEffect(() => {
    if (!isCloudbaseConfigured()) {
      console.warn("[AuthProvider] CloudBase 未配置：NEXT_PUBLIC_CLOUDBASE_ENV_ID 缺失。");
      setLoading(false);
      return;
    }

    let unsubscribe: (() => void) | undefined;
    let cancelled = false;

    (async () => {
      await refreshCurrentUser();
      if (cancelled) {
        return;
      }

      const auth = getCbAuth();
      if (auth?.onAuthStateChange) {
        try {
          const subscriptionResult = auth.onAuthStateChange(() => {
            void refreshCurrentUser();
          });
          unsubscribe = (subscriptionResult as { data?: { subscription?: { unsubscribe?: () => void } } })?.data?.subscription?.unsubscribe;
        } catch (error) {
          console.error("[AuthProvider] 订阅登录态变化失败", error);
        }
      }

      setLoading(false);
    })();

    return () => {
      cancelled = true;
      unsubscribe?.();
    };
  }, [refreshCurrentUser]);

  useEffect(() => {
    if (currentUser?.uid) {
      void refreshAccountProfile();
    } else {
      setAccountProfile(null);
    }
  }, [currentUser?.uid, refreshAccountProfile]);

  const accountLabel = useMemo(() => {
    if (accountProfile?.nickname?.trim()) {
      return accountProfile.nickname.trim();
    }
    if (currentUser?.displayName?.trim()) {
      return currentUser.displayName.trim();
    }
    if (currentUser?.email?.trim()) {
      return currentUser.email.trim();
    }
    return currentUser ? DEFAULT_ACCOUNT_LABEL : "";
  }, [accountProfile?.nickname, currentUser]);

  const isAuthenticated = currentUser !== null && currentUser.emailVerified !== false;

  const value = useMemo<AuthContextValue>(
    () => ({
      currentUser,
      accountProfile,
      accountLabel,
      loading,
      isAuthenticated,
      refreshCurrentUser,
      refreshAccountProfile,
      logout,
    }),
    [currentUser, accountProfile, accountLabel, loading, isAuthenticated, refreshCurrentUser, refreshAccountProfile, logout],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth 必须在 AuthProvider 内部使用。");
  }
  return context;
}
