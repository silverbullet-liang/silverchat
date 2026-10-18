<?php
declare(strict_types=1);

require_once __DIR__ . '/db.php';
require_once __DIR__ . '/crypto.php';

/** 业务错误码 */
function sc_app_error_map(): array
{
    return array(
        1001 => array('参数错误', 400),
        1002 => array('登录已过期，请重新登录', 401),
        1003 => array('无权限操作', 403),
        1004 => array('请求过于频繁，请稍后再试', 429),
        1005 => array('资源不存在', 404),
        1101 => array('用户名已被占用', 400),
        1102 => array('用户名或密码错误', 400),
        1103 => array('尝试过于频繁，请 5 分钟后再试', 429),
        1104 => array('用户名格式不正确', 400),
        1105 => array('用户名不能以符号开头或结尾', 400),
        1106 => array('用户名长度需为 2–20 个字符', 400),
        1107 => array('答案不正确', 400),
        1201 => array('对方不存在', 404),
        1202 => array('对方已是你的好友', 400),
        1203 => array('申请已发送，请等待对方处理', 400),
        1204 => array('该用户已被拉黑', 403),
        1301 => array('会话不存在或无权访问', 404),
        1302 => array('消息发送过于频繁', 429),
        1303 => array('超过撤回时限', 400),
        1304 => array('无法撤回该消息', 400),
        1401 => array('群聊不存在', 404),
        1402 => array('群成员已达上限', 400),
        1403 => array('仅群主可执行该操作', 403),
        1404 => array('该群仅限邀请加入', 403),
        1405 => array('你已在该群中', 400),
        1501 => array('文件过大', 400),
        1502 => array('不支持的文件类型', 400),
        1503 => array('上传失败，请重试', 400),
        1504 => array('文件已过期', 410),
        1601 => array('动态不存在或无权查看', 404),
        1602 => array('内容超出长度限制', 400),
        1701 => array('请先同意最新协议', 403),
    );
}

function sc_json($data = null, int $httpStatus = 200)
{
    if (!headers_sent()) {
        header('Content-Type: application/json; charset=utf-8');
        header('Cache-Control: no-store');
    }
    http_response_code($httpStatus);
    echo json_encode(array('code' => 0, 'msg' => '', 'data' => $data), JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}

function sc_fail(int $code, string $msg = '', int $httpStatus = 0)
{
    $map = sc_app_error_map();
    if ($msg === '' && isset($map[$code])) {
        $msg = $map[$code][0];
    }
    if ($httpStatus === 0) {
        $httpStatus = isset($map[$code]) ? $map[$code][1] : 400;
    }
    if (!headers_sent()) {
        header('Content-Type: application/json; charset=utf-8');
        header('Cache-Control: no-store');
    }
    http_response_code($httpStatus);
    echo json_encode(array('code' => $code, 'msg' => $msg, 'data' => null), JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}

/** 读取 JSON 请求体，失败返回空数组。 */
function sc_input(): array
{
    static $in = null;
    if (is_array($in)) {
        return $in;
    }
    $raw = file_get_contents('php://input');
    $data = json_decode((string) $raw, true);
    if (!is_array($data)) {
        // 兼容表单编码的简单提交
        $data = $_POST ?: array();
    }
    $in = $data;
    return $in;
}

function sc_in(string $key, $default = null)
{
    $in = sc_input();
    return array_key_exists($key, $in) ? $in[$key] : $default;
}

function sc_str($value, int $maxLen = 0): string
{
    $s = is_scalar($value) ? (string) $value : '';
    $s = str_replace("\0", '', $s);
    if ($maxLen > 0 && mb_strlen($s, 'UTF-8') > $maxLen) {
        $s = mb_substr($s, 0, $maxLen, 'UTF-8');
    }
    return $s;
}

function sc_int($value, int $default = 0): int
{
    if (is_int($value)) {
        return $value;
    }
    if (is_string($value) && preg_match('/^-?\d+$/', $value)) {
        return (int) $value;
    }
    if (is_float($value)) {
        return (int) $value;
    }
    return $default;
}

function sc_client_ip(): string
{
    $ip = $_SERVER['REMOTE_ADDR'] ?? '';
    // 本站默认不在反向代理之后；只有在配置了可信代理时才解析转发头。
    $trusted = (array) sc_cfg('site.trusted_proxies', array());
    if ($trusted && sc_ip_in_ranges($ip, $trusted)) {
        foreach (array('HTTP_X_FORWARDED_FOR', 'HTTP_X_REAL_IP') as $hk) {
            if (!empty($_SERVER[$hk])) {
                $chain = array_map('trim', explode(',', $_SERVER[$hk]));
                foreach ($chain as $candidate) {
                    if (filter_var($candidate, FILTER_VALIDATE_IP) && !sc_ip_in_ranges($candidate, $trusted)) {
                        return $candidate;
                    }
                }
            }
        }
    }
    return $ip !== '' ? $ip : '0.0.0.0';
}

function sc_ip_in_ranges(string $ip, array $ranges): bool
{
    $ipBin = @inet_pton($ip);
    if ($ipBin === false) {
        return false;
    }
    foreach ($ranges as $range) {
        $range = trim((string) $range);
        if ($range === '') {
            continue;
        }
        if (strpos($range, '/') === false) {
            if ($range === $ip) {
                return true;
            }
            continue;
        }
        list($net, $bits) = explode('/', $range, 2);
        $netBin = @inet_pton($net);
        if ($netBin === false || strlen($netBin) !== strlen($ipBin)) {
            continue;
        }
        $bits = (int) $bits;
        $bytes = intdiv($bits, 8);
        $rem = $bits % 8;
        if (substr($ipBin, 0, $bytes) !== substr($netBin, 0, $bytes)) {
            continue;
        }
        if ($rem === 0) {
            return true;
        }
        $mask = 0xFF << (8 - $rem) & 0xFF;
        if ((ord($ipBin[$bytes]) & $mask) === (ord($netBin[$bytes]) & $mask)) {
            return true;
        }
    }
    return false;
}

function sc_user_agent(): string
{
    return mb_substr((string) ($_SERVER['HTTP_USER_AGENT'] ?? ''), 0, 255, 'UTF-8');
}

/** 固定窗口滑动限流。超限直接返回业务错误。 */
function sc_rate(string $bucket, int $max, int $window, int $code = 1004): int
{
    $since = time() - $window;
    $key = mb_substr($bucket, 0, 96, 'UTF-8');
    // 单条语句完成「判断 + 写入」，避免并发下先查后插导致超限
    $n = db_exec(
        'INSERT INTO rate_limits (bucket, created_at)
         SELECT ?, ? FROM DUAL
         WHERE (SELECT COUNT(*) FROM rate_limits WHERE bucket = ? AND created_at > ?) < ?',
        array($key, time(), $key, $since, $max)
    );
    if ($n === 0) {
        sc_fail($code);
    }
    return 1;
}

/** 概率性清理限流表，避免无限增长。 */
function sc_rate_gc()
{
    if (random_int(1, 50) === 1) {
        db_exec('DELETE FROM rate_limits WHERE created_at < ?', array(time() - 86400));
        db_exec('DELETE FROM login_attempts WHERE created_at < ?', array(time() - 86400));
    }
}

function sc_check_origin()
{
    if (SC_CLI) {
        return;
    }
    $method = $_SERVER['REQUEST_METHOD'] ?? 'GET';
    if (in_array($method, array('POST', 'PUT', 'DELETE'), true)) {
        $origin = $_SERVER['HTTP_ORIGIN'] ?? '';
        if ($origin !== '') {
            $host = $_SERVER['HTTP_HOST'] ?? '';
            $originHost = parse_url($origin, PHP_URL_HOST);
            $originPort = parse_url($origin, PHP_URL_PORT);
            $hostOnly = preg_replace('/:\d+$/', '', $host);
            if ($originHost !== $hostOnly) {
                sc_fail(1003);
            }
            if ($originPort !== null && strpos($host, ':' . $originPort) === false) {
                sc_fail(1003);
            }
        }
    }
}

function sc_log(string $channel, array $ctx = array())
{
    $dir = sc_storage('logs');
    if (!is_dir($dir)) {
        @mkdir($dir, 0755, true);
    }
    $line = date('Y-m-d H:i:s') . ' ' . $channel . ' ' . json_encode($ctx, JSON_UNESCAPED_UNICODE) . "\n";
    $path = $dir . '/app.log';
    // 单文件超过 2MB 轮转一次，避免长期运行撑满空间
    if (is_file($path) && (int) @filesize($path) > 2097152) {
        @rename($path, $path . '.1');
    }
    @file_put_contents($path, $line, FILE_APPEND | LOCK_EX);
}

/** 读取 Bearer 令牌：兼容 Authorization 被主机（CGI/FastCGI）剥离的情况。 */
function sc_bearer_token(): string
{
    $candidates = array();
    foreach (array('HTTP_AUTHORIZATION', 'REDIRECT_HTTP_AUTHORIZATION') as $key) {
        if (isset($_SERVER[$key])) {
            $candidates[] = $_SERVER[$key];
        }
    }
    if (isset($_SERVER['HTTP_X_AUTH_TOKEN'])) {
        $candidates[] = 'Bearer ' . $_SERVER['HTTP_X_AUTH_TOKEN'];
    }
    if (function_exists('getallheaders')) {
        foreach (getallheaders() as $key => $value) {
            if (strcasecmp($key, 'Authorization') === 0) {
                $candidates[] = $value;
            } elseif (strcasecmp($key, 'X-Auth-Token') === 0) {
                $candidates[] = 'Bearer ' . $value;
            }
        }
    }
    foreach ($candidates as $header) {
        if (preg_match('/^Bearer\s+([0-9a-f]{64})$/i', trim((string) $header), $m)) {
            return strtolower($m[1]);
        }
    }
    return '';
}

/** 解析 Bearer，返回用户行（含解密字段）。 */
function sc_auth_user()
{
    static $cached = false;
    static $user = null;
    if ($cached) {
        return $user;
    }
    $cached = true;
    $token = sc_bearer_token();
    if ($token === '') {
        return null;
    }
    $row = db_one(
        'SELECT u.*, t.expires_at, t.device_id AS token_device FROM user_tokens t
         JOIN users u ON u.id = t.user_id
         WHERE t.token_hash = ? LIMIT 1',
        array(token_hash($token))
    );
    if (!$row) {
        return null;
    }
    if ((int) $row['expires_at'] < time() || $row['deleted_at'] !== null) {
        db_exec('DELETE FROM user_tokens WHERE token_hash = ?', array(token_hash($token)));
        return null;
    }
    $user = sc_present_user($row);
    $user['device_id'] = (string) $row['token_device'];
    return $user;
}

function sc_require_auth(): array
{
    $u = sc_auth_user();
    if (!$u) {
        sc_fail(1002);
    }
    // 触达即续期（滑动 7 天）
    $token = sc_bearer_token();
    if ($token !== '') {
        db_exec(
            'UPDATE user_tokens SET expires_at = GREATEST(expires_at, ?) WHERE token_hash = ?',
            array(time() + 7 * 86400, token_hash($token))
        );
    }
    return $u;
}

/** 对外用户视图：解密 B 类字段，绝不返回内部 id 之外的敏感列。 */
function sc_present_user(array $row): array
{
    return array(
        'id'          => (int) $row['id'],
        'public_id'   => (string) $row['public_id'],
        'username'    => (string) field_decrypt($row['username_enc'] ?? ''),
        'nickname'    => (string) field_decrypt($row['nickname_enc'] ?? ''),
        'avatar'      => (string) ($row['avatar'] ?? ''),
        'gender'      => (int) ($row['gender'] ?? 0),
        'signature'   => (string) field_decrypt($row['signature_enc'] ?? ''),
        'public_key'  => (string) ($row['public_key'] ?? ''),
        'created_at'  => (int) ($row['created_at'] ?? 0),
        'is_staff'    => (int) ($row['is_staff'] ?? 0) === 1,
    );
}

function sc_user_by_id(int $id)
{
    $row = db_one('SELECT * FROM users WHERE id = ? AND deleted_at IS NULL LIMIT 1', array($id));
    return $row ? sc_present_user($row) : null;
}

function sc_user_by_public_id(string $publicId)
{
    $row = db_one('SELECT * FROM users WHERE public_id = ? AND deleted_at IS NULL LIMIT 1', array($publicId));
    return $row ? sc_present_user($row) : null;
}

function sc_user_by_username(string $username)
{
    $row = db_one('SELECT * FROM users WHERE username_bidx = ? AND deleted_at IS NULL LIMIT 1', array(blind_index($username)));
    return $row ? sc_present_user($row) : null;
}

function sc_is_friend(int $a, int $b): bool
{
    if ($a <= 0 || $b <= 0 || $a === $b) {
        return false;
    }
    return (bool) db_val(
        'SELECT 1 FROM friends WHERE user_id = ? AND friend_id = ? AND status = 1 LIMIT 1',
        array($a, $b)
    );
}

function sc_is_blocked(int $a, int $b): bool
{
    return (bool) db_val(
        'SELECT 1 FROM friends WHERE user_id = ? AND friend_id = ? AND status = 2 LIMIT 1',
        array($a, $b)
    );
}

/** 会话成员校验，返回会话行；非成员返回 null。 */
function sc_conv_for_user(int $convId, int $userId)
{
    return db_one(
        'SELECT c.* FROM conversations c
         JOIN user_conversations uc ON uc.conv_id = c.id AND uc.user_id = ? AND uc.is_deleted = 0
         WHERE c.id = ? LIMIT 1',
        array($userId, $convId)
    );
}

/** 把常见异常翻译成可行动的提示（不暴露路径与 SQL 细节）。 */
function sc_error_hint($e): string
{
    $msg = (string) $e->getMessage();
    if ($e instanceof PDOException) {
        if (stripos($msg, 'Unknown database') !== false) {
            return '数据库不存在，请检查 config/config.php 中的库名';
        }
        if (stripos($msg, "doesn't exist") !== false || stripos($msg, 'no such table') !== false) {
            return '数据表缺失，请导入 sql/schema.sql 后重试';
        }
        if (stripos($msg, 'Access denied') !== false) {
            return '数据库账号或密码错误，请检查 config/config.php';
        }
        if (stripos($msg, 'Connection refused') !== false || stripos($msg, 'getaddrinfo') !== false
            || stripos($msg, 'No such host') !== false) {
            return '无法连接数据库，请检查数据库主机地址';
        }
        return '数据库错误，请访问 /diag.php 查看详情';
    }
    if (stripos($msg, 'master.key') !== false || stripos($msg, '主密钥') !== false) {
        return '缺少主密钥，请重新运行 install.php 或执行 tools/make_key.php';
    }
    if (stripos($msg, 'Permission denied') !== false || stripos($msg, 'not writable') !== false) {
        return '文件权限不足，请确认 storage/ 与 secrets/ 目录可写';
    }
    return '服务暂时不可用，请访问 /diag.php 检查环境';
}
