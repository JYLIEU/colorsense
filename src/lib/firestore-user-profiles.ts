import { sql } from "./db";
import { UserStyleProfile } from "./user-profile-types";

// CloudBase 本环境只有 PostgreSQL。问卷数据存 user_profiles 表，
// 整份 UserStyleProfile JSON 存入 data 列，uid 既是主键也是外键。
const PROFILE_TABLE = "user_profiles";

export async function getUserProfile(userId: string): Promise<UserStyleProfile | null> {
  const rows = await sql<{ data: UserStyleProfile | null }>(`SELECT data FROM ${PROFILE_TABLE} WHERE uid = $1 LIMIT 1`, [
    userId,
  ]);
  const data = rows[0]?.data;
  if (!data || typeof data !== "object") {
    return null;
  }
  return data as UserStyleProfile;
}
