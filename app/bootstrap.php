<?php
declare(strict_types=1);

/**
 * SilverChat 引导文件：配置、错误处理、安全响应头、会话上下文。
 * 目标运行环境：PHP 7.0+（不使用 7.1 之后的语法）。
 */

define('SC_ROOT', dirname(__DIR__));
define('SC_VERSION', '1.0.0');

if (!defined('SC_CLI')) {
    define('SC_CLI', PHP_SAPI === 'cli');
}

function sc_config_path(): string
{
    return SC_ROOT . '/config/config.php';
}

function sc_is_installed(): bool
{
    return is_file(sc_config_path()) && is_file(SC_ROOT . '/storage/installed.lock');
}

function sc_config(): array
{
    static $cfg = null;
    if ($cfg !== null) {
        return $cfg;
    }
    $path = sc_config_path();
    if (!is_file($path)) {
        if (SC_CLI) {
            fwrite(STDERR, "config/config.php 不存在，请先运行 install.php\n");
            exit(2);
        }
        if (strpos($_SERVER['REQUEST_URI'] ?? '', '/install.php') === false
            && strpos($_SERVER['REQUEST_URI'] ?? '', '/setup.php') === false) {
            header('Location: ' . (is_file(SC_ROOT . '/install.php') ? '/install.php' : '/setup.php'));
            exit;
        }
        return array();
    }
    $cfg = require $path;
    return $cfg;
}

function sc_cfg(string $path, $default = null)
{
    $node = sc_config();
    foreach (explode('.', $path) as $seg) {
        if (!is_array($node) || !array_key_exists($seg, $node)) {
            return $default;
        }
        $node = $node[$seg];
    }
    return $node;
}

function sc_is_https(): bool
{
    if (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off') {
        return true;
    }
    return isset($_SERVER['HTTP_X_FORWARDED_PROTO']) && $_SERVER['HTTP_X_FORWARDED_PROTO'] === 'https';
}

function sc_base_url(): string
{
    $url = (string) sc_cfg('site.url', '');
    return rtrim($url, '/');
}

/** 统一的安全响应头。HTML 页面额外下发 CSP。 */
function sc_security_headers(bool $html = false)
{
    if (headers_sent()) {
        return;
    }
    header('X-Content-Type-Options: nosniff');
    header('X-Frame-Options: DENY');
    header('Referrer-Policy: no-referrer');
    header('Permissions-Policy: geolocation=(), camera=(), microphone=()');
    header('Cross-Origin-Opener-Policy: same-origin');
    if (sc_is_https()) {
        header('Strict-Transport-Security: max-age=31536000; includeSubDomains');
    }
    if ($html) {
        // 脚本只允许同源文件，杜绝内联脚本执行；样式允许内联属性（动态布局需要）。
        header("Content-Security-Policy: default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; "
            . "img-src 'self' data: blob:; media-src 'self' blob:; connect-src 'self'; font-src 'self'; "
            . "object-src 'none'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'");
    }
}

/** 必需扩展检测：缺失时给出可行动的提示，而不是白屏 500。 */
function sc_extension_guard()
{
    $missing = array();
    if (!function_exists('mb_internal_encoding')) {
        $missing[] = 'mbstring';
    }
    if (!function_exists('openssl_encrypt')) {
        $missing[] = 'openssl';
    }
    if (!$missing) {
        return;
    }
    $msg = '缺少 PHP 扩展：' . implode('、', $missing) . '。请在主机控制面板启用后重试。';
    if (SC_CLI) {
        fwrite(STDERR, $msg . "\n");
        exit(1);
    }
    http_response_code(500);
    header('Content-Type: text/html; charset=utf-8');
    echo '<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><title>服务器环境不满足</title></head>'
        . '<body style="font-family:-apple-system,BlinkMacSystemFont,sans-serif;background:#f7f7f7">'
        . '<div style="max-width:520px;margin:80px auto;padding:24px;background:#fff;border-radius:12px">'
        . '<h2 style="font-size:18px;margin:0 0 10px">服务器环境不满足</h2>'
        . '<p style="color:#666;line-height:1.7;margin:0">' . htmlspecialchars($msg, ENT_QUOTES, 'UTF-8') . '</p>'
        . '</div></body></html>';
    exit;
}

function sc_boot()
{
    sc_extension_guard();
    $tz = (string) sc_cfg('site.timezone', 'UTC');
    date_default_timezone_set($tz !== '' ? $tz : 'UTC');
    mb_internal_encoding('UTF-8');

    $debug = (bool) sc_cfg('site.debug', false);
    if ($debug) {
        ini_set('display_errors', '1');
        error_reporting(E_ALL);
    } else {
        ini_set('display_errors', '0');
        error_reporting(E_ALL & ~E_NOTICE & ~E_DEPRECATED);
    }

    if (!SC_CLI && sc_cfg('site.force_https', false) && !sc_is_https()) {
        $host = $_SERVER['HTTP_HOST'] ?? '';
        $uri = $_SERVER['REQUEST_URI'] ?? '/';
        header('Location: https://' . $host . $uri, true, 301);
        exit;
    }
}

/** 运行时目录（媒体、缓存、安装锁）。 */
function sc_storage(string $sub = ''): string
{
    $base = SC_ROOT . '/storage';
    if ($sub !== '') {
        $base .= '/' . trim($sub, '/');
    }
    return $base;
}

/** 确保目录存在且不可被 Web 直接访问（目录内放 .htaccess）。 */
function sc_ensure_dir(string $dir): bool
{
    if (is_dir($dir)) {
        return true;
    }
    if (!@mkdir($dir, 0755, true) && !is_dir($dir)) {
        return false;
    }
    $ht = $dir . '/.htaccess';
    if (!is_file($ht)) {
        @file_put_contents($ht, "<IfModule mod_authz_core.c>\n  Require all denied\n</IfModule>\n"
            . "<IfModule !mod_authz_core.c>\n  Order allow,deny\n  Deny from all\n</IfModule>\n");
    }
    return true;
}
