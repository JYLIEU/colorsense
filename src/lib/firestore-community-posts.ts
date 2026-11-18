import { apiFetch } from "./cloudbase";

export interface CommunityPost {
  id: string;
  uid: string;
  userEmail: string;
  userName: string;
  content: string;
  seasonType?: string;
  tags?: string[];
  likeCount: number;
  commentCount: number;
  createdAt: string | null;
  updatedAt: string | null;
}

export interface NewCommunityPost {
  uid: string;
  userEmail: string;
  userName: string;
  content: string;
  seasonType?: string;
  tags?: string[];
}

export interface CommunityComment {
  id: string;
  postId?: string;
  uid: string;
  userEmail: string;
  userName: string;
  content: string;
  createdAt: string | null;
}

export interface NewCommunityComment {
  uid: string;
  userEmail: string;
  userName: string;
  content: string;
}

export type Unsubscribe = () => void;

/** 服务端实时推送不可用，这里以「首次拉取 + 定时轮询」替代，接口保持兼容。 */
const POLL_INTERVAL_MS = 5000;

interface PostsListResponse {
  success?: boolean;
  error?: string;
  posts?: CommunityPost[];
}

interface LikeStatusResponse {
  success?: boolean;
  error?: string;
  liked?: boolean;
}

interface CommentsListResponse {
  success?: boolean;
  error?: string;
  comments?: CommunityComment[];
}

interface CreateResponse {
  success?: boolean;
  error?: string;
  id?: string;
}

function toError(value: unknown): Error {
  return value instanceof Error ? value : new Error(String(value));
}

function encodePostId(postId: string) {
  return encodeURIComponent(postId);
}

export function getCommunityUserName(email: string | null | undefined) {
  const trimmedEmail = email?.trim();
  if (!trimmedEmail) {
    return "ColorSense 用户";
  }

  const prefix = trimmedEmail.split("@")[0]?.trim();
  return prefix || "ColorSense 用户";
}

export async function createCommunityPost(input: NewCommunityPost) {
  const content = input.content.trim();
  if (!content) {
    throw new Error("CONTENT_REQUIRED");
  }

  const res = await apiFetch("/api/community/posts", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      content,
      ...(input.seasonType ? { seasonType: input.seasonType } : {}),
      tags: input.tags ?? [],
    }),
  });

  const payload = (await res.json().catch(() => ({}))) as CreateResponse;
  console.log("[社区调试] 发布结果:", { ok: res.ok, payload });
  if (!res.ok || !payload?.success || !payload.id) {
    throw new Error(payload?.error ?? "发布失败：未返回记录 ID。");
  }
  return payload.id;
}

export function subscribeCommunityPosts(
  onNext: (posts: CommunityPost[]) => void,
  onError: (error: Error) => void,
): Unsubscribe {
  let cancelled = false;

  const fetchPosts = async () => {
    if (cancelled) {
      return;
    }
    try {
      const res = await apiFetch("/api/community/posts");
      const payload = (await res.json().catch(() => ({}))) as PostsListResponse;
      if (!res.ok || !payload?.success) {
        throw new Error(payload?.error ?? "拉取动态失败。");
      }
      const posts = payload.posts ?? [];
      console.log("[社区调试] 拉取动态成功:", {
        count: posts.length,
        preview: posts.slice(0, 3).map((post) => ({
          id: post.id,
          uid: post.uid,
          userName: post.userName,
          createdAt: post.createdAt,
        })),
      });
      onNext(posts);
    } catch (error) {
      console.error("[社区调试] 拉取动态失败:", error);
      onError(toError(error));
    }
  };

  void fetchPosts();
  const timer = setInterval(() => {
    void fetchPosts();
  }, POLL_INTERVAL_MS);

  return () => {
    cancelled = true;
    clearInterval(timer);
  };
}

export function subscribePostLike(
  postId: string,
  _uid: string,
  onNext: (liked: boolean) => void,
  onError: (error: Error) => void,
): Unsubscribe {
  let cancelled = false;

  const fetchLike = async () => {
    if (cancelled) {
      return;
    }
    try {
      const res = await apiFetch(`/api/community/posts/${encodePostId(postId)}/like`);
      const payload = (await res.json().catch(() => ({}))) as LikeStatusResponse;
      if (!res.ok || !payload?.success) {
        throw new Error(payload?.error ?? "查询点赞状态失败。");
      }
      onNext(Boolean(payload.liked));
    } catch (error) {
      console.error("[社区调试] 点赞状态查询失败:", error);
      onError(toError(error));
    }
  };

  void fetchLike();
  const timer = setInterval(() => {
    void fetchLike();
  }, POLL_INTERVAL_MS);

  return () => {
    cancelled = true;
    clearInterval(timer);
  };
}

export async function toggleCommunityPostLike(input: { postId: string; uid: string; userEmail: string }) {
  const res = await apiFetch(`/api/community/posts/${encodePostId(input.postId)}/like`, { method: "POST" });
  const payload = (await res.json().catch(() => ({}))) as LikeStatusResponse;
  if (!res.ok || !payload?.success) {
    throw new Error(payload?.error ?? "更新点赞状态失败。");
  }
  return Boolean(payload.liked);
}

export function subscribePostComments(
  postId: string,
  onNext: (comments: CommunityComment[]) => void,
  onError: (error: Error) => void,
): Unsubscribe {
  let cancelled = false;

  const fetchComments = async () => {
    if (cancelled) {
      return;
    }
    try {
      const res = await apiFetch(`/api/community/posts/${encodePostId(postId)}/comments`);
      const payload = (await res.json().catch(() => ({}))) as CommentsListResponse;
      if (!res.ok || !payload?.success) {
        throw new Error(payload?.error ?? "拉取评论失败。");
      }
      onNext(payload.comments ?? []);
    } catch (error) {
      console.error("[社区调试] 评论拉取失败:", error);
      onError(toError(error));
    }
  };

  void fetchComments();
  const timer = setInterval(() => {
    void fetchComments();
  }, POLL_INTERVAL_MS);

  return () => {
    cancelled = true;
    clearInterval(timer);
  };
}

export async function createCommunityPostComment(postId: string, input: NewCommunityComment) {
  const content = input.content.trim();
  if (!content) {
    throw new Error("COMMENT_CONTENT_REQUIRED");
  }

  const res = await apiFetch(`/api/community/posts/${encodePostId(postId)}/comments`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ content }),
  });

  const payload = (await res.json().catch(() => ({}))) as CreateResponse;
  if (!res.ok || !payload?.success || !payload.id) {
    throw new Error(payload?.error ?? "评论失败：未返回记录 ID。");
  }
  return payload.id;
}
