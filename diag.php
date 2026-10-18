<?php
declare(strict_types=1);

/**
 * 环境自检页：部署后打不开、接口 500 时先访问 /diag.php。
 * 不输出密码与密钥内容；可配置 site.diag_key 作为访问口令。
 */

header('Content-Type: text/html; charset=utf-8');
header('X-Robots-Tag: noindex, nofollow');

$root = __DIR__;
$cfgPath = $root . '/config/config.php';
$cfg = array();
if (is_file($cfgPath)) {
    $cfg = require $cfgPath;
}

$diagKey = isset($cfg['site']['diag_key']) ? (string) $cfg['site']['diag_key'] : '';
if ($diagKey !== '' && (!isset($_GET['key']) || !hash_equals($diagKey, (string) $_GET['key']))) {
    http_response_code(404);
    exit;
}

$items = array();
function sc_diag_add(&$items, $name, $ok, $detail)
{
    $items[] = array('name' => $name, 'ok' => (bool) $ok, 'detail' => (string) $detail);
}

sc_diag_add($items, 'PHP 版本', version_compare(PHP_VERSION, '7.0.0', '>='), PHP_VERSION);
foreach (array('pdo_mysql', 'openssl', 'mbstring', 'gd', 'json') as $ext) {
    sc_diag_add($items, '扩展 ' . $ext, extension_loaded($ext), extension_loaded($ext) ? '已启用' : '未启用');
}
sc_diag_add($items, 'config/config.php', is_file($cfgPath), is_file($cfgPath) ? '存在' : '缺失，请先运行 install.php');

$keyPath = isset($cfg['secrets']['path']) ? (string) $cfg['secrets']['path'] : $root . '/secrets/master.key';
$keyOk = false;
$keyDetail = '缺失';
if (is_file($keyPath)) {
    $raw = trim((string) file_get_contents($keyPath));
    if (preg_match('/^[0-9a-f]{64}$/i', $raw)) {
        $keyOk = true;
        $keyDetail = '存在（64 位十六进制）';
    } elseif (strlen($raw) === 32) {
        $keyOk = true;
        $keyDetail = '存在（32 字节）';
    } else {
        $keyDetail = '长度异常：' . strlen($raw) . ' 字节';
    }
}
sc_diag_add($items, '主密钥', $keyOk, $keyDetail);
$lockPath = $root . '/storage/installed.lock';
$lockOk = is_file($lockPath) && (int) @filesize($lockPath) > 0;
sc_diag_add($items, 'storage/installed.lock', $lockOk,
    !is_file($lockPath) ? '缺失，安装未完成' : ($lockOk ? '存在' : '空文件，安装未完成'));

foreach (array('config', 'secrets', 'storage', 'media') as $dir) {
    $abs = $root . '/' . $dir;
    sc_diag_add($items, '目录可写 ' . $dir, is_dir($abs) && is_writable($abs),
        is_dir($abs) ? (is_writable($abs) ? '可写' : '不可写') : '不存在');
}

$tables = array();
$dbOk = false;
$dbErr = '';
if (isset($cfg['db']['host'], $cfg['db']['name'], $cfg['db']['user'])) {
    try {
        $dsn = 'mysql:host=' . $cfg['db']['host'] . ';port=' . (int) $cfg['db']['port']
            . ';dbname=' . $cfg['db']['name'] . ';charset=utf8mb4';
        $pdo = new PDO($dsn, (string) $cfg['db']['user'], (string) $cfg['db']['pass'], array(
            PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
        ));
        $tables = $pdo->query('SHOW TABLES')->fetchAll(PDO::FETCH_COLUMN);
        $dbOk = true;
    } catch (Exception $e) {
        $dbErr = $e->getMessage();
    }
} else {
    $dbErr = '配置中缺少数据库连接信息';
}
sc_diag_add($items, '数据库连接', $dbOk, $dbOk ? '成功，共 ' . count($tables) . ' 张表' : '失败：' . $dbErr);

$critical = array('users', 'user_tokens', 'conversations', 'messages', 'groups', 'media_files', 'group_keys', 'settings');
$missing = array();
foreach ($critical as $t) {
    if (!in_array($t, $tables, true)) {
        $missing[] = $t;
    }
}
sc_diag_add($items, '关键数据表', !$missing, $missing ? '缺失：' . implode(', ', $missing) : '齐全');

$logTail = '';
$logPath = $root . '/storage/logs/app.log';
if (is_file($logPath)) {
    $lines = preg_split('/\r\n|\r|\n/', (string) file_get_contents($logPath));
    $logTail = implode("\n", array_slice($lines, -20));
}

$failures = 0;
foreach ($items as $it) {
    if (!$it['ok']) {
        $failures++;
    }
}
?>
<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<title>环境自检 · SilverChat</title>
<link rel="stylesheet" href="/assets/css/app.css?v=<?php echo defined('SC_VERSION') ? SC_VERSION : '1'; ?>">
</head>
<body class="page-doc">
<main class="doc-body">
  <h1 style="font-size:20px;margin-bottom:6px">环境自检</h1>
  <p class="muted small" style="margin-bottom:16px">
    <?php echo $failures === 0 ? '全部检查通过。若仍无法使用，请查看下方日志。' : '发现 ' . (int) $failures . ' 项异常，请按提示处理。'; ?>
  </p>

  <table class="doc-content" style="width:100%">
    <thead><tr><th style="width:42%">检查项</th><th>结果</th></tr></thead>
    <tbody>
    <?php foreach ($items as $it): ?>
      <tr>
        <td><?php echo htmlspecialchars($it['name'], ENT_QUOTES, 'UTF-8'); ?></td>
        <td>
          <span style="color:<?php echo $it['ok'] ? '#0a8f4b' : '#c03434'; ?>;font-weight:600">
            <?php echo $it['ok'] ? '通过' : '异常'; ?>
          </span>
          <span class="muted small"> · <?php echo htmlspecialchars($it['detail'], ENT_QUOTES, 'UTF-8'); ?></span>
        </td>
      </tr>
    <?php endforeach; ?>
    </tbody>
  </table>

  <?php if (!$keyOk): ?>
  <div class="alert alert-danger" style="margin-top:18px">
    主密钥缺失：在服务器执行 <code>php tools/make_key.php</code>；没有命令行权限时，删除 <code>storage/installed.lock</code> 后重新访问 <code>/install.php</code>。若数据库已有账号数据，补生成密钥会导致旧数据无法解密。
  </div>
  <?php endif; ?>
  <?php if ($missing): ?>
  <div class="alert alert-danger" style="margin-top:12px">
    数据表缺失：导入 <code>sql/schema.sql</code>，或重新运行 <code>/install.php</code>。
  </div>
  <?php endif; ?>
  <?php if (!$dbOk): ?>
  <div class="alert alert-danger" style="margin-top:12px">
    数据库连接失败：检查 <code>config/config.php</code> 中的主机、库名、账号、密码，以及主机面板是否允许远程连接。
  </div>
  <?php endif; ?>

  <?php if ($logTail !== ''): ?>
  <h2 style="font-size:16px;margin-top:22px">最近应用日志</h2>
  <pre style="background:#f7f7f7;padding:12px;border-radius:8px;overflow:auto;font-size:12px;line-height:18px"><?php
    echo htmlspecialchars($logTail, ENT_QUOTES, 'UTF-8');
  ?></pre>
  <?php endif; ?>

  <div class="alert alert-warn" style="margin-top:18px">
    部署完成后建议删除本文件，或在 config/config.php 的 site 中加入 <code>'diag_key' => '自定义口令'</code>，访问时带上 <code>?key=口令</code>。
  </div>
</main>
</body>
</html>
