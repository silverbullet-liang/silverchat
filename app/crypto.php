<?php
declare(strict_types=1);

require_once __DIR__ . '/bootstrap.php';

/**
 * 服务器端密码学：B 类字段加密、盲索引、Token 哈希。
 * AES-256-CBC + HMAC-SHA256（先验 MAC 再解密），每次随机 IV。
 * 密文格式：v1:{base64(iv)}:{base64(ciphertext)}:{base64(mac)}
 */

function sc_master_key(): string
{
    static $master = null;
    if ($master !== null) {
        return $master;
    }
    $path = (string) sc_cfg('secrets.path', SC_ROOT . '/secrets/master.key');
    if (!is_file($path)) {
        throw new RuntimeException('secrets/master.key 缺失，请重新运行安装程序');
    }
    $raw = file_get_contents($path);
    if ($raw === false) {
        throw new RuntimeException('无法读取主密钥文件');
    }
    // 允许 ASCII 十六进制存储；二进制 32 字节同样接受。
    $raw = trim($raw);
    if (preg_match('/^[0-9a-f]{64}$/i', $raw)) {
        $raw = hex2bin($raw);
    }
    if (strlen($raw) !== 32) {
        throw new RuntimeException('主密钥长度必须为 32 字节');
    }
    $master = $raw;
    return $master;
}

/** 密钥分离：enc / mac / blind 互不可推导。 */
function sc_keys(): array
{
    $master = sc_master_key();
    return array(
        'enc'   => hash_hmac('sha256', 'field-encryption', $master, true),
        'mac'   => hash_hmac('sha256', 'field-authentication', $master, true),
        'blind' => hash_hmac('sha256', 'blind-index', $master, true),
    );
}

function field_encrypt($plain)
{
    if ($plain === null || $plain === '') {
        return $plain === '' ? '' : null;
    }
    $keys = sc_keys();
    $iv = random_bytes(16);
    $ct = openssl_encrypt((string) $plain, 'aes-256-cbc', $keys['enc'], OPENSSL_RAW_DATA, $iv);
    if ($ct === false) {
        throw new RuntimeException('字段加密失败');
    }
    $mac = hash_hmac('sha256', 'v1|' . $iv . $ct, $keys['mac'], true);
    return 'v1:' . base64_encode($iv) . ':' . base64_encode($ct) . ':' . base64_encode($mac);
}

function field_decrypt($payload)
{
    if ($payload === null || $payload === '') {
        return $payload === '' ? '' : null;
    }
    $parts = explode(':', (string) $payload, 4);
    if (count($parts) !== 4 || $parts[0] !== 'v1') {
        return null;
    }
    $keys = sc_keys();
    $iv = base64_decode($parts[1], true);
    $ct = base64_decode($parts[2], true);
    $mac = base64_decode($parts[3], true);
    if ($iv === false || $ct === false || $mac === false || strlen($iv) !== 16) {
        return null;
    }
    $expected = hash_hmac('sha256', 'v1|' . $iv . $ct, $keys['mac'], true);
    // 先验 MAC 再解密，防止填充预言。
    if (!hash_equals($expected, $mac)) {
        return null;
    }
    $plain = openssl_decrypt($ct, 'aes-256-cbc', $keys['enc'], OPENSSL_RAW_DATA, $iv);
    return $plain === false ? null : $plain;
}

/** 盲索引：大小写不敏感，密钥保密，可建唯一索引。 */
function blind_index(string $value): string
{
    $keys = sc_keys();
    $normalized = mb_strtolower(trim($value), 'UTF-8');
    return hash_hmac('sha256', $normalized, $keys['blind']);
}

function random_hex(int $bytes): string
{
    return bin2hex(random_bytes($bytes));
}

function token_new(): string
{
    return bin2hex(random_bytes(32));
}

function token_hash(string $token): string
{
    return hash('sha256', $token);
}

/** 对外用户 ID：sc_ + base36(id×7919+rand) + 2 位 hex，不泄露自增规律。 */
function public_id_new(int $internalId): string
{
    $n = $internalId * 7919 + random_int(1000, 9999);
    return 'sc_' . base_convert((string) $n, 10, 36) . substr(bin2hex(random_bytes(1)), 0, 2);
}

function group_public_id_new(): string
{
    return 'gp_' . random_hex(4);
}

function client_msg_id_new(int $userId): string
{
    return $userId . '_' . time() . '_' . random_hex(3);
}
