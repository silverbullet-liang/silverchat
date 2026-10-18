-- 2026-10-19：语音/视频通话（WebRTC P2P，服务器只转发信令、保存记录）
-- 已安装的站点执行一次本文件即可；新安装由 sql/schema.sql 直接建表。

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
