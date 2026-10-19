<?php
declare(strict_types=1);

/**
 * API 单入口。所有 /api/* 请求经 .htaccess 重写到这里。
 * 统一响应 {code, msg, data}，code=0 成功。
 */

// 致命错误（含解析错误）也返回 JSON，避免主机直接抛空白 500
register_shutdown_function(function () {
    $err = error_get_last();
    if (!$err || !in_array($err['type'], array(E_ERROR, E_PARSE, E_CORE_ERROR, E_COMPILE_ERROR), true)) {
        return;
    }
    if (headers_sent()) {
        return;
    }
    error_log('[silverchat] ' . $err['message'] . ' @ ' . $err['file'] . ':' . $err['line']);
    http_response_code(500);
    header('Content-Type: application/json; charset=utf-8');
    echo json_encode(array('code' => 1001, 'msg' => '服务异常，请访问 /diag.php 检查环境', 'data' => null), JSON_UNESCAPED_UNICODE);
});

require_once __DIR__ . '/app/bootstrap.php';
require_once __DIR__ . '/app/helpers.php';
require_once __DIR__ . '/app/auth_api.php';
require_once __DIR__ . '/app/friend_api.php';
require_once __DIR__ . '/app/group_api.php';
require_once __DIR__ . '/app/moment_api.php';
require_once __DIR__ . '/app/media_api.php';
require_once __DIR__ . '/app/emoji_api.php';
require_once __DIR__ . '/app/poll_api.php';
require_once __DIR__ . '/app/search_api.php';
require_once __DIR__ . '/app/kefu_api.php';
require_once __DIR__ . '/app/call_api.php';

sc_boot();
sc_security_headers(false);
sc_check_origin();

$method = strtoupper($_SERVER['REQUEST_METHOD'] ?? 'GET');
$path = parse_url($_SERVER['REQUEST_URI'] ?? '/', PHP_URL_PATH);
$path = '/' . trim((string) $path, '/');
if (strpos($path, '/api/') === 0) {
    $path = substr($path, 5);
} elseif ($path === '/api') {
    $path = '';
}
$path = rtrim($path, '/');

// 动态路由：媒体与原图
if (preg_match('#^media/(\d+)$#', $path, $m)) {
    if ($method !== 'GET') {
        sc_fail(1003);
    }
    api_media_output((int) $m[1]);
}
if (preg_match('#^avatar/([A-Za-z0-9_]+)$#', $path, $m)) {
    if ($method !== 'GET') {
        sc_fail(1003);
    }
    api_avatar_output((string) $m[1]);
}

// 客服账号只能处理消息，其余接口一律拒绝
$staffUser = sc_auth_user();
if ($staffUser && !empty($staffUser['is_staff'])) {
    $staffAllowed = array(
        'auth/me', 'auth/logout', 'auth/reconsent',
        'conversations',
        'conversation/read', 'conversation/pin', 'conversation/mute', 'conversation/delete',
        'message/send', 'message/revoke', 'message/history',
        'upload', 'poll.php', 'poll',
        'user/info', 'emoji/packages', 'legal/versions', 'kefu/status',
    );
    if (!in_array($path, $staffAllowed, true)) {
        sc_fail(1003, '客服账号仅可处理消息');
    }
}

$routes = array(
    'POST auth/register'          => 'api_auth_register',    'POST auth/login'             => 'api_auth_login',
    'POST auth/logout'            => 'api_auth_logout',
    'GET auth/me'                 => 'api_auth_me',
    'GET auth/security_question'  => 'api_auth_security_question',
    'POST auth/reset_password'    => 'api_auth_reset_password',
    'GET auth/devices'            => 'api_auth_devices',
    'POST auth/kick'              => 'api_auth_kick',
    'POST auth/reconsent'         => 'api_auth_reconsent',

    'POST account/delete'         => 'api_account_delete',

    'POST user/profile'           => 'api_user_profile',
    'POST user/public_key'        => 'api_user_public_key',
    'POST user/avatar'            => 'api_user_avatar',
    'POST user/password'          => 'api_user_password',
    'POST user/security_question' => 'api_user_security_question',
    'GET user/info'               => 'api_user_info',

    'GET friend/search'           => 'api_friend_search',
    'POST friend/request'         => 'api_friend_request',
    'GET friend/requests'         => 'api_friend_requests',
    'POST friend/handle'          => 'api_friend_handle',
    'GET friend/list'             => 'api_friend_list',
    'POST friend/remark'          => 'api_friend_remark',
    'POST friend/star'            => 'api_friend_star',
    'POST friend/block'           => 'api_friend_block',
    'POST friend/delete'          => 'api_friend_delete',
    'GET friend/blocklist'        => 'api_friend_blocklist',

    'GET conversations'           => 'api_conversations',
    'POST conversation/read'      => 'api_conversation_read',
    'POST conversation/pin'       => 'api_conversation_pin',
    'POST conversation/mute'      => 'api_conversation_mute',
    'POST conversation/delete'    => 'api_conversation_delete',

    'POST message/send'           => 'api_message_send',
    'POST message/revoke'         => 'api_message_revoke',
    'GET message/history'         => 'api_message_history',

    'POST group/create'           => 'api_group_create',
    'GET group/search'            => 'api_group_search',
    'POST group/join'             => 'api_group_join',
    'GET group/list'              => 'api_group_list',
    'POST group/invite'           => 'api_group_invite',
    'POST group/kick'             => 'api_group_kick',
    'POST group/quit'             => 'api_group_quit',
    'POST group/update'           => 'api_group_update',
    'GET group/members'           => 'api_group_members',
    'GET group/key'               => 'api_group_key_get',
    'POST group/key'              => 'api_group_key_put',

    'GET emoji/packages'          => 'api_emoji_packages',

    'POST upload'                 => 'api_upload',

    'GET poll.php'                => 'api_poll',
    'GET poll'                    => 'api_poll',

    'POST moment/post'            => 'api_moment_post',
    'GET moment/feed'             => 'api_moment_feed',
    'GET moment/detail'           => 'api_moment_detail',
    'POST moment/like'            => 'api_moment_like',
    'POST moment/comment'         => 'api_moment_comment',
    'POST moment/delete'          => 'api_moment_delete',

    'GET search'                  => 'api_search',

    'GET legal/versions'          => 'api_legal_versions',

    'GET kefu/status'             => 'api_kefu_status',
    'POST kefu/start'             => 'api_kefu_start',

    'POST call/start'             => 'api_call_start',
    'POST call/signal'            => 'api_call_signal',
    'GET call/poll'               => 'api_call_poll',
    'POST call/answer'            => 'api_call_answer',
    'POST call/end'               => 'api_call_end',
    'GET call/history'            => 'api_call_history',
);

$key = $method . ' ' . $path;
if (!isset($routes[$key])) {
    // 路径存在但方法不符时返回 405 语义
    foreach ($routes as $routeKey => $fn) {
        $parts = explode(' ', $routeKey, 2);
        if (isset($parts[1]) && $parts[1] === $path) {
            sc_fail(1003, '请求方法不被允许', 405);
        }
    }
    sc_fail(1005);
}

$handler = $routes[$key];
try {
    $handler();
} catch (Throwable $e) {
    sc_log('api_error', array(
        'path' => $path,
        'msg'  => $e->getMessage(),
        'file' => $e->getFile() . ':' . $e->getLine(),
    ));
    if ((bool) sc_cfg('site.debug', false)) {
        sc_fail(1001, '服务异常：' . $e->getMessage(), 500);
    }
    sc_fail(1001, sc_error_hint($e), 500);
}
