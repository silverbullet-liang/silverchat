<?php
declare(strict_types=1);

require_once __DIR__ . '/message_api.php';

/**
 * GET /api/poll.php?cursor=<最后消息ID>&since_time=<上次服务器时间>
 * 返回增量消息、未读摘要、好友申请与动态通知。
 */
function api_poll()
{
    $u = sc_require_auth();
    sc_rate('poll:' . (int) $u['id'], (int) sc_cfg('limits.poll_per_minute', 30), 60, 1004);

    $cursor = max(0, sc_int($_GET['cursor'] ?? 0, 0));
    $sinceTime = max(0, sc_int($_GET['since_time'] ?? 0, 0));
    $me = (int) $u['id'];

    $rows = db_all(
        'SELECT m.id, m.conv_id, m.sender_id, m.type, m.content, m.extra, m.status, m.created_at
         FROM messages m
         JOIN user_conversations uc ON uc.conv_id = m.conv_id AND uc.user_id = ? AND uc.is_deleted = 0
         WHERE m.id > ? AND m.sender_id <> ?
         ORDER BY m.id ASC LIMIT 50',
        array($me, $cursor, $me)
    );
    $senderIds = array();
    foreach ($rows as $r) {
        $senderIds[] = (int) $r['sender_id'];
    }
    $map = sc_user_public_id_map($senderIds);

    $messages = array();
    $maxId = $cursor;
    foreach ($rows as $r) {
        $sid = (int) $r['sender_id'];
        if ((int) $r['id'] > $maxId) {
            $maxId = (int) $r['id'];
        }
        $messages[] = array(
            'id'        => (int) $r['id'],
            'conv_id'   => (int) $r['conv_id'],
            'type'      => (int) $r['type'],
            'content'   => (string) $r['content'],
            'extra'     => $r['extra'] !== null ? json_decode((string) $r['extra'], true) : null,
            'status'    => (int) $r['status'],
            'created_at' => (int) $r['created_at'],
            'sender_id' => $sid,
            'sender_public_id' => isset($map[$sid]) ? $map[$sid]['public_id'] : '',
            'sender_name' => isset($map[$sid]) ? $map[$sid]['nickname'] : '',
            'sender_avatar' => isset($map[$sid]) ? (string) $map[$sid]['avatar'] : '',
        );
    }

    $convRows = db_all(
        'SELECT uc.conv_id, uc.unread, uc.last_seen_id, uc.is_muted, c.last_msg_id, c.last_msg_at
         FROM user_conversations uc JOIN conversations c ON c.id = uc.conv_id
         WHERE uc.user_id = ? AND uc.is_deleted = 0 AND uc.unread > 0 ORDER BY c.last_msg_at DESC LIMIT 50',
        array($me)
    );
    $conversations = array();
    foreach ($convRows as $c) {
        $conversations[] = array(
            'conv_id'      => (int) $c['conv_id'],
            'unread'       => (int) $c['unread'],
            'last_msg_id'  => (int) $c['last_msg_id'],
            'last_seen_id' => (int) $c['last_seen_id'],
            'muted'        => (int) $c['is_muted'] === 1,
            'last_msg_at'  => (int) $c['last_msg_at'],
        );
    }

    $reqRows = db_all(
        'SELECT r.id, r.message_enc, r.created_at, u.public_id, u.nickname_enc, u.avatar
         FROM friend_requests r JOIN users u ON u.id = r.from_id
         WHERE r.to_id = ? AND r.status = 0 AND r.created_at > ? ORDER BY r.created_at DESC LIMIT 20',
        array($me, $sinceTime)
    );
    $friendRequests = array();
    foreach ($reqRows as $r) {
        $friendRequests[] = array(
            'id'         => (int) $r['id'],
            'public_id'  => (string) $r['public_id'],
            'nickname'   => (string) field_decrypt($r['nickname_enc']),
            'avatar'     => (string) $r['avatar'],
            'message'    => (string) field_decrypt($r['message_enc']),
            'created_at' => (int) $r['created_at'],
        );
    }

    // 单聊已读回执：对方读到哪一条
    $readRows = db_all(
        'SELECT uc.conv_id, MAX(peer.last_seen_id) AS peer_seen
         FROM user_conversations uc
         JOIN user_conversations peer ON peer.conv_id = uc.conv_id AND peer.user_id <> uc.user_id
         JOIN conversations c ON c.id = uc.conv_id AND c.type = 1
         WHERE uc.user_id = ? GROUP BY uc.conv_id LIMIT 50',
        array($me)
    );
    $readMap = array();
    foreach ($readRows as $r) {
        $readMap[(string) (int) $r['conv_id']] = (int) $r['peer_seen'];
    }

    // 动态通知：自己的动态在 since_time 之后收到的赞与评论
    $notices = array();
    if ($sinceTime > 0) {
        $likes = db_all(
            'SELECT ml.post_id, ml.created_at, u.public_id, u.nickname_enc
             FROM moment_likes ml
             JOIN moment_posts p ON p.id = ml.post_id AND p.author_id = ?
             JOIN users u ON u.id = ml.user_id
             WHERE ml.created_at > ? ORDER BY ml.created_at DESC LIMIT 20',
            array($me, $sinceTime)
        );
        foreach ($likes as $l) {
            $notices[] = array(
                'type'      => 'like',
                'post_id'   => (int) $l['post_id'],
                'public_id' => (string) $l['public_id'],
                'nickname'  => (string) field_decrypt($l['nickname_enc']),
                'created_at' => (int) $l['created_at'],
            );
        }
        $comments = db_all(
            'SELECT mc.post_id, mc.created_at, u.public_id, u.nickname_enc
             FROM moment_comments mc
             JOIN moment_posts p ON p.id = mc.post_id AND p.author_id = ?
             JOIN users u ON u.id = mc.user_id
             WHERE mc.created_at > ? ORDER BY mc.created_at DESC LIMIT 20',
            array($me, $sinceTime)
        );
        foreach ($comments as $c) {
            $notices[] = array(
                'type'      => 'comment',
                'post_id'   => (int) $c['post_id'],
                'public_id' => (string) $c['public_id'],
                'nickname'  => (string) field_decrypt($c['nickname_enc']),
                'created_at' => (int) $c['created_at'],
            );
        }
    }

    // 超过 60 秒未接听的通话标记为未接
    db_exec('UPDATE calls SET status = 3, ended_at = ? WHERE status = 0 AND created_at < ?', array(time(), time() - 60));

    // 未接来电：呼叫后 60 秒内有效，复用本次轮询下发给被叫方
    $incoming = db_one(
        'SELECT * FROM calls WHERE callee_id = ? AND status = 0 AND created_at > ? ORDER BY id DESC LIMIT 1',
        array($me, time() - 60)
    );
    $incomingCall = null;
    if ($incoming) {
        $caller = sc_user_by_id((int) $incoming['caller_id']);
        $incomingCall = array(
            'id'         => (int) $incoming['id'],
            'conv_id'    => (int) $incoming['conv_id'],
            'media_type' => (int) $incoming['media_type'],
            'created_at' => (int) $incoming['created_at'],
            'caller'     => $caller ? array(
                'public_id' => $caller['public_id'],
                'nickname'  => $caller['nickname'],
                'avatar'    => $caller['avatar'],
            ) : null,
        );
    }

    db_exec('UPDATE user_devices SET last_seen_at = ? WHERE user_id = ? AND device_id = ?',
        array(time(), $me, $u['device_id']));
    sc_poll_tick_cleanup($me);

    sc_json(array(
        'messages'        => $messages,
        'conversations'   => $conversations,
        'friend_requests' => $friendRequests,
        'moment_notices'  => $notices,
        'read_map'        => (object) $readMap,
        'incoming_call'   => $incomingCall,
        'cursor'          => $maxId,
        'server_time'     => time(),
    ));
}
