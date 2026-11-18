import { NextResponse } from "next/server";
import { verifyAuth } from "@/lib/auth-server";
import { sql, toIsoString } from "@/lib/db";
import type { Diagnosis } from "@/lib/types";

export const runtime = "nodejs";

function toDiagnosis(row: {
  id: number | string;
  user_id: string;
  data: Partial<Diagnosis> | null;
  scores: Record<string, number> | null;
  doubao_advice: unknown;
  created_at: string | null;
}): Diagnosis {
  const data = row.data && typeof row.data === "object" ? row.data : {};
  return {
    ...(data as Diagnosis),
    id: String(row.id),
    userId: row.user_id,
    scores: (row.scores ?? {}) as Diagnosis["scores"],
    doubaoAdvice: row.doubao_advice as Diagnosis["doubaoAdvice"],
    createdAt: toIsoString(row.created_at) ?? new Date().toISOString(),
  };
}

export async function GET(_request: Request, context: { params: { id: string } }) {
  const user = await verifyAuth();
  if (!user) {
    return NextResponse.json({ success: false, error: "UNAUTHORIZED" }, { status: 401 });
  }

  const rows = await sql<{ id: number; user_id: string; data: Partial<Diagnosis> | null; scores: Record<string, number> | null; doubao_advice: unknown; created_at: string | null }>(
    `SELECT id, user_id, data, scores, doubao_advice, created_at
     FROM diagnoses
     WHERE id = $1::bigint
     LIMIT 1`,
    [context.params.id],
  );

  const row = rows[0];
  if (!row) {
    return NextResponse.json({ success: false, error: "DIAGNOSIS_NOT_FOUND" }, { status: 404 });
  }
  if (row.user_id !== user.uid) {
    return NextResponse.json({ success: false, error: "FORBIDDEN" }, { status: 403 });
  }

  return NextResponse.json({ success: true, diagnosis: toDiagnosis(row) });
}

export async function DELETE(_request: Request, context: { params: { id: string } }) {
  const user = await verifyAuth();
  if (!user) {
    return NextResponse.json({ success: false, error: "UNAUTHORIZED" }, { status: 401 });
  }

  const rows = await sql<{ user_id: string }>(`SELECT user_id FROM diagnoses WHERE id = $1::bigint`, [context.params.id]);
  const row = rows[0];
  if (!row) {
    return NextResponse.json({ success: false, error: "DIAGNOSIS_NOT_FOUND" }, { status: 404 });
  }
  if (row.user_id !== user.uid) {
    return NextResponse.json({ success: false, error: "FORBIDDEN" }, { status: 403 });
  }

  await sql(`DELETE FROM diagnoses WHERE id = $1::bigint`, [context.params.id]);

  return NextResponse.json({ success: true });
}
