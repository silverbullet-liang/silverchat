<?php
declare(strict_types=1);

require_once __DIR__ . '/db.php';

function sc_kefu_username(): string
{
    $name = (string) sc_cfg('kefu.username', 'kefu');
    return $name !== '' ? $name : 'kefu';
}

/**
 * 客服固定账号的初始密码。来源优先级：安装时传入 → config/config.php → 随机生成。
 * 仓库中不包含任何明文密码。
 */
function sc_kefu_initial_password(): string
{
    $fromConfig = (string) sc_cfg('kefu.password', '');
    if ($fromConfig !== '') {
        return $fromConfig;
    }
    return bin2hex(random_bytes(8));
}

function sc_kefu_user()
{
    $row = db_one('SELECT * FROM users WHERE username_bidx = ? AND deleted_at IS NULL LIMIT 1', array(blind_index(sc_kefu_username())));
    return $row ?: null;
}

/** 创建客服账号，返回 [created(bool), userId(int)] */
function sc_ensure_kefu(string $password = ''): array
{
    $existing = sc_kefu_user();
    if ($existing) {
        if ((int) $existing['is_staff'] !== 1) {
            db_exec('UPDATE users SET is_staff = 1 WHERE id = ?', array((int) $existing['id']));
        }
        return array(false, (int) $existing['id']);
    }
    if ($password === '') {
        $password = sc_kefu_initial_password();
    }
    $hash = password_hash($password, PASSWORD_BCRYPT, array('cost' => 12));
    $id = db_insert(
        'INSERT INTO users (public_id, username_enc, username_bidx, password_hash, nickname_enc, avatar,
            gender, signature_enc, sec_question_enc, sec_answer_hash, public_key, created_at, is_staff)
         VALUES (?,?,?,?,?,"",0,NULL,NULL,"",NULL,?,1)',
        array(
            'tmp_' . bin2hex(random_bytes(6)),
            field_encrypt(sc_kefu_username()),
            blind_index(sc_kefu_username()),
            $hash,
            field_encrypt('客服'),
            time(),
        )
    );
    db_exec('UPDATE users SET public_id = ? WHERE id = ?', array(public_id_new($id), $id));

    // 客服账号预先记录协议同意，避免登录后被重新同意弹窗拦住
    require_once __DIR__ . '/legal.php';
    $versions = sc_legal_versions();
    foreach (array('privacy', 'terms', 'cross-border') as $type) {
        if (!isset($versions[$type])) {
            continue;
        }
        db_exec(
            'INSERT IGNORE INTO user_consents (user_id, doc_type, doc_version, agreed_at, ip, user_agent) VALUES (?,?,?,?,?,?)',
            array($id, $type, $versions[$type], time(), '0.0.0.0', 'installer')
        );
    }
    return array(true, $id);
}

/** 客服是否在线：最近 90 秒内有设备活动。 */
function sc_kefu_online(): array
{
    $kefu = sc_kefu_user();
    if (!$kefu) {
        return array('exists' => false, 'online' => false, 'has_key' => false, 'last_seen' => 0);
    }
    $lastSeen = (int) db_val(
        'SELECT COALESCE(MAX(last_seen_at), 0) FROM user_devices WHERE user_id = ?',
        array((int) $kefu['id'])
    );
    return array(
        'exists'      => true,
        'public_id'   => (string) $kefu['public_id'],
        'online'      => $lastSeen > 0 && (time() - $lastSeen) <= 90,
        'has_key'     => trim((string) $kefu['public_key']) !== '',
        'last_seen'   => $lastSeen,
        'nickname'    => (string) field_decrypt($kefu['nickname_enc']),
    );
}
