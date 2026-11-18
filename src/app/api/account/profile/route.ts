import { NextResponse } from "next/server";
import { verifyAuth } from "@/lib/auth-server";
import { sql, toIsoString } from "@/lib/db";

export const runtime = "nodejs";

const USERS_TABLE = "users";

export async function GET() {
  const user = await verifyAuth();
  if (!user) {
    return NextResponse.json({ success: false, error: "UNAUTHORIZED" }, { status: 401 });
  }

  const rows = await sql<{ nickname: string | null; email: string | null; created_at: string | null; updated_at: string | null }>(
    `SELECT nickname, email, created_at, updated_at FROM ${USERS_TABLE} WHERE uid = $1 LIMIT 1`,
    [user.uid],
  );

  const row = rows[0];
  if (!row) {
    return NextResponse.json({ success: false, error: "PROFILE_NOT_FOUND" }, { status: 404 });
  }

  return NextResponse.json({
    success: true,
    profile: {
      nickname: row.nickname ?? "",
      email: row.email ?? user.email ?? "",
      createdAt: toIsoString(row.created_at),
      updatedAt: toIsoString(row.updated_at),
    },
  });
}

export async function PUT(request: Request) {
  const user = await verifyAuth();
  if (!user) {
    return NextResponse.json({ success: false, error: "UNAUTHORIZED" }, { status: 401 });
  }

  let payload: { nickname?: unknown; email?: unknown };
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ success: false, error: "VALIDATION_ERROR" }, { status: 400 });
  }

  const nickname = typeof payload?.nickname === "string" ? payload.nickname.trim() : "";
  if (!nickname) {
    return NextResponse.json({ success: false, error: "NICKNAME_REQUIRED" }, { status: 400 });
  }

  const email = user.email ?? (typeof payload?.email === "string" ? payload.email.trim() : null);

  await sql(
    `INSERT INTO ${USERS_TABLE} (uid, email, nickname)
     VALUES ($1, $2, $3)
     ON CONFLICT (uid) DO UPDATE
     SET nickname = EXCLUDED.nickname, email = EXCLUDED.email, updated_at = now()`,
    [user.uid, email, nickname],
  );

  return NextResponse.json({ success: true });
}
