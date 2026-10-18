<?php
declare(strict_types=1);

/**
 * 生成主密钥（仅在缺失时执行）。
 * 用法：php tools/make_key.php
 *
 * 注意：若数据库中已有加密字段（用户名、昵称等），更换或补生成主密钥会导致这些数据无法解密。
 * 首次部署、数据库为空时使用最安全。
 */

if (PHP_SAPI !== 'cli') {
    http_response_code(404);
    exit;
}

$root = dirname(__DIR__);
$path = $root . '/secrets/master.key';

if (is_file($path)) {
    $raw = trim((string) file_get_contents($path));
    echo "主密钥已存在（长度 " . strlen($raw) . "），未改动。\n";
    exit(0);
}

if (!is_dir($root . '/secrets')) {
    if (!@mkdir($root . '/secrets', 0755, true) && !is_dir($root . '/secrets')) {
        fwrite(STDERR, "无法创建 secrets 目录，请检查站点根目录写权限。\n");
        exit(1);
    }
}

$written = @file_put_contents($path, bin2hex(random_bytes(32)));
if ($written === false) {
    fwrite(STDERR, "无法写入 secrets/master.key，请检查 secrets 目录权限。\n");
    exit(1);
}
@chmod($path, 0600);
echo "已生成主密钥：secrets/master.key\n";
echo "如果数据库中已有账号数据，这些数据将无法解密，请确认这是首次安装。\n";
