<?php
declare(strict_types=1);

require_once __DIR__ . '/app/bootstrap.php';
require_once __DIR__ . '/app/legal_page.php';

sc_boot();
sc_security_headers(true);

$siteName = (string) sc_cfg('site.name', 'SilverChat');
$path = parse_url($_SERVER['REQUEST_URI'] ?? '/', PHP_URL_PATH);
$path = '/' . trim((string) $path, '/');

$docs = sc_legal_docs();
$legalDoc = null;
if (preg_match('#^/legal/([a-z\\-]+)$#', $path, $m) && isset($docs[$m[1]])) {
    $legalDoc = $m[1];
}

// 兼容 /legal/{doc} 与服务端直出的 /legal.php?doc={doc}
if ($legalDoc !== null) {
    echo sc_legal_page_html($legalDoc);
    exit;
}
?>
<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="theme-color" content="#f7f7f7">
<meta name="robots" content="noindex, nofollow">
<title><?php echo sc_e($siteName); ?></title>
<link rel="stylesheet" href="/assets/css/app.css?v=<?php echo SC_VERSION; ?>">
<link rel="icon" type="image/svg+xml" href="/assets/img/logo.svg">
<link rel="manifest" href="/manifest.json">
</head>
<body class="page-app">
<div class="app-shell" id="app">
  <div class="boot-screen" id="boot">
    <div class="boot-logo">
      <svg viewBox="0 0 64 64" width="64" height="64" aria-hidden="true">
        <rect x="2" y="2" width="60" height="60" rx="16" fill="#07c160"/>
        <path d="M18 22h28a6 6 0 0 1 6 6v12a6 6 0 0 1-6 6H32l-9 7v-7h-5a6 6 0 0 1-6-6V28a6 6 0 0 1 6-6z" fill="#fff" opacity=".96"/>
        <circle cx="26" cy="34" r="2.4" fill="#07c160"/><circle cx="34" cy="34" r="2.4" fill="#07c160"/><circle cx="42" cy="34" r="2.4" fill="#07c160"/>
      </svg>
    </div>
    <p class="boot-text">正在加载…</p>
  </div>
</div>
<noscript><div class="noscript">请启用 JavaScript 后使用 <?php echo sc_e($siteName); ?>。</div></noscript>
<script src="/assets/js/core.js"></script>
<script src="/assets/js/crypto.js"></script>
<script src="/assets/js/ui.js"></script>
<script src="/assets/js/store.js"></script>
<script src="/assets/js/pages/auth.js"></script>
<script src="/assets/js/pages/messages.js"></script>
<script src="/assets/js/pages/talk-settings.js"></script>
<script src="/assets/js/pages/contacts.js"></script>
<script src="/assets/js/pages/discover.js"></script>
<script src="/assets/js/pages/me.js"></script>
<script src="/assets/js/pages/kefu.js"></script>
<script src="/assets/js/app.js?v=<?php echo SC_VERSION; ?>"></script>
</body>
</html>
