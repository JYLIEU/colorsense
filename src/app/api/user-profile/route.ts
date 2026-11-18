import { NextResponse } from "next/server";
import { verifyAuth } from "@/lib/auth-server";
import { sql } from "@/lib/db";
import { buildUserProfilePromptContext } from "@/lib/user-profile-summary";
import type { UserStyleProfile, UserStyleProfileInput } from "@/lib/user-profile-types";

export const runtime = "nodejs";

const USERS_TABLE = "users";
const PROFILES_TABLE = "user_profiles";

function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null ? (value as Record<string, unknown>) : {};
}

function asString(value: unknown) {
  return typeof value === "string" ? value.trim() : undefined;
}

function asStringList(value: unknown) {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.filter((item): item is string => typeof item === "string").map((item) => item.trim()).filter(Boolean);
}

function normalizeProfileInput(payload: unknown): UserStyleProfileInput {
  const root = asRecord(payload);
  const requiredInfo = asRecord(root.requiredInfo);
  const optionalInfo = asRecord(root.optionalInfo);
  const externalFeatures = asRecord(root.externalFeatures);
  const styleTendency = asRecord(root.styleTendency);

  return {
    requiredInfo: {
      gender: asString(requiredInfo.gender),
      genderOther: asString(requiredInfo.genderOther),
      ageRange: asString(requiredInfo.ageRange),
      dailyScene: asString(requiredInfo.dailyScene),
      dailySceneOther: asString(requiredInfo.dailySceneOther),
    },
    optionalInfo: {
      skinTone: asString(optionalInfo.skinTone),
      eyeColor: asString(optionalInfo.eyeColor),
      hairColor: asString(optionalInfo.hairColor),
      stylePreferences: asStringList(optionalInfo.stylePreferences),
      stylePreferenceOther: asString(optionalInfo.stylePreferenceOther),
      makeupPreferences: asStringList(optionalInfo.makeupPreferences),
      makeupPreferenceOther: asString(optionalInfo.makeupPreferenceOther),
      favoriteColors: asStringList(optionalInfo.favoriteColors),
    },
    externalFeatures: {
      faceContour: asStringList(externalFeatures.faceContour),
      facialDetails: asStringList(externalFeatures.facialDetails),
      skinHairContrast: asStringList(externalFeatures.skinHairContrast),
    },
    styleTendency: {
      values: asStringList(styleTendency.values),
      other: asString(styleTendency.other),
    },
  };
}

function hasRequiredInfo(profile: UserStyleProfileInput) {
  const { gender, genderOther, ageRange, dailyScene, dailySceneOther } = profile.requiredInfo;
  const hasGender = Boolean(gender && (gender !== "其他" || genderOther));
  const hasDailyScene = Boolean(dailyScene && (dailyScene !== "其他" || dailySceneOther));
  return hasGender && Boolean(ageRange) && hasDailyScene;
}

export async function GET() {
  const user = await verifyAuth();
  if (!user) {
    return NextResponse.json({ success: false, error: "UNAUTHORIZED" }, { status: 401 });
  }

  const userRows = await sql<{ email: string | null; onboarding_completed: boolean }>(
    `SELECT email, onboarding_completed FROM ${USERS_TABLE} WHERE uid = $1 LIMIT 1`,
    [user.uid],
  ).catch(() => []);
  const profileRows = await sql<{ data: UserStyleProfile | null }>(
    `SELECT data FROM ${PROFILES_TABLE} WHERE uid = $1 LIMIT 1`,
    [user.uid],
  ).catch(() => []);

  const userData = userRows[0] ?? null;
  const profileData = profileRows[0]?.data ?? null;

  return NextResponse.json({
    success: true,
    user: {
      uid: user.uid,
      email: user.email ?? userData?.email ?? null,
    },
    onboardingCompleted: userData?.onboarding_completed === true,
    profile: profileData ?? null,
  });
}

export async function PUT(request: Request) {
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

  const profileInput = normalizeProfileInput(payload);
  if (!hasRequiredInfo(profileInput)) {
    return NextResponse.json({ success: false, error: "REQUIRED_INFO_MISSING" }, { status: 400 });
  }

  const promptContext = buildUserProfilePromptContext(profileInput);
  const profileData: UserStyleProfile = {
    ...profileInput,
    aiPromptReady: true,
    promptContext,
    updatedAt: new Date().toISOString(),
  };

  try {
    // PostgreSQL 无需事务：users 先 upsert（user_profiles 外键依赖它），再 upsert 问卷。
    await sql(
      `INSERT INTO ${USERS_TABLE} (uid, email, onboarding_completed, profile_version)
       VALUES ($1, $2, TRUE, 2)
       ON CONFLICT (uid) DO UPDATE
       SET email = EXCLUDED.email, onboarding_completed = TRUE, profile_version = 2, updated_at = now()`,
      [user.uid, user.email ?? null],
    );

    await sql(
      `INSERT INTO ${PROFILES_TABLE} (uid, data)
       VALUES ($1, $2::jsonb)
       ON CONFLICT (uid) DO UPDATE
       SET data = EXCLUDED.data, updated_at = now()`,
      [user.uid, JSON.stringify(profileData)],
    );

    // 异步触发 AI 形象档案生成，转发原始 Authorization 头以通过鉴权
    const authHeader = request.headers.get("authorization");
    const appUrl = process.env.NEXT_PUBLIC_APP_URL?.trim() || "http://localhost:3001";
    void fetch(`${appUrl}/api/generate-profile-advice`, {
      method: "POST",
      headers: authHeader ? { Authorization: authHeader } : {},
    }).catch(() => undefined);
  } catch (error) {
    console.error("[user-profile] save failed", {
      message: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json({ success: false, error: "SAVE_FAILED" }, { status: 500 });
  }

  return NextResponse.json({
    success: true,
    onboardingCompleted: true,
    profileId: "questionnaire",
  });
}
