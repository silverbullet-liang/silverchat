<?php
declare(strict_types=1);

require_once __DIR__ . '/media_cleanup.php';

/**
 * 媒体模块。
 * - 聊天媒体：浏览器用会话密钥加密后上传，服务器只存密文（A 类），下载原样返回。
 * - 动态媒体：多接收者无法共享会话密钥，改为服务器端加密存储（B 类），下载时解密，签名 URL 受控访问。
 * file_type: 1图片 2语音 3视频 4文件（A 类）；11图片 12语音 13视频 14文件（B 类）
 */

function sc_media_token(int $mediaId, int $ttl = 3600): string
{
    $exp = time() + max(60, $ttl);
    $sig = substr(hash_hmac('sha256', $mediaId . '|' . $exp, sc_master_key()), 0, 32);
    return $sig . '.' . $exp;
}

function sc_media_token_valid(int $mediaId, string $token): bool
{
    $parts = explode('.', $token);
    if (count($parts) !== 2) {
        return false;
    }
    $exp = (int) $parts[1];
    if ($exp < time()) {
        return false;
    }
    $expected = substr(hash_hmac('sha256', $mediaId . '|' . $exp, sc_master_key()), 0, 32);
    return hash_equals($expected, $parts[0]);
}

function sc_media_url(int $mediaId, bool $signed = false): string
{
    if (!$signed) {
        return '/api/media/' . $mediaId;
    }
    return '/api/media/' . $mediaId . '?t=' . urlencode(sc_media_token($mediaId));
}

/** POST /api/upload （multipart：file, type=1|2|3|4, scope=chat|moment） */
function api_upload()
{
    $u = sc_require_auth();
    sc_rate('up:' . (int) $u['id'], (int) sc_cfg('limits.upload_per_hour', 120), 3600, 1004);

    if (!isset($_FILES['file']) || !is_array($_FILES['file'])) {
        sc_fail(1001, '没有收到文件');
    }
    $f = $_FILES['file'];
    if ((int) $f['error'] !== UPLOAD_ERR_OK) {
        sc_fail(1503);
    }
    $type = sc_int($_POST['type'] ?? 1, 1);
    $scope = (string) ($_POST['scope'] ?? 'chat');
    $serverSide = $scope === 'moment'; // 动态媒体由服务器加密存储

    $limits = array(
        1 => (int) sc_cfg('media.max_image', 5242880),
        2 => (int) sc_cfg('media.max_voice', 10485760),
        3 => (int) sc_cfg('media.max_video', 52428800),
        4 => (int) sc_cfg('media.max_file', 20971520),
    );
    if (!isset($limits[$type])) {
        sc_fail(1001);
    }
    $size = (int) $f['size'];
    if ($size <= 0 || $size > $limits[$type]) {
        sc_fail(1501, '文件超过 ' . round($limits[$type] / 1048576, 1) . ' MB 限制');
    }

    $month = date('Ym');
    $dir = SC_ROOT . '/media/' . $month;
    if (!sc_ensure_dir($dir)) {
        sc_fail(1503);
    }
    $name = random_hex(16) . '.enc';
    $rel = 'media/' . $month . '/' . $name;
    $abs = SC_ROOT . '/' . $rel;

    if ($serverSide) {
        $raw = file_get_contents($f['tmp_name']);
        if ($raw === false || $raw === '') {
            sc_fail(1503);
        }
        if (@file_put_contents($abs, field_encrypt($raw)) === false) {
            sc_fail(1503);
        }
        @unlink($f['tmp_name']);
    } else {
        if (!move_uploaded_file($f['tmp_name'], $abs)) {
            if (!@copy($f['tmp_name'], $abs)) {
                sc_fail(1503);
            }
            @unlink($f['tmp_name']);
        }
    }

    $storedType = $serverSide ? $type + 10 : $type;
    $id = db_insert(
        'INSERT INTO media_files (file_path, file_type, file_size, uploader_id, msg_id, expired_at, deleted, created_at)
         VALUES (?,?,?,?,NULL,?,0,?)',
        array($rel, $storedType, $size, (int) $u['id'], time() + (int) sc_cfg('media.ttl', 604800), time())
    );

    sc_lazy_cleanup(15);

    sc_json(array(
        'media_id'   => $id,
        'url'        => sc_media_url($id, true),
        'size'       => $size,
        'expired_at' => time() + (int) sc_cfg('media.ttl', 604800),
    ));
}

/** 判断当前用户能否读取该媒体。 */
function sc_media_can_read(array $media, int $userId): bool
{
    if ((int) $media['uploader_id'] === $userId) {
        return true;
    }
    if ($media['msg_id'] !== null) {
        $convId = (int) db_val('SELECT conv_id FROM messages WHERE id = ?', array((int) $media['msg_id']));
        if ($convId > 0 && sc_conv_for_user($convId, $userId)) {
            return true;
        }
    }
    $posts = db_all('SELECT post_id FROM moment_media WHERE media_url = ?', array((string) (int) $media['id']));
    foreach ($posts as $p) {
        $post = db_one('SELECT * FROM moment_posts WHERE id = ?', array((int) $p['post_id']));
        if ($post && sc_moment_visible($post, $userId)) {
            return true;
        }
    }
    return false;
}

function sc_media_not_found(int $status, string $msg): void
{
    http_response_code($status);
    header('Content-Type: application/json; charset=utf-8');
    echo json_encode(array('code' => 1504, 'msg' => $msg, 'data' => null), JSON_UNESCAPED_UNICODE);
    exit;
}

/** GET /api/media/:id —— A 类返回密文，B 类解密后返回。 */
function api_media_output(int $mediaId)
{
    $signed = isset($_GET['t']) && sc_media_token_valid($mediaId, (string) $_GET['t']);
    if (!$signed) {
        $u = sc_require_auth();
        $userId = (int) $u['id'];
    } else {
        $userId = 0;
    }

    $media = db_one('SELECT * FROM media_files WHERE id = ? LIMIT 1', array($mediaId));
    if (!$media || (int) $media['deleted'] === 1) {
        sc_media_not_found(410, '文件已过期');
    }
    if (!$signed && !sc_media_can_read($media, $userId)) {
        http_response_code(403);
        exit;
    }
    $abs = realpath(SC_ROOT . '/' . $media['file_path']);
    $root = realpath(SC_ROOT . '/media');
    if ($abs === false || $root === false || strpos($abs, $root . '/') !== 0 || !is_file($abs)) {
        sc_media_not_found(410, '文件已过期');
    }

    $type = (int) $media['file_type'];
    if ($type >= 11) {
        // B 类：服务器解密后按原类型输出
        $plain = field_decrypt(file_get_contents($abs));
        if ($plain === null) {
            sc_media_not_found(410, '文件已损坏');
        }
        $mime = array(11 => 'image/jpeg', 12 => 'audio/webm', 13 => 'video/mp4', 14 => 'application/octet-stream');
        header('Content-Type: ' . (isset($mime[$type]) ? $mime[$type] : 'application/octet-stream'));
        header('Content-Length: ' . strlen($plain));
        header('Cache-Control: private, max-age=3600');
        header('X-Content-Type-Options: nosniff');
        echo $plain;
        exit;
    }

    header('Content-Type: application/octet-stream');
    header('Content-Length: ' . filesize($abs));
    header('Cache-Control: private, max-age=3600');
    header('X-Content-Type-Options: nosniff');
    readfile($abs);
    exit;
}
