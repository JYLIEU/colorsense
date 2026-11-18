import { NextResponse } from "next/server";
import { verifyAuth } from "@/lib/auth-server";
import { sql } from "@/lib/db";

export const runtime = "nodejs";

interface ErrorEntry {
  id: string;
  error: string;
}

export async function POST(request: Request) {
  const user = await verifyAuth();
  if (!user) {
    return NextResponse.json({ success: false, error: "UNAUTHORIZED" }, { status: 401 });
  }

  let ids: unknown;
  try {
    ids = (await request.json())?.ids;
  } catch {
    return NextResponse.json({ success: false, error: "VALIDATION_ERROR" }, { status: 400 });
  }

  if (!Array.isArray(ids) || ids.length === 0) {
    return NextResponse.json({ success: false, error: "VALIDATION_ERROR" }, { status: 400 });
  }

  const failed: ErrorEntry[] = [];

  for (const rawId of ids) {
    if (typeof rawId !== "string" && typeof rawId !== "number") {
      continue;
    }
    const id = String(rawId);
    try {
      const rows = await sql<{ user_id: string }>(`SELECT user_id FROM diagnoses WHERE id = $1::bigint`, [id]);
      const row = rows[0];
      if (!row) {
        failed.push({ id, error: "诊断记录不存在。" });
        continue;
      }
      if (row.user_id !== user.uid) {
        failed.push({ id, error: "无权删除该诊断记录。" });
        continue;
      }
      await sql(`DELETE FROM diagnoses WHERE id = $1::bigint`, [id]);
    } catch (error) {
      failed.push({ id, error: error instanceof Error ? error.message : "删除失败。" });
    }
  }

  if (failed.length > 0) {
    return NextResponse.json({ success: false, error: "DELETE_FAILED", details: failed }, { status: 500 });
  }

  return NextResponse.json({ success: true, deletedCount: ids.length });
}
