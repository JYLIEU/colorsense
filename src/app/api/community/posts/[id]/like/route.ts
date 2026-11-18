import { NextResponse } from "next/server";
import { verifyAuth } from "@/lib/auth-server";
import { sql } from "@/lib/db";

export const runtime = "nodejs";

const POSTS_TABLE = "community_posts";
const LIKES_TABLE = "community_likes";

interface RouteContext {
  params: { id: string };
}

async function postExists(postId: string) {
  const rows = await sql<{ id: number }>(`SELECT id FROM ${POSTS_TABLE} WHERE id = $1::bigint`, [postId]);
  return rows.length > 0;
}

async function isLiked(postId: string, uid: string) {
  const rows = await sql<{ post_id: number }>(
    `SELECT post_id FROM ${LIKES_TABLE} WHERE post_id = $1::bigint AND uid = $2`,
    [postId, uid],
  );
  return rows.length > 0;
}

export async function GET(_request: Request, { params }: RouteContext) {
  const user = await verifyAuth();
  if (!user) {
    return NextResponse.json({ success: false, error: "UNAUTHORIZED" }, { status: 401 });
  }

  if (!(await postExists(params.id))) {
    return NextResponse.json({ success: false, error: "POST_NOT_FOUND" }, { status: 404 });
  }

  return NextResponse.json({ success: true, liked: await isLiked(params.id, user.uid) });
}

export async function POST(_request: Request, { params }: RouteContext) {
  const user = await verifyAuth();
  if (!user) {
    return NextResponse.json({ success: false, error: "UNAUTHORIZED" }, { status: 401 });
  }

  if (!(await postExists(params.id))) {
    return NextResponse.json({ success: false, error: "POST_NOT_FOUND" }, { status: 404 });
  }

  const liked = await isLiked(params.id, user.uid);

  if (liked) {
    await sql(`DELETE FROM ${LIKES_TABLE} WHERE post_id = $1::bigint AND uid = $2`, [params.id, user.uid]);
    await sql(
      `UPDATE ${POSTS_TABLE} SET likes_count = GREATEST(0, likes_count - 1), updated_at = now() WHERE id = $1::bigint`,
      [params.id],
    );
    return NextResponse.json({ success: true, liked: false });
  }

  await sql(
    `INSERT INTO ${LIKES_TABLE} (post_id, uid) VALUES ($1::bigint, $2) ON CONFLICT DO NOTHING`,
    [params.id, user.uid],
  );
  await sql(`UPDATE ${POSTS_TABLE} SET likes_count = likes_count + 1, updated_at = now() WHERE id = $1::bigint`, [
    params.id,
  ]);
  return NextResponse.json({ success: true, liked: true });
}
