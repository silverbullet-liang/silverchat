<?php
declare(strict_types=1);

require_once __DIR__ . '/message_api.php';

/**
 * 语音/视频通话：媒体走 WebRTC P2P（DTLS-SRTP 强制加密），
 * 服务器只转发 SDP/ICE 信令并保存通话记录，不接触音视频内容。
 */

function sc_call_ice_servers(): array
{
    $list = (array) sc_cfg('call.stun', array());
    if (!$list) {
        // 国内公共 STUN（2026-10 实测），可在 config 中覆盖
        $list = array(
            'stun:stun.miwifi.com:3478',
            'stun:stun.chat.bilibili.com:3478',
            'stun:stun.hitv.com:3478',
            'stun:stun.douyucdn.cn:18000',
            'stun:stun.l.google.com:19302',
        );
    }
    $out = array();
    foreach ($list as $url) {
        $url = trim((string) $url);
        if ($url !== '' && stripos($url, 'stun:') === 0) {
            $out[] = array('urls' => $url);
        }
    }
    return $out;
}

function sc_call_row(int $callId, int $userId): array
{
    $row = db_one(
        'SELECT * FROM calls WHERE id = ? AND (caller_id = ? OR callee_id = ?) LIMIT 1',
        array($callId, $userId, $userId)
    );
    if (!$row) {
        sc_fail(1005, '通话不存在');
    }
    return $row;
}

function sc_call_payload(array $call, int $userId): array
{
    $peerId = (int) $call['caller_id'] === $userId ? (int) $call['callee_id'] : (int) $call['caller_id'];
    $peer = sc_user_by_id($peerId);
    return array(
        'id'         => (int) $call['id'],
        'conv_id'    => (int) $call['conv_id'],
        'media_type' => (int) $call['media_type'],
        'status'     => (int) $call['status'],
        'is_caller'  => (int) $call['caller_id'] === $userId,
        'peer'       => $peer ? array(
            'public_id' => $peer['public_id'],
            'nickname'  => $peer['nickname'],
            'avatar'    => $peer['avatar'],
        ) : null,
        'started_at' => (int) $call['started_at'],
        'ended_at'   => (int) $call['ended_at'],
        'created_at' => (int) $call['created_at'],
    );
}

/** POST /api/call/start {conv_id, media_type} */
function api_call_start()
{
    $u = sc_require_auth();
    if (!empty($u['is_staff'])) {
        sc_fail(1003, '客服账号不支持通话');
    }
    $convId = sc_int(sc_in('conv_id'), 0);
    $mediaType = sc_int(sc_in('media_type'), 1);
    if (!in_array($mediaType, array(1, 2), true)) {
        sc_fail(1001);
    }
    $conv = sc_conv_for_user($convId, (int) $u['id']);
    if (!$conv || (int) $conv['type'] !== 1) {
        sc_fail(1301, '仅支持两人会话通话');
    }
    $peer = sc_single_peer($convId, (int) $u['id']);
    if (!$peer) {
        sc_fail(1301);
    }
    if (!empty($peer['is_staff'])) {
        sc_fail(1003, '客服会话不支持通话');
    }
    if (sc_is_blocked((int) $peer['id'], (int) $u['id'])) {
        sc_fail(1204, '对方已拒收你的通话');
    }
    $busy = db_val(
        'SELECT id FROM calls WHERE (caller_id = ? OR callee_id = ?) AND status IN (0,1) AND created_at > ? LIMIT 1',
        array((int) $u['id'], (int) $u['id'], time() - 300)
    );
    if ($busy) {
        sc_fail(1001, '当前有正在进行的通话');
    }
    // 机会性清理一小时前的残留信令（异常结束的通话不会走到 end）
    if (random_int(1, 5) === 1) {
        db_exec('DELETE FROM call_signals WHERE created_at < ?', array(time() - 3600));
    }
    $callId = db_insert(
        'INSERT INTO calls (conv_id, caller_id, callee_id, media_type, status, created_at) VALUES (?,?,?,?,0,?)',
        array($convId, (int) $u['id'], (int) $peer['id'], $mediaType, time())
    );
    $row = db_one('SELECT * FROM calls WHERE id = ?', array($callId));
    sc_json(array('call' => sc_call_payload($row, (int) $u['id']), 'ice_servers' => sc_call_ice_servers()));
}

/** POST /api/call/signal {call_id, kind, payload} */
function api_call_signal()
{
    $u = sc_require_auth();
    $callId = sc_int(sc_in('call_id'), 0);
    $kind = sc_str(sc_in('kind'), 16);
    $payload = sc_in('payload');
    if (!in_array($kind, array('offer', 'answer', 'ice'), true)) {
        sc_fail(1001);
    }
    if (!is_string($payload) || $payload === '' || strlen($payload) > 65535) {
        sc_fail(1001, '信令内容无效');
    }
    $call = sc_call_row($callId, (int) $u['id']);
    if ((int) $call['status'] >= 2) {
        sc_fail(1001, '通话已结束');
    }
    $toId = (int) $call['caller_id'] === (int) $u['id'] ? (int) $call['callee_id'] : (int) $call['caller_id'];
    db_insert(
        'INSERT INTO call_signals (call_id, from_id, to_id, kind, payload, created_at) VALUES (?,?,?,?,?,?)',
        array($callId, (int) $u['id'], $toId, $kind, $payload, time())
    );
    sc_json(array('ok' => true));
}

/** GET /api/call/poll?call_id=&after_id= */
function api_call_poll()
{
    $u = sc_require_auth();
    $callId = sc_int($_GET['call_id'] ?? 0, 0);
    $afterId = max(0, sc_int($_GET['after_id'] ?? 0, 0));
    $call = sc_call_row($callId, (int) $u['id']);
    $rows = db_all(
        'SELECT id, from_id, kind, payload, created_at FROM call_signals
         WHERE call_id = ? AND to_id = ? AND id > ? ORDER BY id ASC LIMIT 100',
        array($callId, (int) $u['id'], $afterId)
    );
    $signals = array();
    foreach ($rows as $r) {
        $signals[] = array(
            'id'      => (int) $r['id'],
            'kind'    => (string) $r['kind'],
            'payload' => (string) $r['payload'],
        );
    }
    sc_json(array('call' => sc_call_payload($call, (int) $u['id']), 'signals' => $signals));
}

/** POST /api/call/answer {call_id, accept} */
function api_call_answer()
{
    $u = sc_require_auth();
    $callId = sc_int(sc_in('call_id'), 0);
    $accept = sc_int(sc_in('accept'), 0) === 1;
    $call = sc_call_row($callId, (int) $u['id']);
    if ((int) $call['callee_id'] !== (int) $u['id']) {
        sc_fail(1003);
    }
    if ((int) $call['status'] !== 0) {
        sc_fail(1001, '通话已结束');
    }
    if ($accept) {
        db_exec('UPDATE calls SET status = 1, started_at = ? WHERE id = ?', array(time(), $callId));
    } else {
        db_exec('UPDATE calls SET status = 4, ended_at = ? WHERE id = ?', array(time(), $callId));
        db_exec('DELETE FROM call_signals WHERE call_id = ?', array($callId));
    }
    $call = db_one('SELECT * FROM calls WHERE id = ?', array($callId));
    sc_json(array(
        'ok' => true,
        'call' => sc_call_payload($call, (int) $u['id']),
        'ice_servers' => sc_call_ice_servers(),
    ));
}

/** POST /api/call/end {call_id} */
function api_call_end()
{
    $u = sc_require_auth();
    $callId = sc_int(sc_in('call_id'), 0);
    $call = sc_call_row($callId, (int) $u['id']);
    if ((int) $call['status'] >= 2) {
        sc_json(array('ok' => true, 'status' => (int) $call['status']));
    }
    $status = (int) $call['status'] === 0 ? 3 : 2; // 0=未接通 → 未接听
    db_exec('UPDATE calls SET status = ?, ended_at = ? WHERE id = ?', array($status, time(), $callId));
    db_exec('DELETE FROM call_signals WHERE call_id = ?', array($callId));
    sc_json(array('ok' => true, 'status' => $status));
}

/** GET /api/call/history?conv_id=&limit= */
function api_call_history()
{
    $u = sc_require_auth();
    $convId = sc_int($_GET['conv_id'] ?? 0, 0);
    $limit = max(1, min(50, sc_int($_GET['limit'] ?? 20, 20)));
    if ($convId <= 0 || !sc_conv_for_user($convId, (int) $u['id'])) {
        sc_fail(1301);
    }
    $rows = db_all(
        'SELECT * FROM calls WHERE conv_id = ? ORDER BY id DESC LIMIT ' . $limit,
        array($convId)
    );
    $out = array();
    foreach ($rows as $c) {
        $item = sc_call_payload($c, (int) $u['id']);
        $item['duration'] = (int) $c['started_at'] > 0 && (int) $c['ended_at'] > 0
            ? max(0, (int) $c['ended_at'] - (int) $c['started_at'])
            : 0;
        $out[] = $item;
    }
    sc_json(array('calls' => $out));
}
