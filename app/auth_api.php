<?php
declare(strict_types=1);

require_once __DIR__ . '/helpers.php';
require_once __DIR__ . '/legal.php';

/** 用户名规则（与前端保持一致）。 */
function sc_username_error(string $name)
{
    if (mb_strlen($name, 'UTF-8') < 2 || mb_strlen($name, 'UTF-8') > 20) {
        return 1106;
    }
    if (!preg_match('/^[\x{4e00}-\x{9fa5}A-Za-z0-9_\-\.@#\$&\+\x{3400}-\x{4DBF}]{2,20}$/u', $name)) {
        return 1104;
    }
    if (preg_match('/^[\._\-]|[\._\-]$/u', $name)) {
        return 1105;
    }
    if (preg_match('/[\s\x{3000}\x{00A0}]/u', $name)) {
        return 1104;
    }
    if (function_exists('mb_check_encoding') && !mb_check_encoding($name, 'UTF-8')) {
        return 1104;
    }
    // 控制字符与零宽字符
    if (preg_match('/[\x00-\x1F\x7F\x{200B}-\x{200F}\x{202A}-\x{202E}\x{2060}-\x{2064}\x{FEFF}]/u', $name)) {
        return 1104;
    }
    return 0;
}

function sc_valid_public_key(string $key): bool
{
    if ($key === '') {
        return false;
    }
    // 单算法写法：x25519:<base64>
    if (preg_match('/^(x25519|p256):[A-Za-z0-9+\/=]{40,200}$/', $key)) {
        return true;
    }
    // 客户端实际提交的是双算法 JSON：{"x25519":"…","p256":"…"}
    if ($key[0] === '{') {
        $data = json_decode($key, true);
        if (!is_array($data)) {
            return false;
        }
        $ok = false;
        foreach (array('x25519', 'p256') as $alg) {
            if (!isset($data[$alg])) {
                continue;
            }
            if (!is_string($data[$alg]) || !preg_match('#^[A-Za-z0-9+/=]{40,200}$#', $data[$alg])) {
                return false;
            }
            $ok = true;
        }
        return $ok;
    }
    return false;
}

function sc_valid_device_id(string $id): bool
{
    return (bool) preg_match('/^[A-Za-z0-9_\-]{8,64}$/', $id);
}

function sc_issue_token(int $userId, string $deviceId): string
{
    $token = token_new();
    db_exec(
        'INSERT INTO user_tokens (token_hash, user_id, device_id, expires_at, created_at) VALUES (?,?,?,?,?)',
        array(token_hash($token), $userId, $deviceId, time() + 7 * 86400, time())
    );
    return $token;
}

function sc_record_consents(int $userId, array $versions)
{
    $current = sc_legal_versions();
    $ip = sc_client_ip();
    $ua = sc_user_agent();
    foreach (array('privacy', 'terms', 'cross-border') as $type) {
        $version = isset($versions[$type]) ? (string) $versions[$type] : '';
        if ($version === '' || $version !== $current[$type]) {
            continue;
        }
        db_exec(
            'INSERT IGNORE INTO user_consents (user_id, doc_type, doc_version, agreed_at, ip, user_agent) VALUES (?,?,?,?,?,?)',
            array($userId, $type, $version, time(), $ip, $ua)
        );
    }
}

function sc_consents_of(int $userId): array
{
    $rows = db_all(
        'SELECT doc_type, doc_version, agreed_at FROM user_consents WHERE user_id = ? ORDER BY agreed_at DESC',
        array($userId)
    );
    $out = array();
    foreach ($rows as $r) {
        if (!isset($out[$r['doc_type']])) {
            $out[$r['doc_type']] = array('version' => $r['doc_version'], 'agreed_at' => (int) $r['agreed_at']);
        }
    }
    return $out;
}

function sc_needs_reconsent(int $userId): bool
{
    $current = sc_legal_versions();
    foreach (array('privacy', 'terms', 'cross-border') as $type) {
        $ok = db_val(
            'SELECT 1 FROM user_consents WHERE user_id = ? AND doc_type = ? AND doc_version = ? LIMIT 1',
            array($userId, $type, $current[$type])
        );
        if (!$ok) {
            return true;
        }
    }
    return false;
}

/** POST /api/auth/register */
function api_auth_register()
{
    sc_rate('reg:' . sc_client_ip(), (int) sc_cfg('limits.register_per_hour', 3), 3600, 1004);

    $in = sc_input();
    $username = trim(sc_str(sc_in('username'), 40));
    $password = is_string(sc_in('password')) ? sc_in('password') : '';
    $nickname = trim(sc_str(sc_in('nickname'), 32));
    $publicKey = trim(sc_str(sc_in('public_key'), 300));
    $deviceId = trim(sc_str(sc_in('device_id'), 64));
    $versions = sc_in('consent_versions', array());

    $uErr = sc_username_error($username);
    if ($uErr !== 0) {
        sc_fail($uErr);
    }
    if (mb_strlen($password, 'UTF-8') < 6 || strlen($password) > 200) {
        sc_fail(1001, '密码至少 6 位');
    }
    if (mb_strlen($nickname, 'UTF-8') < 1 || mb_strlen($nickname, 'UTF-8') > 16) {
        sc_fail(1001, '昵称需为 1–16 个字符');
    }
    if (!sc_valid_public_key($publicKey)) {
        sc_fail(1001, '加密公钥无效');
    }
    if (!sc_valid_device_id($deviceId)) {
        sc_fail(1001, '设备标识无效');
    }
    if (!is_array($versions)) {
        sc_fail(1701);
    }
    $current = sc_legal_versions();
    foreach (array('privacy', 'terms', 'cross-border') as $type) {
        if (!isset($versions[$type]) || (string) $versions[$type] !== $current[$type]) {
            sc_fail(1701);
        }
    }

    $bidx = blind_index($username);
    if (db_val('SELECT 1 FROM users WHERE username_bidx = ? LIMIT 1', array($bidx))) {
        sc_fail(1101);
    }

    $hash = password_hash($password, PASSWORD_BCRYPT, array('cost' => 12));
    $secQuestion = trim(sc_str(sc_in('sec_question'), 100));
    $secAnswer = trim(sc_str(sc_in('sec_answer'), 100));

    try {
        $userId = db_tx(function () use ($username, $bidx, $hash, $nickname, $publicKey, $deviceId, $secQuestion, $secAnswer) {
            $id = db_insert(
                'INSERT INTO users (public_id, username_enc, username_bidx, password_hash, nickname_enc, avatar,
                    gender, signature_enc, sec_question_enc, sec_answer_hash, public_key, created_at)
                 VALUES (?,?,?,?,?,"",0,NULL,?,?,?,?)',
                array(
                    'tmp_' . bin2hex(random_bytes(6)),
                    field_encrypt($username),
                    $bidx,
                    $hash,
                    field_encrypt($nickname),
                    $secQuestion !== '' ? field_encrypt($secQuestion) : null,
                    $secAnswer !== '' ? password_hash(mb_strtolower($secAnswer, 'UTF-8'), PASSWORD_BCRYPT, array('cost' => 12)) : '',
                    $publicKey,
                    time(),
                )
            );
            $pid = public_id_new($id);
            db_exec('UPDATE users SET public_id = ? WHERE id = ?', array($pid, $id));
            db_exec(
                'INSERT INTO user_devices (user_id, device_id, public_key, user_agent, created_at, last_seen_at) VALUES (?,?,?,?,?,?)
                 ON DUPLICATE KEY UPDATE public_key = VALUES(public_key), last_seen_at = VALUES(last_seen_at)',
                array($id, $deviceId, $publicKey, sc_user_agent(), time(), time())
            );
            return $id;
        });
    } catch (PDOException $e) {
        if (db_is_duplicate($e)) {
            sc_fail(1101);
        }
        throw $e;
    }

    sc_record_consents($userId, $versions);
    $token = sc_issue_token($userId, $deviceId);
    $user = sc_user_by_id($userId);
    sc_json(array(
        'token'         => $token,
        'user'          => $user,
        'needs_reconsent' => false,
    ));
}

/** POST /api/auth/login */
function api_auth_login()
{
    $in = sc_input();
    $username = trim(sc_str(sc_in('username'), 40));
    $password = is_string(sc_in('password')) ? sc_in('password') : '';
    $deviceId = trim(sc_str(sc_in('device_id'), 64));
    $publicKey = trim(sc_str(sc_in('public_key'), 300));

    if ($username === '' || $password === '') {
        sc_fail(1001);
    }
    if (!sc_valid_device_id($deviceId)) {
        sc_fail(1001, '设备标识无效');
    }

    $bidx = blind_index($username);
    $ip = sc_client_ip();
    $window = (int) sc_cfg('limits.login_fail_window', 300);
    $max = (int) sc_cfg('limits.login_fail_max', 5);
    $fails = (int) db_val(
        'SELECT COUNT(*) FROM login_attempts WHERE username_bidx = ? AND ip = ? AND created_at > ?',
        array($bidx, $ip, time() - $window)
    );
    if ($fails >= $max) {
        sc_fail(1103);
    }

    $row = db_one('SELECT * FROM users WHERE username_bidx = ? AND deleted_at IS NULL LIMIT 1', array($bidx));
    if (!$row || !password_verify($password, (string) $row['password_hash'])) {
        db_exec('INSERT INTO login_attempts (username_bidx, ip, created_at) VALUES (?,?,?)', array($bidx, $ip, time()));
        sc_fail(1102);
    }

    // 登录成功：只清该账号+该 IP 的失败记录
    db_exec('DELETE FROM login_attempts WHERE username_bidx = ? AND ip = ?', array($bidx, $ip));

    $userId = (int) $row['id'];
    if ($publicKey !== '' && sc_valid_public_key($publicKey)) {
        db_exec('UPDATE users SET public_key = ? WHERE id = ?', array($publicKey, $userId));
        db_exec(
            'INSERT INTO user_devices (user_id, device_id, public_key, user_agent, created_at, last_seen_at) VALUES (?,?,?,?,?,?)
             ON DUPLICATE KEY UPDATE public_key = VALUES(public_key), last_seen_at = VALUES(last_seen_at), user_agent = VALUES(user_agent)',
            array($userId, $deviceId, $publicKey, sc_user_agent(), time(), time())
        );
    } else {
        db_exec(
            'UPDATE user_devices SET last_seen_at = ? WHERE user_id = ? AND device_id = ?',
            array(time(), $userId, $deviceId)
        );
    }

    $token = sc_issue_token($userId, $deviceId);

    // 登录触发的惰性清理
    sc_lazy_cleanup_by_user($userId, 15);

    sc_json(array(
        'token'           => $token,
        'user'            => sc_user_by_id($userId),
        'needs_reconsent' => sc_needs_reconsent($userId),
        'consents'        => sc_consents_of($userId),
    ));
}

/** POST /api/auth/logout */
function api_auth_logout()
{
    $u = sc_require_auth();
    $token = sc_bearer_token();
    if ($token !== '') {
        db_exec('DELETE FROM user_tokens WHERE token_hash = ?', array(token_hash($token)));
    }
    sc_json(array('ok' => true));
}

/** GET /api/auth/me */
function api_auth_me()
{
    $u = sc_require_auth();
    $unread = (int) db_val(
        'SELECT COALESCE(SUM(uc.unread),0) FROM user_conversations uc
         JOIN conversations c ON c.id = uc.conv_id
         WHERE uc.user_id = ? AND uc.is_deleted = 0',
        array($u['id'])
    );
    $pending = (int) db_val(
        'SELECT COUNT(*) FROM friend_requests WHERE to_id = ? AND status = 0',
        array($u['id'])
    );
    sc_json(array(
        'user'            => $u,
        'consents'        => sc_consents_of((int) $u['id']),
        'needs_reconsent' => sc_needs_reconsent((int) $u['id']),
        'unread'          => $unread,
        'pending_requests' => $pending,
        'server_time'     => time(),
    ));
}

/** GET /api/auth/security_question */
function api_auth_security_question()
{
    $username = trim(sc_str($_GET['username'] ?? '', 40));
    if ($username === '') {
        sc_fail(1001);
    }
    sc_rate('secq:' . sc_client_ip(), 10, 600, 1004);
    $row = db_one('SELECT sec_question_enc FROM users WHERE username_bidx = ? AND deleted_at IS NULL LIMIT 1', array(blind_index($username)));
    // 账号不存在时也给相同形状的响应，避免账号枚举。
    $question = $row ? (string) field_decrypt($row['sec_question_enc']) : '';
    if ($question === '') {
        $question = '请输入你设置的安全问题答案';
    }
    sc_json(array('question' => $question));
}

/** POST /api/auth/reset_password */
function api_auth_reset_password()
{
    $username = trim(sc_str(sc_in('username'), 40));
    $answer = trim(sc_str(sc_in('answer'), 100));
    $newPassword = is_string(sc_in('new_password')) ? sc_in('new_password') : '';
    if ($username === '' || $answer === '' || mb_strlen($newPassword, 'UTF-8') < 6) {
        sc_fail(1001, '请填写完整信息，新密码至少 6 位');
    }
    sc_rate('reset:' . sc_client_ip(), 10, 3600, 1004);
    $row = db_one('SELECT * FROM users WHERE username_bidx = ? AND deleted_at IS NULL LIMIT 1', array(blind_index($username)));
    $ok = false;
    if ($row && $row['sec_answer_hash'] !== '') {
        $ok = password_verify(mb_strtolower($answer, 'UTF-8'), (string) $row['sec_answer_hash']);
    }
    if (!$ok) {
        // 统一文案，不区分账号是否存在
        sc_fail(1107, '信息验证失败，请检查后重试');
    }
    $hash = password_hash($newPassword, PASSWORD_BCRYPT, array('cost' => 12));
    db_exec('UPDATE users SET password_hash = ? WHERE id = ?', array($hash, (int) $row['id']));
    db_exec('DELETE FROM user_tokens WHERE user_id = ?', array((int) $row['id']));
    sc_json(array('ok' => true));
}

/** GET /api/auth/devices */
function api_auth_devices()
{
    $u = sc_require_auth();
    $rows = db_all(
        'SELECT device_id, user_agent, created_at, last_seen_at FROM user_devices WHERE user_id = ? ORDER BY last_seen_at DESC',
        array((int) $u['id'])
    );
    $out = array();
    foreach ($rows as $r) {
        $out[] = array(
            'device_id'    => $r['device_id'],
            'user_agent'   => $r['user_agent'],
            'created_at'   => (int) $r['created_at'],
            'last_seen_at' => (int) $r['last_seen_at'],
            'current'      => $r['device_id'] === $u['device_id'],
        );
    }
    sc_json(array('devices' => $out));
}

/** POST /api/auth/kick */
function api_auth_kick()
{
    $u = sc_require_auth();
    $deviceId = trim(sc_str(sc_in('device_id'), 64));
    if ($deviceId === '' || $deviceId === $u['device_id']) {
        sc_fail(1001);
    }
    db_exec('DELETE FROM user_tokens WHERE user_id = ? AND device_id = ?', array((int) $u['id'], $deviceId));
    db_exec('DELETE FROM user_devices WHERE user_id = ? AND device_id = ?', array((int) $u['id'], $deviceId));
    sc_json(array('ok' => true));
}

/** POST /api/auth/reconsent */
function api_auth_reconsent()
{
    $u = sc_require_auth();
    $versions = sc_in('consent_versions', array());
    if (!is_array($versions)) {
        sc_fail(1701);
    }
    sc_record_consents((int) $u['id'], $versions);
    sc_json(array('needs_reconsent' => sc_needs_reconsent((int) $u['id']), 'consents' => sc_consents_of((int) $u['id'])));
}

/** POST /api/user/profile */
function api_user_profile()
{
    $u = sc_require_auth();
    $nickname = sc_in('nickname', null);
    $signature = sc_in('signature', null);
    $gender = sc_in('gender', null);

    $sets = array();
    $params = array();
    if ($nickname !== null) {
        $nickname = trim(sc_str($nickname, 32));
        if (mb_strlen($nickname, 'UTF-8') < 1 || mb_strlen($nickname, 'UTF-8') > 16) {
            sc_fail(1001, '昵称需为 1–16 个字符');
        }
        $sets[] = 'nickname_enc = ?';
        $params[] = field_encrypt($nickname);
    }
    if ($signature !== null) {
        $signature = trim(sc_str($signature, 200));
        if (mb_strlen($signature, 'UTF-8') > 60) {
            sc_fail(1001, '签名最多 60 个字符');
        }
        $sets[] = 'signature_enc = ?';
        $params[] = $signature === '' ? null : field_encrypt($signature);
    }
    if ($gender !== null) {
        $g = sc_int($gender, 0);
        if (!in_array($g, array(0, 1, 2), true)) {
            sc_fail(1001);
        }
        $sets[] = 'gender = ?';
        $params[] = $g;
    }
    if (!$sets) {
        sc_fail(1001, '没有需要更新的内容');
    }
    $params[] = (int) $u['id'];
    db_exec('UPDATE users SET ' . implode(', ', $sets) . ' WHERE id = ?', $params);
    sc_json(array('user' => sc_user_by_id((int) $u['id'])));
}

/** GET /api/user/info?public_id= */
function api_user_info()
{
    $u = sc_require_auth();
    $pid = trim(sc_str($_GET['public_id'] ?? '', 24));
    $target = sc_user_by_public_id($pid);
    if (!$target) {
        sc_fail(1201);
    }
    $isFriend = sc_is_friend((int) $u['id'], (int) $target['id']);
    $hasPending = (bool) db_val(
        'SELECT 1 FROM friend_requests WHERE from_id = ? AND to_id = ? AND status = 0 LIMIT 1',
        array((int) $u['id'], (int) $target['id'])
    );
    $blocked = sc_is_blocked((int) $u['id'], (int) $target['id']);
    $remark = null;
    if ($isFriend) {
        $r = db_val('SELECT remark_enc FROM friends WHERE user_id = ? AND friend_id = ?', array((int) $u['id'], (int) $target['id']));
        $remark = $r ? field_decrypt($r) : null;
    }
    $isSelf = (int) $u['id'] === (int) $target['id'];
    unset($target['id']);
    sc_json(array(
        'user'        => $target,
        'is_friend'   => $isFriend,
        'has_pending' => $hasPending,
        'blocked'     => $blocked,
        'remark'      => $remark,
        'is_self'     => $isSelf,
    ));
}

/** POST /api/user/password */
function api_user_password()
{
    $u = sc_require_auth();
    $old = is_string(sc_in('old_password')) ? sc_in('old_password') : '';
    $new = is_string(sc_in('new_password')) ? sc_in('new_password') : '';
    if ($old === '' || mb_strlen($new, 'UTF-8') < 6) {
        sc_fail(1001, '新密码至少 6 位');
    }
    $row = db_one('SELECT password_hash FROM users WHERE id = ? LIMIT 1', array((int) $u['id']));
    if (!$row || !password_verify($old, (string) $row['password_hash'])) {
        sc_fail(1102);
    }
    db_exec('UPDATE users SET password_hash = ? WHERE id = ?', array(
        password_hash($new, PASSWORD_BCRYPT, array('cost' => 12)), (int) $u['id']
    ));
    // 强制所有设备重新登录
    db_exec('DELETE FROM user_tokens WHERE user_id = ?', array((int) $u['id']));
    sc_json(array('ok' => true));
}

/** POST /api/user/avatar （multipart，字段名 avatar） */
function api_user_avatar()
{
    $u = sc_require_auth();
    if (!isset($_FILES['avatar']) || !is_array($_FILES['avatar'])) {
        sc_fail(1001, '请选择图片');
    }
    $f = $_FILES['avatar'];
    if ((int) $f['error'] !== UPLOAD_ERR_OK) {
        sc_fail(1503);
    }
    $max = (int) sc_cfg('media.max_image', 5242880);
    if ((int) $f['size'] > $max) {
        sc_fail(1501);
    }
    $info = @getimagesize($f['tmp_name']);
    if (!$info || !in_array($info[2], array(IMAGETYPE_JPEG, IMAGETYPE_PNG, IMAGETYPE_GIF, IMAGETYPE_WEBP), true)) {
        sc_fail(1502);
    }
    $src = @imagecreatefromstring(file_get_contents($f['tmp_name']));
    if (!$src) {
        sc_fail(1502);
    }
    $size = 200;
    $dst = imagecreatetruecolor($size, $size);
    // 白底，避免透明 PNG 变黑
    $white = imagecolorallocate($dst, 255, 255, 255);
    imagefilledrectangle($dst, 0, 0, $size, $size, $white);
    $w = imagesx($src);
    $h = imagesy($src);
    $scale = min($size / $w, $size / $h);
    $nw = (int) round($w * $scale);
    $nh = (int) round($h * $scale);
    imagecopyresampled($dst, $src, (int) (($size - $nw) / 2), (int) (($size - $nh) / 2), 0, 0, $nw, $nh, $w, $h);
    ob_start();
    imagejpeg($dst, null, 88);
    $jpeg = ob_get_clean();
    imagedestroy($src);
    imagedestroy($dst);

    sc_ensure_dir(SC_ROOT . '/media/avatar');
    $path = 'media/avatar/' . (int) $u['id'] . '.enc';
    $enc = field_encrypt($jpeg);
    if (@file_put_contents(SC_ROOT . '/' . $path, $enc) === false) {
        sc_fail(1503);
    }
    db_exec('UPDATE users SET avatar = ? WHERE id = ?', array($path, (int) $u['id']));
    sc_json(array('user' => sc_user_by_id((int) $u['id'])));
}

/** GET /api/avatar/:uid —— 受控输出（解密后返回）。$key 支持内部 id 或 public_id。 */
function api_avatar_output(string $key)
{
    sc_require_auth();
    if (preg_match('/^\d+$/', $key)) {
        $userId = (int) $key;
    } else {
        $userId = (int) db_val('SELECT id FROM users WHERE public_id = ? LIMIT 1', array($key));
    }
    $avatar = $userId > 0 ? db_val('SELECT avatar FROM users WHERE id = ? AND deleted_at IS NULL LIMIT 1', array($userId)) : '';
    $abs = $avatar ? SC_ROOT . '/' . $avatar : '';
    if (!$abs || !is_file($abs)) {
        http_response_code(404);
        header('Content-Type: image/svg+xml; charset=utf-8');
        echo '<svg xmlns="http://www.w3.org/2000/svg" width="80" height="80" viewBox="0 0 80 80">'
            . '<rect width="80" height="80" fill="#e6e6e6"/>'
            . '<circle cx="40" cy="32" r="14" fill="#b8b8b8"/>'
            . '<path d="M12 76c0-16 12-24 28-24s28 8 28 24z" fill="#b8b8b8"/></svg>';
        exit;
    }
    $data = field_decrypt(file_get_contents($abs));
    if ($data === null) {
        http_response_code(404);
        exit;
    }
    header('Content-Type: image/jpeg');
    header('Cache-Control: private, max-age=3600');
    header('Content-Length: ' . strlen($data));
    echo $data;
    exit;
}

/** POST /api/account/delete */
function api_account_delete()
{
    $u = sc_require_auth();
    $password = is_string(sc_in('password')) ? sc_in('password') : '';
    $row = db_one('SELECT password_hash FROM users WHERE id = ? LIMIT 1', array((int) $u['id']));
    if (!$row || !password_verify($password, (string) $row['password_hash'])) {
        sc_fail(1102);
    }
    $uid = (int) $u['id'];
    $randomHash = password_hash(bin2hex(random_bytes(16)), PASSWORD_BCRYPT, array('cost' => 12));

    db_tx(function () use ($uid, $randomHash) {
        db_exec(
            'UPDATE users SET username_enc = "", nickname_enc = NULL, signature_enc = NULL,
                sec_question_enc = NULL, sec_answer_hash = "", public_key = NULL,
                password_hash = ?, avatar = "", deleted_at = ? WHERE id = ?',
            array($randomHash, time(), $uid)
        );
        db_exec('DELETE FROM user_tokens WHERE user_id = ?', array($uid));
        db_exec('DELETE FROM user_devices WHERE user_id = ?', array($uid));
        db_exec('DELETE FROM friends WHERE user_id = ? OR friend_id = ?', array($uid, $uid));
        db_exec('DELETE FROM friend_requests WHERE from_id = ? OR to_id = ?', array($uid, $uid));
        db_exec('UPDATE messages SET sender_id = 0 WHERE sender_id = ?', array($uid));
        db_exec('UPDATE moment_posts SET text_content_enc = NULL, status = 0 WHERE author_id = ?', array($uid));
        db_exec('DELETE FROM group_members WHERE user_id = ?', array($uid));
    });

    // 清理该用户的媒体文件
    $files = db_all('SELECT id, file_path FROM media_files WHERE uploader_id = ? AND deleted = 0', array($uid));
    foreach ($files as $f) {
        $abs = SC_ROOT . '/' . $f['file_path'];
        if (is_file($abs) && strpos(realpath($abs) ?: '', SC_ROOT . '/media/') === 0) {
            @unlink($abs);
        }
        db_exec('UPDATE media_files SET deleted = 1, expired_at = 0 WHERE id = ?', array((int) $f['id']));
    }
    $avatar = SC_ROOT . '/media/avatar/' . $uid . '.enc';
    if (is_file($avatar)) {
        @unlink($avatar);
    }

    db_insert('INSERT INTO account_deletion_requests (user_id, status, requested_at, processed_at) VALUES (?,1,?,?)',
        array($uid, time(), time()));
    sc_json(array('ok' => true));
}

/** POST /api/user/security_question —— 设置或更新找回密码的安全问题 */
function api_user_security_question()
{
    $u = sc_require_auth();
    $question = trim(sc_str(sc_in('question'), 100));
    $answer = trim(sc_str(sc_in('answer'), 100));
    if ($question === '' || $answer === '') {
        sc_fail(1001, '请填写安全问题与答案');
    }
    if (mb_strlen($question, 'UTF-8') > 50 || mb_strlen($answer, 'UTF-8') > 50) {
        sc_fail(1001, '问题与答案各不超过 50 个字符');
    }
    db_exec(
        'UPDATE users SET sec_question_enc = ?, sec_answer_hash = ? WHERE id = ?',
        array(
            field_encrypt($question),
            password_hash(mb_strtolower($answer, 'UTF-8'), PASSWORD_BCRYPT, array('cost' => 12)),
            (int) $u['id']
        )
    );
    sc_json(array('ok' => true));
}
