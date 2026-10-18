-- SilverChat 数据库结构（MySQL 5.7+ / MariaDB，utf8mb4）
-- 所有时间均为 Unix 时间戳（INT UNSIGNED）

CREATE TABLE IF NOT EXISTS users (
  id               INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  public_id        VARCHAR(20) NOT NULL,
  username_enc     TEXT NOT NULL,
  username_bidx    CHAR(64) NOT NULL,
  password_hash    VARCHAR(255) NOT NULL,
  nickname_enc     TEXT DEFAULT NULL,
  avatar           VARCHAR(255) NOT NULL DEFAULT '',
  gender           TINYINT NOT NULL DEFAULT 0,
  signature_enc    TEXT DEFAULT NULL,
  sec_question_enc TEXT DEFAULT NULL,
  sec_answer_hash  VARCHAR(255) NOT NULL DEFAULT '',
  public_key       TEXT DEFAULT NULL,
  created_at       INT UNSIGNED NOT NULL,
  deleted_at       INT UNSIGNED DEFAULT NULL,
  is_staff         TINYINT NOT NULL DEFAULT 0,
  UNIQUE KEY uk_public_id (public_id),
  UNIQUE KEY uk_username_bidx (username_bidx)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS user_tokens (
  token_hash CHAR(64) NOT NULL PRIMARY KEY,
  user_id    INT UNSIGNED NOT NULL,
  device_id  VARCHAR(64) NOT NULL DEFAULT '',
  expires_at INT UNSIGNED NOT NULL,
  created_at INT UNSIGNED NOT NULL DEFAULT 0,
  KEY idx_user (user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS user_devices (
  id           INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id      INT UNSIGNED NOT NULL,
  device_id    VARCHAR(64) NOT NULL,
  public_key   TEXT NOT NULL,
  user_agent   VARCHAR(255) NOT NULL DEFAULT '',
  created_at   INT UNSIGNED NOT NULL,
  last_seen_at INT UNSIGNED NOT NULL,
  UNIQUE KEY uk_device (user_id, device_id),
  KEY idx_user (user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS login_attempts (
  id            BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  username_bidx CHAR(64) NOT NULL,
  ip            VARCHAR(45) NOT NULL,
  created_at    INT UNSIGNED NOT NULL,
  KEY idx_user_time (username_bidx, created_at),
  KEY idx_ip_time (ip, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS rate_limits (
  id         BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  bucket     VARCHAR(96) NOT NULL,
  created_at INT UNSIGNED NOT NULL,
  KEY idx_bucket_time (bucket, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS friends (
  user_id    INT UNSIGNED NOT NULL,
  friend_id  INT UNSIGNED NOT NULL,
  remark_enc TEXT DEFAULT NULL,
  is_starred TINYINT UNSIGNED NOT NULL DEFAULT 0,
  status     TINYINT NOT NULL DEFAULT 1,
  created_at INT UNSIGNED NOT NULL,
  PRIMARY KEY (user_id, friend_id),
  KEY idx_friend (friend_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS friend_requests (
  id          BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  from_id     INT UNSIGNED NOT NULL,
  to_id       INT UNSIGNED NOT NULL,
  message_enc TEXT DEFAULT NULL,
  status      TINYINT NOT NULL DEFAULT 0,
  created_at  INT UNSIGNED NOT NULL,
  handled_at  INT UNSIGNED DEFAULT NULL,
  UNIQUE KEY uk_pending (from_id, to_id, status),
  KEY idx_to_status (to_id, status),
  KEY idx_from (from_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS conversations (
  id          BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  type        TINYINT UNSIGNED NOT NULL DEFAULT 1,
  conv_key    VARCHAR(64) NOT NULL,
  last_msg_id BIGINT UNSIGNED NOT NULL DEFAULT 0,
  last_msg_at INT UNSIGNED NOT NULL DEFAULT 0,
  UNIQUE KEY uk_conv_key (conv_key)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS user_conversations (
  user_id      INT UNSIGNED NOT NULL,
  conv_id      BIGINT UNSIGNED NOT NULL,
  unread       INT UNSIGNED NOT NULL DEFAULT 0,
  last_seen_id BIGINT UNSIGNED NOT NULL DEFAULT 0,
  is_pinned    TINYINT UNSIGNED NOT NULL DEFAULT 0,
  is_muted     TINYINT UNSIGNED NOT NULL DEFAULT 0,
  is_deleted   TINYINT UNSIGNED NOT NULL DEFAULT 0,
  updated_at   INT UNSIGNED NOT NULL DEFAULT 0,
  PRIMARY KEY (user_id, conv_id),
  KEY idx_user_updated (user_id, updated_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS messages (
  id            BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  conv_id       BIGINT UNSIGNED NOT NULL,
  sender_id     INT UNSIGNED NOT NULL,
  type          TINYINT UNSIGNED NOT NULL DEFAULT 1,
  content       TEXT NOT NULL,
  extra         TEXT DEFAULT NULL,
  client_msg_id VARCHAR(64) DEFAULT NULL,
  status        TINYINT NOT NULL DEFAULT 1,
  created_at    INT UNSIGNED NOT NULL,
  UNIQUE KEY uk_client (sender_id, client_msg_id),
  KEY idx_conv_id (conv_id, id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `groups` (
  id         INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  public_id  VARCHAR(20) NOT NULL,
  name_enc   TEXT DEFAULT NULL,
  avatar     VARCHAR(255) NOT NULL DEFAULT '',
  join_mode  TINYINT NOT NULL DEFAULT 1,
  owner_id   INT UNSIGNED NOT NULL,
  notice_enc TEXT DEFAULT NULL,
  created_at INT UNSIGNED NOT NULL,
  UNIQUE KEY uk_gp_public (public_id),
  KEY idx_owner (owner_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS group_members (
  group_id           INT UNSIGNED NOT NULL,
  user_id            INT UNSIGNED NOT NULL,
  role               TINYINT NOT NULL DEFAULT 0,
  group_nickname_enc TEXT DEFAULT NULL,
  joined_at          INT UNSIGNED NOT NULL,
  PRIMARY KEY (group_id, user_id),
  KEY idx_user (user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS emoji_packages (
  id          INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  name        VARCHAR(64) NOT NULL,
  source      VARCHAR(16) NOT NULL DEFAULT 'builtin',
  package_key VARCHAR(64) NOT NULL,
  UNIQUE KEY uk_pkg (source, package_key)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS emojis (
  id         INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  package_id INT UNSIGNED NOT NULL,
  name       VARCHAR(64) NOT NULL,
  url        VARCHAR(255) NOT NULL,
  is_gif     TINYINT UNSIGNED NOT NULL DEFAULT 0,
  sort_no    INT UNSIGNED NOT NULL DEFAULT 0,
  KEY idx_pkg (package_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS media_files (
  id          BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  file_path   VARCHAR(255) NOT NULL,
  file_type   TINYINT NOT NULL,
  file_size   INT UNSIGNED NOT NULL,
  uploader_id INT UNSIGNED NOT NULL,
  msg_id      BIGINT UNSIGNED DEFAULT NULL,
  expired_at  INT UNSIGNED NOT NULL,
  deleted     TINYINT NOT NULL DEFAULT 0,
  created_at  INT UNSIGNED NOT NULL,
  KEY idx_expired (expired_at, deleted),
  KEY idx_uploader (uploader_id, expired_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS cleanup_failures (
  id         BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  file_path  VARCHAR(255) NOT NULL,
  error      VARCHAR(255) NOT NULL,
  created_at INT UNSIGNED NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS moment_posts (
  id               BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  author_id        INT UNSIGNED NOT NULL,
  text_content_enc TEXT DEFAULT NULL,
  visibility       TINYINT NOT NULL DEFAULT 1,
  like_count       INT UNSIGNED NOT NULL DEFAULT 0,
  comment_count    INT UNSIGNED NOT NULL DEFAULT 0,
  status           TINYINT NOT NULL DEFAULT 1,
  created_at       INT UNSIGNED NOT NULL,
  KEY idx_author_time (author_id, created_at),
  KEY idx_time (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS moment_media (
  id         BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  post_id    BIGINT UNSIGNED NOT NULL,
  media_url  VARCHAR(255) NOT NULL,
  media_type TINYINT NOT NULL DEFAULT 1,
  sort_no    TINYINT NOT NULL DEFAULT 0,
  expired_at INT UNSIGNED NOT NULL,
  KEY idx_post (post_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS moment_likes (
  post_id    BIGINT UNSIGNED NOT NULL,
  user_id    INT UNSIGNED NOT NULL,
  created_at INT UNSIGNED NOT NULL,
  PRIMARY KEY (post_id, user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS moment_comments (
  id          BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  post_id     BIGINT UNSIGNED NOT NULL,
  user_id     INT UNSIGNED NOT NULL,
  content_enc TEXT NOT NULL,
  reply_to    BIGINT UNSIGNED DEFAULT NULL,
  status      TINYINT NOT NULL DEFAULT 1,
  created_at  INT UNSIGNED NOT NULL,
  KEY idx_post_time (post_id, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS moment_visibility (
  post_id BIGINT UNSIGNED NOT NULL,
  user_id INT UNSIGNED NOT NULL,
  PRIMARY KEY (post_id, user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS user_consents (
  id          BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id     INT UNSIGNED NOT NULL,
  doc_type    VARCHAR(32) NOT NULL,
  doc_version VARCHAR(16) NOT NULL,
  agreed_at   INT UNSIGNED NOT NULL,
  ip          VARCHAR(45) NOT NULL,
  user_agent  VARCHAR(255) NOT NULL DEFAULT '',
  UNIQUE KEY uk_user_doc_version (user_id, doc_type, doc_version),
  KEY idx_user (user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS account_deletion_requests (
  id           BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id      INT UNSIGNED NOT NULL,
  status       TINYINT NOT NULL DEFAULT 0,
  requested_at INT UNSIGNED NOT NULL,
  processed_at INT UNSIGNED DEFAULT NULL,
  KEY idx_user (user_id),
  KEY idx_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS settings (
  k VARCHAR(64) NOT NULL PRIMARY KEY,
  v VARCHAR(255) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 群会话密钥：每位成员持有一份由群成员用 ECDH 封装的密文，服务器无法解密
CREATE TABLE IF NOT EXISTS group_keys (
  group_id   INT UNSIGNED NOT NULL,
  user_id    INT UNSIGNED NOT NULL,
  wrapped    TEXT NOT NULL,
  created_at INT UNSIGNED NOT NULL,
  PRIMARY KEY (group_id, user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 语音/视频通话：媒体走 WebRTC P2P，服务器只存通话记录
CREATE TABLE IF NOT EXISTS calls (
  id         BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  conv_id    INT UNSIGNED NOT NULL,
  caller_id  INT UNSIGNED NOT NULL,
  callee_id  INT UNSIGNED NOT NULL,
  media_type TINYINT UNSIGNED NOT NULL DEFAULT 1,
  status     TINYINT NOT NULL DEFAULT 0,
  started_at INT UNSIGNED NOT NULL DEFAULT 0,
  ended_at   INT UNSIGNED NOT NULL DEFAULT 0,
  created_at INT UNSIGNED NOT NULL,
  KEY idx_callee_status (callee_id, status),
  KEY idx_conv (conv_id, id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 信令（SDP / ICE）：只在通话存续期间需要，结束后删除
CREATE TABLE IF NOT EXISTS call_signals (
  id         BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  call_id    BIGINT UNSIGNED NOT NULL,
  from_id    INT UNSIGNED NOT NULL,
  to_id      INT UNSIGNED NOT NULL,
  kind       VARCHAR(16) NOT NULL,
  payload    MEDIUMTEXT NOT NULL,
  created_at INT UNSIGNED NOT NULL,
  KEY idx_to (to_id, id),
  KEY idx_call (call_id, id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
