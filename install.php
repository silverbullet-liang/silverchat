<?php
declare(strict_types=1);

/**
 * 一次性安装程序：写入配置、生成主密钥、建表、播种内置表情。
 * 本页不做任何「是否已安装」检测：随时访问都显示安装表单。
 * 安装完成后写入 storage/installed.lock，供站点其他位置判断初始化状态。
 */

require_once __DIR__ . '/app/bootstrap.php';
require_once __DIR__ . '/app/crypto.php';

$isCli = PHP_SAPI === 'cli';
$errors = array();
$done = false;

$defaults = array(
    'db_host' => 'localhost',
    'db_port' => '3306',
    'db_name' => 'silverchat',
    'db_user' => '',
    'db_pass' => '',
    'site_url' => $isCli ? 'http://localhost:8080' : ((isset($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off' ? 'https' : 'http') . '://' . ($_SERVER['HTTP_HOST'] ?? 'localhost')),
    'force_https' => $isCli ? '0' : ((isset($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off') ? '1' : '0'),
);

// 已有配置文件时用其值预填：在已完成硬编码的站点上运行本程序，只建表与播种数据，
// 不会把生产配置冲掉。密码不回显，留空即沿用现有值。
$preset = array();
if (is_file(__DIR__ . '/config/config.php')) {
    $cur = @include __DIR__ . '/config/config.php';
    if (is_array($cur) && isset($cur['db'])) {
        $preset = $cur;
        $defaults['db_host'] = (string) ($cur['db']['host'] ?? $defaults['db_host']);
        $defaults['db_port'] = (string) ($cur['db']['port'] ?? $defaults['db_port']);
        $defaults['db_name'] = (string) ($cur['db']['name'] ?? $defaults['db_name']);
        $defaults['db_user'] = (string) ($cur['db']['user'] ?? $defaults['db_user']);
        if (!empty($cur['site']['url'])) {
            $defaults['site_url'] = (string) $cur['site']['url'];
        }
        if (isset($cur['site']['force_https'])) {
            $defaults['force_https'] = $cur['site']['force_https'] ? '1' : '0';
        }
    }
}

$values = $defaults;
if ($isCli) {
    foreach ($argv as $arg) {
        if (preg_match('/^--([a-z_]+)=(.*)$/', $arg, $m)) {
            $values[$m[1]] = $m[2];
        }
    }
    $install = true;
} else {
    $install = ($_SERVER['REQUEST_METHOD'] === 'POST');
    if ($install) {
        foreach ($defaults as $k => $v) {
            $values[$k] = isset($_POST[$k]) ? trim((string) $_POST[$k]) : $v;
        }
        // 密码留空＝沿用配置文件里的现有密码，页面上不回显任何凭据
        if ($values['db_pass'] === '' && !empty($preset['db']['pass'])) {
            $values['db_pass'] = (string) $preset['db']['pass'];
        }
    }
}

if ($install) {
    // 客服初始密码：安装时指定 → 环境变量 → 随机生成（不写入仓库）
    $kefuPass = '';
    if ($isCli) {
        $kefuPass = isset($values['kefu_pass']) ? trim((string) $values['kefu_pass']) : '';
    } else {
        $kefuPass = isset($_POST['kefu_pass']) ? trim((string) $_POST['kefu_pass']) : '';
    }
    if ($kefuPass === '' && getenv('SC_KEFU_PASSWORD')) {
        $kefuPass = trim((string) getenv('SC_KEFU_PASSWORD'));
    }
    if ($kefuPass === '') {
        $kefuPass = bin2hex(random_bytes(8));
    }
    if (strlen($kefuPass) < 8) {
        $errors[] = '客服密码至少 8 位';
    }

    $missing = array();
    foreach (array('db_host', 'db_name', 'db_user', 'site_url') as $k) {
        if ($values[$k] === '') {
            $missing[] = $k;
        }
    }
    if ($values['site_url'] !== '' && !preg_match('#^https?://#', $values['site_url'])) {
        $errors[] = '站点地址必须以 http:// 或 https:// 开头';
    }
    if ($missing) {
        $errors[] = '请填写完整的数据库与站点信息';
    }

    if (!$errors) {
        try {
            $dsn = 'mysql:host=' . $values['db_host'] . ';port=' . (int) $values['db_port'] . ';dbname=' . $values['db_name'] . ';charset=utf8mb4';
            $pdo = new PDO($dsn, $values['db_user'], $values['db_pass'], array(
                PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
            ));
            // 先删整行注释：否则「-- 注释」与其后的 CREATE TABLE 会被分到同一块，
            // 块首是 -- 而被整体跳过，导致该表根本没建。
            $sql = preg_replace('/^\s*--[^\n]*$/m', '', (string) file_get_contents(SC_ROOT . '/sql/schema.sql'));
            $statements = array_filter(array_map('trim', preg_split('/;\s*\n/', $sql)));
            foreach ($statements as $stmt) {
                if ($stmt === '' || strpos($stmt, '--') === 0) {
                    continue;
                }
                $pdo->exec($stmt);
            }

            // 配置
            $config = array(
                'db' => array(
                    'host' => $values['db_host'], 'port' => (int) $values['db_port'], 'name' => $values['db_name'],
                    'user' => $values['db_user'], 'pass' => $values['db_pass'], 'charset' => 'utf8mb4',
                ),
                'site' => array(
                    'name' => 'SilverChat', 'url' => rtrim($values['site_url'], '/'),
                    'force_https' => $values['force_https'] === '1', 'debug' => false, 'timezone' => 'Asia/Shanghai',
                ),
                'secrets' => array('path' => SC_ROOT . '/secrets/master.key'),
                'kefu' => array('username' => 'kefu', 'password' => $kefuPass),
                'limits' => array(
                    'login_fail_max' => 5, 'login_fail_window' => 300, 'register_per_hour' => 3,
                    'message_per_second' => 5, 'friend_req_per_day' => 20, 'poll_per_minute' => 30,
                    'upload_per_hour' => 120,
                ),
                'media' => array(
                    'max_image' => 5242880, 'max_voice' => 10485760, 'max_video' => 52428800,
                    'max_file' => 20971520, 'ttl' => 604800,
                ),
                'call' => array(
                    // 公开 STUN（2026-10 实测）；可在 config 中替换为自建 STUN
                    'stun' => array(
                        'stun:stun.miwifi.com:3478',
                        'stun:stun.chat.bilibili.com:3478',
                        'stun:stun.hitv.com:3478',
                        'stun:stun.douyucdn.cn:18000',
                        'stun:stun.l.google.com:19302',
                    ),
                ),
            );
            if (!sc_ensure_dir(SC_ROOT . '/config')) {
                throw new RuntimeException('无法创建 config 目录');
            }
            $php = "<?php\n// SilverChat 配置（安装程序生成）\nreturn " . var_export($config, true) . ";\n";
            // 密钥路径写成相对站点根目录的表达式，避免目录搬迁后失效
            $php = str_replace("'" . SC_ROOT . "/secrets/master.key'", "dirname(__DIR__) . '/secrets/master.key'", $php);
            if (@file_put_contents(SC_ROOT . '/config/config.php', $php) === false) {
                throw new RuntimeException('无法写入 config/config.php');
            }
            @chmod(SC_ROOT . '/config/config.php', 0640);

            // 主密钥
            if (!sc_ensure_dir(SC_ROOT . '/secrets')) {
                throw new RuntimeException('无法创建 secrets 目录');
            }
            $keyPath = SC_ROOT . '/secrets/master.key';
            if (!is_file($keyPath)) {
                $written = @file_put_contents($keyPath, bin2hex(random_bytes(32)));
                if ($written === false) {
                    throw new RuntimeException('无法写入 secrets/master.key，请检查 secrets 目录权限');
                }
                @chmod($keyPath, 0600);
            }

            sc_ensure_dir(SC_ROOT . '/storage');
            sc_ensure_dir(SC_ROOT . '/storage/logs');
            $avatarDir = SC_ROOT . '/media/avatar';
            sc_ensure_dir(SC_ROOT . '/media');
            sc_ensure_dir($avatarDir);

            $done = true;
        } catch (Exception $e) {
            $errors[] = '安装失败：' . $e->getMessage();
        }
    }
}

if ($done) {
    if (@file_put_contents(SC_ROOT . '/storage/installed.lock', date('c') . "\n") === false) {
        $errors[] = '无法写入 storage/installed.lock，请检查 storage 目录权限';
        $done = false;
    }
}

if ($isCli) {
    if ($errors) {
        fwrite(STDERR, implode("\n", $errors) . "\n");
        exit(1);
    }
    require_once __DIR__ . '/app/emoji_seed.php';
    require_once __DIR__ . '/app/kefu_seed.php';
    $seeded = sc_seed_builtin_emoji();
    $kefu = sc_ensure_kefu($kefuPass);
    echo "安装完成，导入表情 " . $seeded . " 个。\n";
    echo "客服账号：" . sc_kefu_username() . "\n";
    echo "客服密码：" . $kefuPass . "\n";
    echo "请妥善保存，并尽快执行：php tools/set_kefu_password.php '新密码'\n";
    exit(0);
}

if ($done) {
    // 播种内置表情与客服账号
    require_once __DIR__ . '/app/emoji_seed.php';
    require_once __DIR__ . '/app/kefu_seed.php';
    sc_seed_builtin_emoji();
    sc_ensure_kefu($kefuPass);
    $kefuName = htmlspecialchars(sc_kefu_username(), ENT_QUOTES, 'UTF-8');
    $kefuShow = htmlspecialchars($kefuPass, ENT_QUOTES, 'UTF-8');
    header('Content-Type: text/html; charset=utf-8');
    echo '<!doctype html><html lang="zh-CN"><head><meta charset="utf-8">'
        . '<meta name="viewport" content="width=device-width, initial-scale=1"><title>安装完成</title>'
        . '<link rel="stylesheet" href="/assets/css/app.css?v=' . SC_VERSION . '"></head><body class="page-install">'
        . '<main class="install-card"><h1>安装完成</h1>'
        . '<p class="muted">请立即保存客服账号信息。该密码只显示这一次，之后可在服务器上通过命令行修改。</p>'
        . '<div class="alert alert-info"><div>客服账号：<b>' . $kefuName . '</b><br>客服密码：<b class="mono">' . $kefuShow . '</b></div></div>'
        . '<p class="small muted" style="line-height:20px">建议安装完成后立即执行：<br>'
        . '<code class="mono">php tools/set_kefu_password.php \'新密码\'</code></p>'
        . '<a class="btn btn-primary btn-block" href="/login">进入登录</a>'
        . '</main></body></html>';
    exit;
}
?>
<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>安装 SilverChat</title>
<meta name="sc-build" content="2026-10-18">
<link rel="stylesheet" href="/assets/css/app.css?v=<?php echo SC_VERSION; ?>">
</head>
<body class="page-install">
<main class="install-card">
  <h1>SilverChat 安装</h1>
  <p class="small muted" style="margin:2px 0 12px">安装程序 1.1.1 · 2026-10-20</p>
  <p class="muted">填写数据库信息，安装程序会建表并生成主密钥。安装完成后请删除 install.php 与 setup.php。</p>
  <?php foreach ($errors as $e): ?>
    <div class="alert alert-danger"><?php echo htmlspecialchars($e, ENT_QUOTES, 'UTF-8'); ?></div>
  <?php endforeach; ?>
  <form method="post" autocomplete="off">
    <label class="field"><span>数据库主机</span><input class="input" name="db_host" value="<?php echo htmlspecialchars($values['db_host'], ENT_QUOTES, 'UTF-8'); ?>"><div class="input-hint">共享主机请填写控制面板给出的数据库地址（如 <code>sql123.infinityfree.com</code>），不要填 localhost。</div></label>
    <label class="field"><span>端口</span><input class="input" name="db_port" value="<?php echo htmlspecialchars($values['db_port'], ENT_QUOTES, 'UTF-8'); ?>"></label>
    <label class="field"><span>数据库名</span><input class="input" name="db_name" value="<?php echo htmlspecialchars($values['db_name'], ENT_QUOTES, 'UTF-8'); ?>"></label>
    <label class="field"><span>数据库用户</span><input class="input" name="db_user" value="<?php echo htmlspecialchars($values['db_user'], ENT_QUOTES, 'UTF-8'); ?>"></label>
    <label class="field"><span>数据库密码</span><input class="input" type="password" name="db_pass" value=""><div class="input-hint">已配置过时留空即可：安装程序会沿用配置文件中的密码，既不覆盖也不回显。</div></label>
    <label class="field"><span>客服初始密码（留空自动生成）</span><input class="input" type="text" name="kefu_pass" value="" placeholder="至少 8 位，留空则随机生成并显示一次"></label>
    <label class="field"><span>站点地址</span><input class="input" name="site_url" value="<?php echo htmlspecialchars($values['site_url'], ENT_QUOTES, 'UTF-8'); ?>"></label>
    <label class="field checkbox"><input type="checkbox" name="force_https" value="1" <?php echo $values['force_https'] === '1' ? 'checked' : ''; ?>><span>强制 HTTPS（正式环境建议开启）</span></label>
    <button class="btn btn-primary btn-block" type="submit">开始安装</button>
  </form>
</main>
</body>
</html>
