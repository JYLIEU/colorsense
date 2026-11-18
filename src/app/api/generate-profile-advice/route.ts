import { NextResponse } from "next/server";
import { verifyAuth } from "@/lib/auth-server";
import { sql } from "@/lib/db";
import { generateProfileAdvice } from "@/lib/ai";
import { UserStyleProfile } from "@/lib/user-profile-types";

export const runtime = "nodejs";

const PROFILES_TABLE = "user_profiles";

export async function POST(request: Request) {
  const user = await verifyAuth();
  if (!user) {
    return NextResponse.json({ success: false, error: "UNAUTHORIZED" }, { status: 401 });
  }

  try {
    const rows = await sql<{ data: UserStyleProfile | null }>(
      `SELECT data FROM ${PROFILES_TABLE} WHERE uid = $1 LIMIT 1`,
      [user.uid],
    );
    const data = rows[0]?.data;
    if (!data) {
      return NextResponse.json({ success: false, error: "PROFILE_NOT_FOUND" }, { status: 404 });
    }

    const profile = data as unknown as UserStyleProfile;

    if (!profile.promptContext?.summaryText) {
      return NextResponse.json({ success: false, error: "PROMPT_CONTEXT_MISSING" }, { status: 400 });
    }

    console.info("[api/generate-profile-advice] Generating profile advice for user:", user.uid);

    const advice = await generateProfileAdvice(profile.promptContext.summaryText);

    // 将生成的建议合并回 data 列（jsonb || 顶层合并，保留其余字段）
    await sql(
      `UPDATE ${PROFILES_TABLE}
       SET data = data || $2::jsonb, updated_at = now()
       WHERE uid = $1`,
      [user.uid, JSON.stringify({ generatedProfileAdvice: advice, updatedAt: new Date().toISOString() })],
    );

    return NextResponse.json({
      success: true,
      data: advice,
    });
  } catch (error) {
    console.error("[api/generate-profile-advice] Request failed:", error);
    return NextResponse.json(
      { success: false, error: "Internal server error during profile advice generation." },
      { status: 500 },
    );
  }
}
