<?php
declare(strict_types=1);

/**
 * 法律文档直出入口：/legal.php?doc=privacy|terms|cross-border|data-list|third-party
 * 不依赖 URL 重写，任何 Web 服务器都可直接访问。
 */

require_once __DIR__ . '/app/bootstrap.php';
require_once __DIR__ . '/app/legal_page.php';

sc_boot();
sc_security_headers(true);

$doc = isset($_GET['doc']) ? (string) $_GET['doc'] : '';
$html = sc_legal_page_html($doc);
if ($html === '') {
    http_response_code(404);
    header('Content-Type: text/html; charset=utf-8');
    echo '<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><title>404</title>'
        . '<link rel="stylesheet" href="/assets/css/app.css"></head><body class="page-doc">'
        . '<main class="doc-body"><h1>文档不存在</h1>'
        . '<p class="muted">请返回 <a href="/settings/legal">隐私与法律</a> 重新选择。</p></main></body></html>';
    exit;
}
header('Content-Type: text/html; charset=utf-8');
echo $html;
