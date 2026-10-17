<?php
declare(strict_types=1);

/**
 * 修改客服账号密码。
 * 用法：php tools/set_kefu_password.php '新密码'
 */

if (PHP_SAPI !== 'cli') {
    http_response_code(404);
    exit;
}

require_once __DIR__ . '/../app/bootstrap.php';
require_once __DIR__ . '/../app/db.php';
require_once __DIR__ . '/../app/crypto.php';
require_once __DIR__ . '/../app/kefu_seed.php';

$password = isset($argv[1]) ? (string) $argv[1] : '';
if (strlen($password) < 8) {
    fwrite(STDERR, "用法：php tools/set_kefu_password.php '新密码'（至少 8 位）\n");
    exit(1);
}

$kefu = sc_kefu_user();
if (!$kefu) {
    fwrite(STDERR, "客服账号不存在，请先完成安装。\n");
    exit(1);
}

db_exec(
    'UPDATE users SET password_hash = ? WHERE id = ?',
    array(password_hash($password, PASSWORD_BCRYPT, array('cost' => 12)), (int) $kefu['id'])
);
db_exec('DELETE FROM user_tokens WHERE user_id = ?', array((int) $kefu['id']));

echo "客服密码已更新，所有客服设备需重新登录。\n";
