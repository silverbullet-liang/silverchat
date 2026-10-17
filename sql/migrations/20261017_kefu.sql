-- 客服账号支持（对已安装的站点执行）
ALTER TABLE users ADD COLUMN is_staff TINYINT NOT NULL DEFAULT 0 AFTER deleted_at;
