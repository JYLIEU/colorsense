-- 我们这套 PostgreSQL 表结构备份（CloudBase 迁移用，2026-11-18T15:25:57.684Z）
-- 已切换为队友的 cs_* 方案，此处仅作历史备份，需要时按顺序执行即可重建。

DROP TABLE IF EXISTS users;
CREATE TABLE users (
  uid text NOT NULL,
  email text,
  onboarding_completed boolean DEFAULT false NOT NULL,
  profile_version integer DEFAULT 0 NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  nickname text,
  CONSTRAINT users_pkey PRIMARY KEY (uid)
);


DROP TABLE IF EXISTS user_profiles;
CREATE TABLE user_profiles (
  uid text NOT NULL,
  data jsonb DEFAULT '{}'::jsonb NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT user_profiles_uid_fkey FOREIGN KEY (uid) REFERENCES users(uid) ON DELETE CASCADE,
  CONSTRAINT user_profiles_pkey PRIMARY KEY (uid)
);


DROP TABLE IF EXISTS diagnoses;
CREATE TABLE diagnoses (
  id bigint DEFAULT nextval('diagnoses_id_seq'::regclass) NOT NULL,
  user_id text NOT NULL,
  season_type text,
  confidence real,
  source text,
  scores jsonb,
  doubao_advice jsonb,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  data jsonb DEFAULT '{}'::jsonb,
  CONSTRAINT diagnoses_pkey PRIMARY KEY (id)
);

CREATE INDEX idx_diagnoses_user_id ON public.diagnoses USING btree (user_id);

DROP TABLE IF EXISTS outfit_records;
CREATE TABLE outfit_records (
  id bigint DEFAULT nextval('outfit_records_id_seq'::regclass) NOT NULL,
  user_id text NOT NULL,
  request jsonb DEFAULT '{}'::jsonb NOT NULL,
  result jsonb DEFAULT '{}'::jsonb NOT NULL,
  source text DEFAULT 'mock'::text NOT NULL,
  image_url text,
  outfit_id text,
  result_id text,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT outfit_records_pkey PRIMARY KEY (id)
);

CREATE INDEX idx_outfit_records_user_id ON public.outfit_records USING btree (user_id);

DROP TABLE IF EXISTS community_posts;
CREATE TABLE community_posts (
  id bigint DEFAULT nextval('community_posts_id_seq'::regclass) NOT NULL,
  user_id text NOT NULL,
  user_name text,
  title text DEFAULT ''::text NOT NULL,
  content text DEFAULT ''::text NOT NULL,
  tags jsonb DEFAULT '[]'::jsonb NOT NULL,
  image_url text,
  likes_count integer DEFAULT 0 NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  user_email text,
  season_type text,
  comment_count integer DEFAULT 0 NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT community_posts_pkey PRIMARY KEY (id)
);

CREATE INDEX idx_community_posts_created_at ON public.community_posts USING btree (created_at DESC);

DROP TABLE IF EXISTS community_likes;
CREATE TABLE community_likes (
  post_id bigint NOT NULL,
  uid text NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT community_likes_post_id_fkey FOREIGN KEY (post_id) REFERENCES community_posts(id) ON DELETE CASCADE,
  CONSTRAINT community_likes_pkey PRIMARY KEY (post_id, uid)
);


DROP TABLE IF EXISTS community_comments;
CREATE TABLE community_comments (
  id bigint DEFAULT nextval('community_comments_id_seq'::regclass) NOT NULL,
  post_id bigint NOT NULL,
  user_id text NOT NULL,
  user_name text,
  content text DEFAULT ''::text NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  user_email text,
  CONSTRAINT community_comments_post_id_fkey FOREIGN KEY (post_id) REFERENCES community_posts(id) ON DELETE CASCADE,
  CONSTRAINT community_comments_pkey PRIMARY KEY (id)
);

CREATE INDEX idx_community_comments_post_id ON public.community_comments USING btree (post_id);
