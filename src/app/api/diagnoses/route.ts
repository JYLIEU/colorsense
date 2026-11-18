import { NextResponse } from "next/server";
import { verifyAuth } from "@/lib/auth-server";
import { sql, toIsoString } from "@/lib/db";
import type { Diagnosis, NewDiagnosis } from "@/lib/types";

export const runtime = "nodejs";

interface DiagnosisRow {
  id: number | string;
  user_id: string;
  data: Partial<Diagnosis> | null;
  scores: Record<string, number> | null;
  doubao_advice: unknown;
  created_at: string | null;
}

function toDiagnosis(row: DiagnosisRow): Diagnosis {
  const data = row.data && typeof row.data === "object" ? row.data : {};
  return {
    ...(data as Omit<Diagnosis, "id" | "userId" | "scores" | "doubaoAdvice" | "createdAt">),
    id: String(row.id),
    userId: row.user_id,
    scores: (row.scores ?? {}) as Diagnosis["scores"],
    doubaoAdvice: row.doubao_advice as Diagnosis["doubaoAdvice"],
    createdAt: toIsoString(row.created_at) ?? new Date().toISOString(),
  };
}

const SELECT_COLUMNS = "id, user_id, data, scores, doubao_advice, created_at";

export async function GET() {
  const user = await verifyAuth();
  if (!user) {
    return NextResponse.json({ success: false, error: "UNAUTHORIZED" }, { status: 401 });
  }

  const rows = await sql<DiagnosisRow>(
    `SELECT ${SELECT_COLUMNS} FROM diagnoses WHERE user_id = $1 ORDER BY created_at DESC`,
    [user.uid],
  );

  return NextResponse.json({ success: true, diagnoses: rows.map(toDiagnosis) });
}

function asRecord(value: unknown) {
  return typeof value === "object" && value !== null ? (value as Record<string, unknown>) : {};
}

function asString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function asStringList(value: unknown) {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string").map((item) => item.trim()).filter(Boolean)
    : [];
}

function asNumber(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function asOptionalNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function asOptionalBoolean(value: unknown): boolean | undefined {
  return typeof value === "boolean" ? value : undefined;
}

function asOptionalRecord(value: unknown): Record<string, number> | undefined {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return undefined;
  }
  const result: Record<string, number> = {};
  for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
    if (typeof item === "number" && Number.isFinite(item)) {
      result[key] = item;
    }
  }
  return result;
}

export async function POST(request: Request) {
  const user = await verifyAuth();
  if (!user) {
    return NextResponse.json({ success: false, error: "UNAUTHORIZED" }, { status: 401 });
  }

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ success: false, error: "VALIDATION_ERROR" }, { status: 400 });
  }

  const root = asRecord(payload);
  const labFeatures = asRecord(root.labFeatures);
  const input: NewDiagnosis = {
    seasonType: asString(root.seasonType) as NewDiagnosis["seasonType"],
    confidence: asNumber(root.confidence),
    colorPalette: asStringList(root.colorPalette),
    styleKeywords: asStringList(root.styleKeywords),
    avoidColors: asStringList(root.avoidColors),
    aiDescription: asString(root.aiDescription),
    labFeatures: {
      L: asNumber(labFeatures.L),
      a: asNumber(labFeatures.a),
      b: asNumber(labFeatures.b),
    },
    source: asString(root.source) === "mock" ? "mock" : asString(root.source) === "rules" ? "rules" : "model",
    ...(asOptionalRecord(root.scores) === undefined ? {} : { scores: asOptionalRecord(root.scores) }),
    ...(asOptionalBoolean(root.faceDetected) === undefined ? {} : { faceDetected: root.faceDetected as boolean }),
    ...(asOptionalBoolean(root.usedOriginalImage) === undefined ? {} : { usedOriginalImage: root.usedOriginalImage as boolean }),
    ...(asOptionalNumber(root.faceConfidence) === undefined ? {} : { faceConfidence: root.faceConfidence as number }),
  };

  if (!input.seasonType || !input.colorPalette.length) {
    return NextResponse.json({ success: false, error: "VALIDATION_ERROR" }, { status: 400 });
  }

  const inserted = await sql<{ id: number }>(
    `INSERT INTO diagnoses (user_id, season_type, confidence, source, scores, doubao_advice, data)
     VALUES ($1, $2, $3, $4, $5::jsonb, $6::jsonb, $7::jsonb)
     RETURNING id`,
    [
      user.uid,
      input.seasonType,
      input.confidence,
      input.source,
      input.scores === undefined ? null : JSON.stringify(input.scores),
      root.doubaoAdvice === undefined || root.doubaoAdvice === null ? null : JSON.stringify(root.doubaoAdvice),
      JSON.stringify({ ...input, ...(root.doubaoAdvice === undefined ? {} : { doubaoAdvice: root.doubaoAdvice }) }),
    ],
  );

  const id = inserted[0]?.id !== undefined ? String(inserted[0].id) : "";
  if (!id) {
    return NextResponse.json({ success: false, error: "创建诊断记录失败。" }, { status: 500 });
  }

  return NextResponse.json({ success: true, id });
}
