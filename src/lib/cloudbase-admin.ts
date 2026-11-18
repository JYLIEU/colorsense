/**
 * CloudBase 服务端封装（仅 Node.js 运行时，供 API routes 使用）。
 *
 * 使用 `CLOUDBASE_APIKEY`（service_role）以管理员身份初始化，
 * 可跨用户读写数据库、调用管理端接口。请勿将本文件 import 到客户端组件。
 */

import cloudbase from "@cloudbase/js-sdk";

const envId = process.env.NEXT_PUBLIC_CLOUDBASE_ENV_ID;
const apiKey = process.env.CLOUDBASE_APIKEY;

type CloudbaseApp = ReturnType<typeof cloudbase.init>;

let _app: CloudbaseApp | null = null;

export function getCloudbaseAdminDebugState() {
  return {
    cloudbaseEnvIdPresent: Boolean(envId),
    cloudbaseApiKeyPresent: Boolean(apiKey),
    cloudbaseAdminInitialized: _app !== null,
  };
}

export function getAdminApp(): CloudbaseApp {
  if (_app) {
    return _app;
  }

  if (!envId || !apiKey) {
    console.error("[cloudbase-admin] Missing configuration", {
      envIdPresent: Boolean(envId),
      apiKeyPresent: Boolean(apiKey),
    });
    throw new Error("CloudBase server configuration is missing: need NEXT_PUBLIC_CLOUDBASE_ENV_ID and CLOUDBASE_APIKEY.");
  }

  try {
    _app = cloudbase.init({ env: envId, accessKey: apiKey });
    return _app;
  } catch (error) {
    console.error("[cloudbase-admin] Initialization failed", {
      message: error instanceof Error ? error.message : String(error),
    });
    throw new Error("CloudBase Admin initialization failed. Check CLOUDBASE_APIKEY.");
  }
}

export function getAdminDb() {
  return getAdminApp().database();
}

export function getAdminAuth() {
  return getAdminApp().auth();
}
