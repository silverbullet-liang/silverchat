<?php
declare(strict_types=1);

require_once __DIR__ . '/helpers.php';
require_once __DIR__ . '/kefu_seed.php';
require_once __DIR__ . '/message_api.php';

/** GET /api/kefu/status —— 客服在线状态（供用户端实时展示） */
function api_kefu_status()
{
    sc_require_auth();
    $status = sc_kefu_online();
    sc_json($status);
}

/**
 * POST /api/kefu/start —— 用户打开客服会话。
 * 单聊会话以 u{小id}_u{大id} 为键，已存在则直接复用。
 */
function api_kefu_start()
{
    $u = sc_require_auth();
    if (!empty($u['is_staff'])) {
        sc_fail(1003, '客服账号无需创建客服会话');
    }
    $kefu = sc_kefu_user();
    if (!$kefu) {
        sc_fail(1005, '客服尚未开通');
    }
    $kefuId = (int) $kefu['id'];
    $myId = (int) $u['id'];
    $min = min($myId, $kefuId);
    $max = max($myId, $kefuId);
    $convKey = 'u' . $min . '_u' . $max;

    $convId = (int) db_val('SELECT id FROM conversations WHERE conv_key = ? LIMIT 1', array($convKey));
    $isNew = false;
    if ($convId <= 0) {
        $convId = db_insert(
            'INSERT INTO conversations (type, conv_key, last_msg_at) VALUES (1,?,?)
             ON DUPLICATE KEY UPDATE id = LAST_INSERT_ID(id)',
            array($convKey, time())
        );
        $isNew = true;
    }
    foreach (array($myId, $kefuId) as $member) {
        db_exec(
            'INSERT INTO user_conversations (user_id, conv_id, updated_at) VALUES (?,?,?)
             ON DUPLICATE KEY UPDATE is_deleted = 0, updated_at = VALUES(updated_at)',
            array($member, $convId, time())
        );
    }
    if ($isNew) {
        sc_system_message($convId, 0, '您好，这里是客服。请描述您遇到的问题，可以发送文字或图片。');
    }

    $status = sc_kefu_online();
    sc_json(array(
        'conv_id'   => $convId,
        'kefu'      => array(
            'public_id' => $status['exists'] ? $status['public_id'] : '',
            'nickname'  => $status['exists'] ? $status['nickname'] : '客服',
            'online'    => (bool) $status['online'],
            'has_key'   => (bool) $status['has_key'],
        ),
    ));
}
