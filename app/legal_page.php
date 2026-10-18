<?php
declare(strict_types=1);

require_once __DIR__ . '/legal.php';

function sc_e(string $s): string
{
    return htmlspecialchars($s, ENT_QUOTES, 'UTF-8');
}

/** 渲染法律文档整页 HTML（供 index.php 与服务端直出入口共用）。 */
function sc_legal_page_html(string $doc): string
{
    $docs = sc_legal_docs();
    if (!isset($docs[$doc])) {
        return '';
    }
    $meta = $docs[$doc];
    $versions = sc_legal_versions();
    $version = isset($versions[$doc]) ? $versions[$doc] : '';
    $html = sc_md_html(sc_legal_markdown($doc));
    $siteName = (string) sc_cfg('site.name', 'SilverChat');

    ob_start();
    ?>
<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="robots" content="noindex, nofollow">
<title><?php echo sc_e($meta['title']); ?> · <?php echo sc_e($siteName); ?></title>
<link rel="stylesheet" href="/assets/css/app.css?v=<?php echo SC_VERSION; ?>">
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
    return (string) ob_get_clean();
}
