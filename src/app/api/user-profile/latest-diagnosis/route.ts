import { NextResponse } from "next/server";
import { verifyAuth } from "@/lib/auth-server";
import { sql, toIsoString } from "@/lib/db";

export const runtime = "nodejs";

export async function GET() {
  const user = await verifyAuth();
  if (!user) {
    return NextResponse.json({ success: false, error: "UNAUTHORIZED" }, { status: 401 });
  }

  const rows = await sql<{ id: number; season_type: string; confidence: number; source: string; created_at: string }>(
    `SELECT id, season_type, confidence, source, created_at
     FROM diagnoses
     WHERE user_id = $1
     ORDER BY created_at DESC
     LIMIT 1`,
    [user.uid],
  );

  const row = rows[0];
  if (!row) {
    return NextResponse.json({ success: false, error: "DIAGNOSIS_NOT_FOUND" }, { status: 404 });
  }

  return NextResponse.json({
    success: true,
    diagnosis: {
      id: String(row.id),
      seasonType: row.season_type,
      confidence: row.confidence,
      source: row.source,
      createdAt: toIsoString(row.created_at),
    },
  });
}
