<?php
declare(strict_types=1);

require_once __DIR__ . '/media_cleanup.php';

/** 会话成员 ID 列表。 */
function sc_conv_members(int $convId): array
{
    $rows = db_all('SELECT user_id FROM user_conversations WHERE conv_id = ? AND is_deleted = 0', array($convId));
    $ids = array();
    foreach ($rows as $r) {
        $ids[] = (int) $r['user_id'];
    }
    return $ids;
}

function sc_user_public_id_map(array $ids): array
{
    $ids = array_values(array_unique(array_filter(array_map('intval', $ids))));
    if (!$ids) {
        return array();
    }
    $in = implode(',', array_fill(0, count($ids), '?'));
    $rows = db_all("SELECT id, public_id, nickname_enc, avatar FROM users WHERE id IN ($in)", $ids);
    $map = array();
    foreach ($rows as $r) {
        $map[(int) $r['id']] = array(
            'public_id' => (string) $r['public_id'],
            'nickname'  => (string) field_decrypt($r['nickname_enc']),
            'avatar'    => (string) $r['avatar'],
        );
    }
    return $map;
}

/** 写入一条系统消息（明文，type=99）。 */
function sc_system_message(int $convId, int $senderId, string $text): int
{
    if ($convId <= 0) {
        return 0;
    }
    $msgId = db_insert(
        'INSERT INTO messages (conv_id, sender_id, type, content, extra, status, created_at) VALUES (?,?,99,?,NULL,1,?)',
        array($convId, $senderId, $text, time())
    );
    db_exec('UPDATE conversations SET last_msg_id = ?, last_msg_at = ? WHERE id = ?', array($msgId, time(), $convId));
    return $msgId;
}

/** 单聊会话的对方用户（会话键解析）。 */
function sc_single_peer(int $convId, int $myId)
{
    $conv = db_one('SELECT * FROM conversations WHERE id = ? LIMIT 1', array($convId));
    if (!$conv || (int) $conv['type'] !== 1) {
        return null;
    }
    if (!preg_match('/^u(\d+)_u(\d+)$/', (string) $conv['conv_key'], $m)) {
        return null;
    }
    $a = (int) $m[1];
    $b = (int) $m[2];
    $peerId = $a === $myId ? $b : $a;
    $peer = sc_user_by_id($peerId);
    if (!$peer) {
        return null;
    }
    $remark = db_val('SELECT remark_enc FROM friends WHERE user_id = ? AND friend_id = ?', array($myId, $peerId));
    $peer['remark'] = $remark ? field_decrypt($remark) : null;
    return $peer;
}

function sc_conv_payload(array $uc, int $myId): array
{
    $convId = (int) $uc['conv_id'];
    $conv = array(
        'conv_id' => $convId,
        'type'    => (int) $uc['type'],
        'unread'  => (int) $uc['unread'],
        'pinned'  => (int) $uc['is_pinned'] === 1,
        'muted'   => (int) $uc['is_muted'] === 1,
        'updated_at' => (int) $uc['updated_at'],
        'last'    => null,
        'title'   => '',
        'avatar'  => '',
        'public_id' => '',
        'member_count' => 0,
        'member_avatars' => array(),
        'peer_is_staff' => false,
    );

    if ((int) $uc['type'] === 2) {
        // 群会话：conv_key = g{groupId}
        $group = db_one('SELECT * FROM conversations WHERE id = ? LIMIT 1', array($convId));
        $groupId = 0;
        if ($group && preg_match('/^g(\d+)$/', (string) $group['conv_key'], $m)) {
            $groupId = (int) $m[1];
        }
        $g = $groupId > 0 ? db_one('SELECT * FROM `groups` WHERE id = ?', array($groupId)) : null;
        if ($g) {
            $conv['title'] = (string) field_decrypt($g['name_enc']);
            $conv['avatar'] = (string) $g['avatar'];
            $conv['public_id'] = (string) $g['public_id'];
            $conv['member_count'] = (int) db_val('SELECT COUNT(*) FROM group_members WHERE group_id = ?', array($groupId));
            $conv['group_id'] = $groupId;
            $conv['join_mode'] = (int) $g['join_mode'];
            $conv['my_role'] = (int) db_val(
                'SELECT role FROM group_members WHERE group_id = ? AND user_id = ?',
                array($groupId, $myId)
            );
            // 九宫格群头像：按角色与加入时间取前 9 位成员
            $memberRows = db_all(
                'SELECT u.public_id, u.avatar FROM group_members gm
                 JOIN users u ON u.id = gm.user_id
                 WHERE gm.group_id = ? AND u.deleted_at IS NULL
                 ORDER BY gm.role DESC, gm.joined_at ASC LIMIT 9',
                array($groupId)
            );
            $conv['member_avatars'] = array();
            foreach ($memberRows as $mr) {
                $conv['member_avatars'][] = array(
                    'public_id' => (string) $mr['public_id'],
                    'avatar'    => (string) $mr['avatar'],
                );
            }
        }
    } else {
        $peer = sc_single_peer($convId, $myId);
        if ($peer) {
            $conv['title'] = $peer['remark'] !== null && $peer['remark'] !== '' ? (string) $peer['remark'] : (string) $peer['nickname'];
            $conv['avatar'] = (string) $peer['avatar'];
            $conv['public_id'] = (string) $peer['public_id'];
            $conv['peer_is_staff'] = !empty($peer['is_staff']);
        }
    }

    if ((int) $uc['last_msg_id'] > 0) {
        $msg = db_one(
            'SELECT id, sender_id, type, content, extra, status, created_at FROM messages WHERE id = ? LIMIT 1',
            array((int) $uc['last_msg_id'])
        );
        if ($msg) {
            $sender = $msg['sender_id'] > 0 ? sc_user_public_id_map(array((int) $msg['sender_id'])) : array();
            $senderRow = (int) $msg['sender_id'] > 0 && isset($sender[(int) $msg['sender_id']]) ? $sender[(int) $msg['sender_id']] : null;
            $conv['last'] = array(
                'id'             => (int) $msg['id'],
                'type'           => (int) $msg['type'],
                'content'        => (string) $msg['content'],
                'extra'          => $msg['extra'] !== null ? json_decode((string) $msg['extra'], true) : null,
                'status'         => (int) $msg['status'],
                'created_at'     => (int) $msg['created_at'],
                'sender_id'      => (int) $msg['sender_id'],
                'sender_public_id' => $senderRow ? $senderRow['public_id'] : '',
                'sender_name'    => $senderRow ? $senderRow['nickname'] : '',
            );
        }
    }
    return $conv;
}

/** GET /api/conversations */
function api_conversations()
{
    $u = sc_require_auth();
    $rows = db_all(
        'SELECT uc.conv_id, uc.unread, uc.is_pinned, uc.is_muted, uc.last_seen_id, uc.updated_at,
                c.type, c.last_msg_id, c.last_msg_at
         FROM user_conversations uc
         JOIN conversations c ON c.id = uc.conv_id
         WHERE uc.user_id = ? AND uc.is_deleted = 0
         ORDER BY uc.is_pinned DESC, c.last_msg_at DESC, uc.updated_at DESC LIMIT 50',
        array((int) $u['id'])
    );
    $out = array();
    foreach ($rows as $r) {
        $out[] = sc_conv_payload($r, (int) $u['id']);
    }
    sc_json(array('conversations' => $out, 'server_time' => time()));
}

/** POST /api/conversation/read */
function api_conversation_read()
{
    $u = sc_require_auth();
    $convId = sc_int(sc_in('conv_id'), 0);
    $lastMsgId = sc_int(sc_in('last_msg_id'), 0);
    if ($convId <= 0) {
        sc_fail(1001);
    }
    $uc = db_one('SELECT * FROM user_conversations WHERE user_id = ? AND conv_id = ? LIMIT 1', array((int) $u['id'], $convId));
    if (!$uc) {
        sc_fail(1301);
    }
    db_exec(
        'UPDATE user_conversations SET unread = 0, last_seen_id = GREATEST(last_seen_id, ?) WHERE user_id = ? AND conv_id = ?',
        array($lastMsgId, (int) $u['id'], $convId)
    );
    sc_json(array('ok' => true));
}

/** POST /api/conversation/pin */
function api_conversation_pin()
{
    $u = sc_require_auth();
    $convId = sc_int(sc_in('conv_id'), 0);
    $on = sc_int(sc_in('pinned'), 0) === 1 ? 1 : 0;
    db_exec(
        'UPDATE user_conversations SET is_pinned = ? WHERE user_id = ? AND conv_id = ?',
        array($on, (int) $u['id'], $convId)
    );
    sc_json(array('ok' => true, 'pinned' => $on === 1));
}

/** POST /api/conversation/mute */
function api_conversation_mute()
{
    $u = sc_require_auth();
    $convId = sc_int(sc_in('conv_id'), 0);
    $on = sc_int(sc_in('muted'), 0) === 1 ? 1 : 0;
    db_exec(
        'UPDATE user_conversations SET is_muted = ? WHERE user_id = ? AND conv_id = ?',
        array($on, (int) $u['id'], $convId)
    );
    sc_json(array('ok' => true, 'muted' => $on === 1));
}

/** POST /api/conversation/delete */
function api_conversation_delete()
{
    $u = sc_require_auth();
    $convId = sc_int(sc_in('conv_id'), 0);
    db_exec(
        'UPDATE user_conversations SET is_deleted = 1, unread = 0 WHERE user_id = ? AND conv_id = ?',
        array((int) $u['id'], $convId)
    );
    sc_json(array('ok' => true));
}

/** POST /api/message/send */
function api_message_send()
{
    $u = sc_require_auth();
    sc_rate('msg:' . (int) $u['id'], (int) sc_cfg('limits.message_per_second', 5), 1, 1302);

    $convId = sc_int(sc_in('conv_id'), 0);
    $type = sc_int(sc_in('type'), 1);
    $content = sc_in('content');
    $extra = sc_in('extra', null);
    $clientMsgId = sc_str(sc_in('client_msg_id'), 64);

    if ($convId <= 0 || !is_string($content) || $content === '') {
        sc_fail(1001);
    }
    if (!in_array($type, array(1, 2, 3, 4, 5, 6, 7), true)) {
        sc_fail(1001);
    }
    if (strlen($content) > 65535) {
        sc_fail(1001, '消息内容过长');
    }
    if ($clientMsgId === '' || !preg_match('/^[A-Za-z0-9_\-]{6,64}$/', $clientMsgId)) {
        sc_fail(1001, '客户端消息标识无效');
    }
    $conv = sc_conv_for_user($convId, (int) $u['id']);
    if (!$conv) {
        sc_fail(1301);
    }
    if ((int) $conv['type'] === 1) {
        $peer = sc_single_peer($convId, (int) $u['id']);
        if (!$peer) {
            sc_fail(1301);
        }
        if (sc_is_blocked((int) $u['id'], (int) $peer['id'])) {
            sc_fail(1204, '你已拉黑对方，无法发送消息');
        }
        if (sc_is_blocked((int) $peer['id'], (int) $u['id'])) {
            sc_fail(1204, '对方已拒收你的消息');
        }
    }
    $extraJson = null;
    if ($extra !== null) {
        $extraJson = is_string($extra) ? $extra : json_encode($extra, JSON_UNESCAPED_UNICODE);
        if (strlen($extraJson) > 8192) {
            sc_fail(1001, '附加信息过长');
        }
    }

    // 幂等：同一 client_msg_id 直接返回已有消息
    $existing = db_one(
        'SELECT id, created_at FROM messages WHERE sender_id = ? AND client_msg_id = ? AND conv_id = ? LIMIT 1',
        array((int) $u['id'], $clientMsgId, $convId)
    );
    if ($existing) {
        sc_json(array('msg_id' => (int) $existing['id'], 'created_at' => (int) $existing['created_at'], 'duplicate' => true));
    }

    $msgId = db_tx(function () use ($convId, $u, $type, $content, $extraJson, $clientMsgId) {
        $id = db_insert(
            'INSERT INTO messages (conv_id, sender_id, type, content, extra, client_msg_id, status, created_at)
             VALUES (?,?,?,?,?,?,1,?)',
            array($convId, (int) $u['id'], $type, $content, $extraJson, $clientMsgId, time())
        );
        // 绑定媒体归属，便于过期清理时把消息置为「已过期」
        if ($extraJson !== null) {
            $ex = json_decode($extraJson, true);
            if (is_array($ex) && isset($ex['media_id'])) {
                $mid = (int) $ex['media_id'];
                if ($mid > 0) {
                    db_exec('UPDATE media_files SET msg_id = ? WHERE id = ? AND uploader_id = ?',
                        array($id, $mid, (int) $u['id']));
                }
            }
        }
        db_exec('UPDATE conversations SET last_msg_id = ?, last_msg_at = ? WHERE id = ?', array($id, time(), $convId));
        $now = time();
        db_exec('UPDATE user_conversations SET updated_at = ?, is_deleted = 0 WHERE user_id = ? AND conv_id = ?',
            array($now, (int) $u['id'], $convId));
        db_exec('UPDATE user_conversations SET unread = unread + 1, updated_at = ?, is_deleted = 0 WHERE conv_id = ? AND user_id <> ?',
            array($now, $convId, (int) $u['id']));
        return $id;
    });

    sc_json(array('msg_id' => $msgId, 'created_at' => time()));
}

/** POST /api/message/revoke */
function api_message_revoke()
{
    $u = sc_require_auth();
    $msgId = sc_int(sc_in('msg_id'), 0);
    $msg = db_one('SELECT * FROM messages WHERE id = ? LIMIT 1', array($msgId));
    if (!$msg) {
        sc_fail(1304);
    }
    if ((int) $msg['sender_id'] !== (int) $u['id']) {
        sc_fail(1304);
    }
    if ((int) $msg['status'] !== 1) {
        sc_fail(1304);
    }
    if (time() - (int) $msg['created_at'] > 120) {
        sc_fail(1303);
    }
    if (!sc_conv_for_user((int) $msg['conv_id'], (int) $u['id'])) {
        sc_fail(1301);
    }
    db_exec('UPDATE messages SET status = 2, content = "", extra = NULL WHERE id = ?', array($msgId));
    sc_system_message((int) $msg['conv_id'], 0, $u['nickname'] . '撤回了一条消息');
    sc_json(array('ok' => true));
}

/** GET /api/message/history?conv_id=&before_id=&limit= */
function api_message_history()
{
    $u = sc_require_auth();
    $convId = sc_int($_GET['conv_id'] ?? 0, 0);
    $before = sc_int($_GET['before_id'] ?? 0, 0);
    $limit = max(1, min(30, sc_int($_GET['limit'] ?? 20, 20)));
    if ($convId <= 0 || !sc_conv_for_user($convId, (int) $u['id'])) {
        sc_fail(1301);
    }
    // 历史消息触发该会话的过期媒体清理
    sc_lazy_cleanup_by_conv($convId, 15);

    if ($before > 0) {
        $rows = db_all(
            'SELECT id, sender_id, type, content, extra, status, created_at FROM messages
             WHERE conv_id = ? AND id < ? ORDER BY id DESC LIMIT ' . $limit,
            array($convId, $before)
        );
    } else {
        $rows = db_all(
            'SELECT id, sender_id, type, content, extra, status, created_at FROM messages
             WHERE conv_id = ? ORDER BY id DESC LIMIT ' . $limit,
            array($convId)
        );
    }
    $senderIds = array();
    foreach ($rows as $r) {
        $senderIds[] = (int) $r['sender_id'];
    }
    $map = sc_user_public_id_map($senderIds);
    $out = array();
    foreach ($rows as $r) {
        $sid = (int) $r['sender_id'];
        $out[] = array(
            'id'        => (int) $r['id'],
            'type'      => (int) $r['type'],
            'content'   => (string) $r['content'],
            'extra'     => $r['extra'] !== null ? json_decode((string) $r['extra'], true) : null,
            'status'    => (int) $r['status'],
            'created_at' => (int) $r['created_at'],
            'sender_id' => $sid,
            'sender_public_id' => isset($map[$sid]) ? $map[$sid]['public_id'] : '',
            'sender_name' => isset($map[$sid]) ? $map[$sid]['nickname'] : '',
        );
    }
    sc_json(array(
        'messages'  => $out,
        'has_more'  => count($rows) === $limit,
        'my_public_id' => $u['public_id'],
    ));
}
