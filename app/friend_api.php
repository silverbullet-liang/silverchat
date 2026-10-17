<?php
declare(strict_types=1);

require_once __DIR__ . '/helpers.php';

function sc_friend_view(array $row, ?string $remark = null): array
{
    return array(
        'public_id' => (string) $row['public_id'],
        'nickname'  => (string) $row['nickname'],
        'avatar'    => (string) $row['avatar'],
        'signature' => (string) $row['signature'],
        'remark'    => $remark,
        'gender'    => (int) $row['gender'],
    );
}

/** GET /api/friend/search?q= */
function api_friend_search()
{
    $u = sc_require_auth();
    $q = trim(sc_str($_GET['q'] ?? '', 24));
    if ($q === '') {
        sc_fail(1001);
    }
    if (strpos($q, 'gp_') === 0) {
        sc_fail(1001, '请输入用户账号（sc_ 开头）');
    }
    $target = sc_user_by_public_id($q);
    if (!$target) {
        sc_fail(1201);
    }
    $isFriend = sc_is_friend((int) $u['id'], (int) $target['id']);
    $hasPending = (bool) db_val(
        'SELECT 1 FROM friend_requests WHERE from_id = ? AND to_id = ? AND status = 0',
        array((int) $u['id'], (int) $target['id'])
    );
    $incoming = (bool) db_val(
        'SELECT 1 FROM friend_requests WHERE from_id = ? AND to_id = ? AND status = 0',
        array((int) $target['id'], (int) $u['id'])
    );
    unset($target['id']);
    sc_json(array(
        'user'         => $target,
        'is_friend'    => $isFriend,
        'has_pending'  => $hasPending,
        'has_incoming' => $incoming,
        'is_self'      => false,
    ));
}

/** POST /api/friend/request */
function api_friend_request()
{
    $u = sc_require_auth();
    sc_rate('freq:' . (int) $u['id'], (int) sc_cfg('limits.friend_req_per_day', 20), 86400, 1004);

    $pid = trim(sc_str(sc_in('to_public_id'), 24));
    $message = trim(sc_str(sc_in('message'), 100));
    $target = sc_user_by_public_id($pid);
    if (!$target) {
        sc_fail(1201);
    }
    if ((int) $target['id'] === (int) $u['id']) {
        sc_fail(1001, '不能添加自己');
    }
    if (sc_is_friend((int) $u['id'], (int) $target['id'])) {
        sc_fail(1202);
    }
    if (sc_is_blocked((int) $target['id'], (int) $u['id'])) {
        sc_fail(1204);
    }
    if (mb_strlen($message, 'UTF-8') > 50) {
        sc_fail(1001, '附言最多 50 个字符');
    }
    if ($message === '') {
        $message = '我是' . $u['nickname'];
    }
    try {
        db_insert(
            'INSERT INTO friend_requests (from_id, to_id, message_enc, status, created_at) VALUES (?,?,?,0,?)',
            array((int) $u['id'], (int) $target['id'], field_encrypt($message), time())
        );
    } catch (PDOException $e) {
        if (db_is_duplicate($e)) {
            sc_fail(1203);
        }
        throw $e;
    }
    sc_json(array('ok' => true));
}

/** GET /api/friend/requests */
function api_friend_requests()
{
    $u = sc_require_auth();
    $incoming = db_all(
        'SELECT r.id, r.from_id, r.message_enc, r.status, r.created_at,
                u.public_id, u.nickname_enc, u.avatar, u.signature_enc, u.gender
         FROM friend_requests r JOIN users u ON u.id = r.from_id
         WHERE r.to_id = ? AND r.status IN (0,1,2) ORDER BY r.created_at DESC LIMIT 100',
        array((int) $u['id'])
    );
    $outgoing = db_all(
        'SELECT r.id, r.to_id, r.message_enc, r.status, r.created_at,
                u.public_id, u.nickname_enc, u.avatar, u.signature_enc, u.gender
         FROM friend_requests r JOIN users u ON u.id = r.to_id
         WHERE r.from_id = ? AND r.status IN (0,1,2) ORDER BY r.created_at DESC LIMIT 100',
        array((int) $u['id'])
    );
    $map = function (array $rows): array {
        $out = array();
        foreach ($rows as $r) {
            $out[] = array(
                'id'         => (int) $r['id'],
                'public_id'  => (string) $r['public_id'],
                'nickname'   => (string) field_decrypt($r['nickname_enc']),
                'avatar'     => (string) $r['avatar'],
                'signature'  => (string) field_decrypt($r['signature_enc']),
                'gender'     => (int) $r['gender'],
                'message'    => (string) field_decrypt($r['message_enc']),
                'status'     => (int) $r['status'],
                'created_at' => (int) $r['created_at'],
            );
        }
        return $out;
    };
    sc_json(array('incoming' => $map($incoming), 'outgoing' => $map($outgoing)));
}

/** POST /api/friend/handle {id, action=accept|reject} */
function api_friend_handle()
{
    $u = sc_require_auth();
    $id = sc_int(sc_in('id'), 0);
    $action = sc_str(sc_in('action'), 10);
    if ($id <= 0 || !in_array($action, array('accept', 'reject'), true)) {
        sc_fail(1001);
    }
    $req = db_one('SELECT * FROM friend_requests WHERE id = ? AND to_id = ? LIMIT 1', array($id, (int) $u['id']));
    if (!$req || (int) $req['status'] !== 0) {
        sc_fail(1001, '申请已被处理');
    }
    $fromId = (int) $req['from_id'];
    $myId = (int) $u['id'];

    if ($action === 'reject') {
        db_exec('UPDATE friend_requests SET status = 2, handled_at = ? WHERE id = ?', array(time(), $id));
        sc_json(array('ok' => true));
    }

    db_tx(function () use ($req, $fromId, $myId, $id) {
        $st = db()->prepare('UPDATE friend_requests SET status = 1, handled_at = ? WHERE id = ? AND to_id = ? AND status = 0');
        $st->execute(array(time(), $id, $myId));
        if ($st->rowCount() === 0) {
            throw new RuntimeException('申请已被处理');
        }
        $ins = db()->prepare(
            'INSERT INTO friends (user_id, friend_id, created_at) VALUES (?,?,?)
             ON DUPLICATE KEY UPDATE status = 1'
        );
        $ins->execute(array($fromId, $myId, time()));
        $ins->execute(array($myId, $fromId, time()));

        $min = min($fromId, $myId);
        $max = max($fromId, $myId);
        $convKey = 'u' . $min . '_u' . $max;
        $convId = db_insert(
            'INSERT INTO conversations (type, conv_key, last_msg_at) VALUES (1,?,0)
             ON DUPLICATE KEY UPDATE id = LAST_INSERT_ID(id)',
            array($convKey)
        );
        foreach (array($min, $max) as $member) {
            db_exec(
                'INSERT IGNORE INTO user_conversations (user_id, conv_id, updated_at) VALUES (?,?,?)',
                array($member, $convId, time())
            );
        }
    });

    $nick = $u['nickname'] !== '' ? $u['nickname'] : '对方';
    sc_system_message((int) db_val('SELECT id FROM conversations WHERE conv_key = ?', array('u' . min($fromId, $myId) . '_u' . max($fromId, $myId))), 0, $nick . '通过了你的朋友验证，现在可以开始聊天了');

    sc_json(array('ok' => true));
}

/** GET /api/friend/list */
function api_friend_list()
{
    $u = sc_require_auth();
    $rows = db_all(
        'SELECT f.remark_enc, f.is_starred, f.status, u.public_id, u.nickname_enc, u.avatar, u.signature_enc, u.gender, u.public_key
         FROM friends f JOIN users u ON u.id = f.friend_id
         WHERE f.user_id = ? AND f.status IN (1,2) AND u.deleted_at IS NULL
         ORDER BY f.is_starred DESC, u.nickname_enc ASC',
        array((int) $u['id'])
    );
    $out = array();
    foreach ($rows as $r) {
        $out[] = array(
            'public_id' => (string) $r['public_id'],
            'nickname'  => (string) field_decrypt($r['nickname_enc']),
            'avatar'    => (string) $r['avatar'],
            'signature' => (string) field_decrypt($r['signature_enc']),
            'gender'    => (int) $r['gender'],
            'public_key' => (string) $r['public_key'],
            'remark'    => $r['remark_enc'] ? (string) field_decrypt($r['remark_enc']) : null,
            'starred'   => (int) $r['is_starred'] === 1,
            'blocked'   => (int) $r['status'] === 2,
        );
    }
    sc_json(array('friends' => $out));
}

function sc_require_friend_row(int $me, string $pid): array
{
    $target = sc_user_by_public_id($pid);
    if (!$target) {
        sc_fail(1201);
    }
    $row = db_one('SELECT * FROM friends WHERE user_id = ? AND friend_id = ? LIMIT 1', array($me, (int) $target['id']));
    if (!$row) {
        sc_fail(1005, '对方不在你的通讯录中');
    }
    return array($row, $target);
}

/** POST /api/friend/remark */
function api_friend_remark()
{
    $u = sc_require_auth();
    $pid = trim(sc_str(sc_in('public_id'), 24));
    $remark = trim(sc_str(sc_in('remark'), 32));
    list($row, $target) = sc_require_friend_row((int) $u['id'], $pid);
    if (mb_strlen($remark, 'UTF-8') > 16) {
        sc_fail(1001, '备注最多 16 个字符');
    }
    db_exec(
        'UPDATE friends SET remark_enc = ? WHERE user_id = ? AND friend_id = ?',
        array($remark === '' ? null : field_encrypt($remark), (int) $u['id'], (int) $target['id'])
    );
    sc_json(array('ok' => true));
}

/** POST /api/friend/star */
function api_friend_star()
{
    $u = sc_require_auth();
    $pid = trim(sc_str(sc_in('public_id'), 24));
    $on = sc_int(sc_in('starred'), 0) === 1 ? 1 : 0;
    list($row, $target) = sc_require_friend_row((int) $u['id'], $pid);
    db_exec('UPDATE friends SET is_starred = ? WHERE user_id = ? AND friend_id = ?', array($on, (int) $u['id'], (int) $target['id']));
    sc_json(array('ok' => true, 'starred' => $on === 1));
}

/** POST /api/friend/block */
function api_friend_block()
{
    $u = sc_require_auth();
    $pid = trim(sc_str(sc_in('public_id'), 24));
    $block = sc_int(sc_in('blocked'), 1) === 1;
    list($row, $target) = sc_require_friend_row((int) $u['id'], $pid);
    db_exec('UPDATE friends SET status = ? WHERE user_id = ? AND friend_id = ?', array($block ? 2 : 1, (int) $u['id'], (int) $target['id']));
    sc_json(array('ok' => true, 'blocked' => $block));
}

/** POST /api/friend/delete */
function api_friend_delete()
{
    $u = sc_require_auth();
    $pid = trim(sc_str(sc_in('public_id'), 24));
    list($row, $target) = sc_require_friend_row((int) $u['id'], $pid);
    db_exec('DELETE FROM friends WHERE user_id = ? AND friend_id = ?', array((int) $u['id'], (int) $target['id']));
    db_exec('DELETE FROM friends WHERE user_id = ? AND friend_id = ?', array((int) $target['id'], (int) $u['id']));
    db_exec(
        'UPDATE user_conversations SET is_deleted = 1 WHERE user_id = ? AND conv_id IN
            (SELECT id FROM conversations WHERE conv_key = ?)',
        array((int) $u['id'], 'u' . min((int) $u['id'], (int) $target['id']) . '_u' . max((int) $u['id'], (int) $target['id']))
    );
    sc_json(array('ok' => true));
}

/** GET /api/friend/blocklist */
function api_friend_blocklist()
{
    $u = sc_require_auth();
    $rows = db_all(
        'SELECT u.public_id, u.nickname_enc, u.avatar FROM friends f
         JOIN users u ON u.id = f.friend_id
         WHERE f.user_id = ? AND f.status = 2 ORDER BY f.created_at DESC',
        array((int) $u['id'])
    );
    $out = array();
    foreach ($rows as $r) {
        $out[] = array(
            'public_id' => (string) $r['public_id'],
            'nickname'  => (string) field_decrypt($r['nickname_enc']),
            'avatar'    => (string) $r['avatar'],
        );
    }
    sc_json(array('users' => $out));
}
