import { NextResponse } from "next/server";
import { verifyAuth } from "@/lib/auth-server";
import { sql, toIsoString } from "@/lib/db";
import type { CommunityPost } from "@/lib/firestore-community-posts";

export const runtime = "nodejs";

const POSTS_TABLE = "community_posts";

interface PostRow {
  id: number | string;
  user_id: string;
  user_name: string | null;
  user_email: string | null;
  content: string | null;
  season_type: string | null;
  tags: string[] | null;
  likes_count: number;
  comment_count: number;
  created_at: string | null;
  updated_at: string | null;
}

function emailPrefix(email: string | null | undefined) {
  const trimmed = email?.trim();
  if (!trimmed) {
    return "ColorSense 用户";
  }
  const prefix = trimmed.split("@")[0]?.trim();
  return prefix || "ColorSense 用户";
}

function toCommunityPost(row: PostRow): CommunityPost {
  return {
    id: String(row.id),
    uid: row.user_id,
    userEmail: row.user_email ?? "",
    userName: row.user_name?.trim() ? row.user_name.trim() : emailPrefix(row.user_email),
    content: row.content ?? "",
    seasonType: row.season_type?.trim() ? row.season_type : undefined,
    tags: Array.isArray(row.tags) ? row.tags.filter((item): item is string => typeof item === "string" && Boolean(item.trim())) : undefined,
    likeCount: row.likes_count,
    commentCount: row.comment_count,
    createdAt: toIsoString(row.created_at),
    updatedAt: toIsoString(row.updated_at),
  };
}

const SELECT_COLUMNS = `
  id, user_id, user_name, user_email, content, season_type, tags, likes_count, comment_count, created_at, updated_at
`;

export async function GET() {
  const user = await verifyAuth();
  if (!user) {
    return NextResponse.json({ success: false, error: "UNAUTHORIZED" }, { status: 401 });
  }

  const rows = await sql<PostRow>(
    `SELECT ${SELECT_COLUMNS} FROM ${POSTS_TABLE} ORDER BY created_at DESC LIMIT 100`,
  );

  return NextResponse.json({ success: true, posts: rows.map(toCommunityPost) });
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
  const content = asString(root.content);
  if (!content) {
    return NextResponse.json({ success: false, error: "CONTENT_REQUIRED" }, { status: 400 });
  }

  const seasonType = asString(root.seasonType);
  const tags = asStringList(root.tags);
  const userName = asString(root.userName);

  const inserted = await sql<{ id: number }>(
    `INSERT INTO ${POSTS_TABLE} (user_id, user_name, user_email, content, season_type, tags)
     VALUES ($1, $2, $3, $4, $5, $6::jsonb)
     RETURNING id`,
    [user.uid, userName || null, user.email ?? null, content, seasonType || null, JSON.stringify(tags)],
  );

  const id = inserted[0]?.id !== undefined ? String(inserted[0].id) : "";
  if (!id) {
    return NextResponse.json({ success: false, error: "发布失败：未返回记录 ID。" }, { status: 500 });
  }

  return NextResponse.json({ success: true, id });
}
