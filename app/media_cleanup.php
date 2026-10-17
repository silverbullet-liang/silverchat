<?php
declare(strict_types=1);

require_once __DIR__ . '/helpers.php';

/**
 * 媒体惰性清理：四个触发点（历史消息、上传、登录、轮询）共用。
 * 只删除 media/ 目录内的文件，路径经 realpath 校验，防目录穿越。
 */
function sc_lazy_cleanup(int $limit = 15, int $uploaderId = 0, int $convId = 0): int
{
    $limit = max(1, min(50, $limit));
    $now = time();
    $sql = 'SELECT id, file_path, msg_id FROM media_files
            WHERE deleted = 0 AND expired_at > 0 AND expired_at < ?';
    $params = array($now);
    if ($uploaderId > 0) {
        $sql .= ' AND uploader_id = ?';
        $params[] = $uploaderId;
    }
    if ($convId > 0) {
        $sql .= ' AND msg_id IN (SELECT id FROM messages WHERE conv_id = ?)';
        $params[] = $convId;
    }
    $sql .= ' ORDER BY expired_at ASC LIMIT ' . $limit;

    $rows = db_all($sql, $params);
    $done = 0;
    $mediaRoot = realpath(SC_ROOT . '/media');
    foreach ($rows as $r) {
        $abs = realpath(SC_ROOT . '/' . $r['file_path']);
        try {
            if ($abs !== false && $mediaRoot !== false && strpos($abs, $mediaRoot . '/') === 0 && is_file($abs)) {
                if (!@unlink($abs)) {
                    throw new RuntimeException('unlink failed');
                }
            }
            db_exec('UPDATE media_files SET deleted = 1 WHERE id = ?', array((int) $r['id']));
            if ($r['msg_id'] !== null) {
                db_exec(
                    'UPDATE messages SET content = ?, extra = ? WHERE id = ?',
                    array('expired', json_encode(array('expired' => true), JSON_UNESCAPED_UNICODE), (int) $r['msg_id'])
                );
            }
            $done++;
        } catch (Exception $e) {
            db_insert(
                'INSERT INTO cleanup_failures (file_path, error, created_at) VALUES (?,?,?)',
                array((string) $r['file_path'], mb_substr($e->getMessage(), 0, 200, 'UTF-8'), time())
            );
        }
    }
    return $done;
}

function sc_lazy_cleanup_by_user(int $userId, int $limit = 15): int
{
    return sc_lazy_cleanup($limit, $userId, 0);
}

function sc_lazy_cleanup_by_conv(int $convId, int $limit = 15): int
{
    return sc_lazy_cleanup($limit, 0, $convId);
}

/** 轮询计数：每第 20 次触发一次全局清理。 */
function sc_poll_tick_cleanup(int $userId)
{
    $n = (int) db_val("SELECT v FROM settings WHERE k = 'poll_tick'");
    $n++;
    db_exec("INSERT INTO settings (k, v) VALUES ('poll_tick', ?) ON DUPLICATE KEY UPDATE v = VALUES(v)", array((string) $n));
    if ($n % 20 === 0) {
        sc_lazy_cleanup(10);
    }
}
