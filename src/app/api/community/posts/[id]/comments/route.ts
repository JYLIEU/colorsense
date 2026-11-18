import { NextResponse } from "next/server";
import { verifyAuth } from "@/lib/auth-server";
import { sql, toIsoString } from "@/lib/db";
import type { CommunityComment } from "@/lib/firestore-community-posts";

export const runtime = "nodejs";

const POSTS_TABLE = "community_posts";
const COMMENTS_TABLE = "community_comments";

interface RouteContext {
  params: { id: string };
}

interface CommentRow {
  id: number | string;
  post_id: number | string;
  user_id: string;
  user_name: string | null;
  user_email: string | null;
  content: string | null;
  created_at: string | null;
}

function emailPrefix(email: string | null | undefined) {
  const trimmed = email?.trim();
  if (!trimmed) {
    return "ColorSense 用户";
  }
  const prefix = trimmed.split("@")[0]?.trim();
  return prefix || "ColorSense 用户";
}

function toCommunityComment(row: CommentRow): CommunityComment {
  return {
    id: String(row.id),
    postId: String(row.post_id),
    uid: row.user_id,
    userEmail: row.user_email ?? "",
    userName: row.user_name?.trim() ? row.user_name.trim() : emailPrefix(row.user_email),
    content: row.content ?? "",
    createdAt: toIsoString(row.created_at),
  };
}

async function postExists(postId: string) {
  const rows = await sql<{ id: number }>(`SELECT id FROM ${POSTS_TABLE} WHERE id = $1::bigint`, [postId]);
  return rows.length > 0;
}

function asRecord(value: unknown) {
  return typeof value === "object" && value !== null ? (value as Record<string, unknown>) : {};
}

function asString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

export async function GET(_request: Request, { params }: RouteContext) {
  const user = await verifyAuth();
  if (!user) {
    return NextResponse.json({ success: false, error: "UNAUTHORIZED" }, { status: 401 });
  }

  if (!(await postExists(params.id))) {
    return NextResponse.json({ success: false, error: "POST_NOT_FOUND" }, { status: 404 });
  }

  const rows = await sql<CommentRow>(
    `SELECT id, post_id, user_id, user_name, user_email, content, created_at
     FROM ${COMMENTS_TABLE}
     WHERE post_id = $1::bigint
     ORDER BY created_at ASC`,
    [params.id],
  );

  return NextResponse.json({ success: true, comments: rows.map(toCommunityComment) });
}

export async function POST(request: Request, { params }: RouteContext) {
  const user = await verifyAuth();
  if (!user) {
    return NextResponse.json({ success: false, error: "UNAUTHORIZED" }, { status: 401 });
  }

  if (!(await postExists(params.id))) {
    return NextResponse.json({ success: false, error: "POST_NOT_FOUND" }, { status: 404 });
  }

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ success: false, error: "VALIDATION_ERROR" }, { status: 400 });
  }

  const content = asString(asRecord(payload).content);
  if (!content) {
    return NextResponse.json({ success: false, error: "COMMENT_CONTENT_REQUIRED" }, { status: 400 });
  }

  const userName = asString(asRecord(payload).userName);

  const inserted = await sql<{ id: number }>(
    `INSERT INTO ${COMMENTS_TABLE} (post_id, user_id, user_name, user_email, content)
     VALUES ($1::bigint, $2, $3, $4, $5)
     RETURNING id`,
    [params.id, user.uid, userName || null, user.email ?? null, content],
  );

  const commentId = inserted[0]?.id !== undefined ? String(inserted[0].id) : "";
  if (!commentId) {
    return NextResponse.json({ success: false, error: "评论失败：未返回记录 ID。" }, { status: 500 });
  }

  await sql(
    `UPDATE ${POSTS_TABLE} SET comment_count = comment_count + 1, updated_at = now() WHERE id = $1::bigint`,
    [params.id],
  );

  return NextResponse.json({ success: true, id: commentId });
}
