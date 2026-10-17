<?php
declare(strict_types=1);

require_once __DIR__ . '/app/bootstrap.php';
require_once __DIR__ . '/app/legal.php';

sc_boot();
sc_security_headers(true);

$siteName = (string) sc_cfg('site.name', 'SilverChat');
$path = parse_url($_SERVER['REQUEST_URI'] ?? '/', PHP_URL_PATH);
$path = '/' . trim((string) $path, '/');

$docs = sc_legal_docs();
$legalDoc = null;
if (preg_match('#^/legal/([a-z\-]+)$#', $path, $m) && isset($docs[$m[1]])) {
    $legalDoc = $m[1];
}

function sc_e(string $s): string
{
    return htmlspecialchars($s, ENT_QUOTES, 'UTF-8');
}

if ($legalDoc !== null) {
    $meta = $docs[$legalDoc];
    $versions = sc_legal_versions();
    $version = isset($versions[$legalDoc]) ? $versions[$legalDoc] : '';
    $html = sc_md_html(sc_legal_markdown($legalDoc));
    ?>
<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="robots" content="noindex, nofollow">
<title><?php echo sc_e($meta['title']); ?> · <?php echo sc_e($siteName); ?></title>
<link rel="stylesheet" href="/assets/css/app.css">
<link rel="icon" type="image/svg+xml" href="/assets/img/logo.svg">
</head>
<body class="page-doc">
<header class="navbar">
  <a class="navbar-left" href="/settings/legal" aria-label="返回">
    <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><path d="M15 4 7 12l8 8" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>
  </a>
  <h1 class="navbar-title"><?php echo sc_e($meta['title']); ?></h1>
  <span class="navbar-right"></span>
</header>
<main class="doc-body">
  <div class="doc-meta">
    <span class="badge badge-soft"><?php echo sc_e($version); ?></span>
    <span class="muted">更新于 <?php echo sc_e((string) ($versions['updated_at'] ?? '')); ?></span>
  </div>
  <article class="doc-content">
    <?php echo $html; ?>
  </article>
  <div class="doc-foot">
    <a class="btn btn-secondary btn-block" href="/settings/legal">返回隐私与法律</a>
  </div>
</main>
</body>
</html>
    <?php
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
<link rel="stylesheet" href="/assets/css/app.css">
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
<script src="/assets/js/pages/chat.js"></script>
<script src="/assets/js/pages/chat-settings.js"></script>
<script src="/assets/js/pages/contacts.js"></script>
<script src="/assets/js/pages/discover.js"></script>
<script src="/assets/js/pages/me.js"></script>
<script src="/assets/js/pages/kefu.js"></script>
<script src="/assets/js/app.js"></script>
</body>
</html>
