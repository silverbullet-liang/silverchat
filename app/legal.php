<?php
declare(strict_types=1);

require_once __DIR__ . '/bootstrap.php';

function sc_legal_versions(): array
{
    static $v = null;
    if (is_array($v)) {
        return $v;
    }
    $path = SC_ROOT . '/config/legal_versions.php';
    $v = is_file($path) ? require $path : array(
        'privacy' => 'v1.0', 'terms' => 'v1.0', 'cross-border' => 'v1.0', 'updated_at' => '',
    );
    return $v;
}

function sc_legal_docs(): array
{
    return array(
        'privacy'      => array('title' => '隐私政策', 'file' => 'privacy.md'),
        'terms'        => array('title' => '用户协议', 'file' => 'terms.md'),
        'cross-border' => array('title' => '跨境数据传输协议', 'file' => 'cross-border.md'),
        'data-list'    => array('title' => '个人信息收集清单', 'file' => 'data-list.md'),
        'third-party'  => array('title' => '第三方共享清单', 'file' => 'third-party.md'),
    );
}

function sc_legal_markdown(string $doc): string
{
    $docs = sc_legal_docs();
    if (!isset($docs[$doc])) {
        return '';
    }
    $path = SC_ROOT . '/legal/' . $docs[$doc]['file'];
    return is_file($path) ? (string) file_get_contents($path) : '';
}

/**
 * 极简 Markdown → HTML（标题、段落、列表、表格、粗体、行内代码、链接）。
 * 先整体转义再加标记，避免任何 HTML 注入。
 */
function sc_md_html(string $md): string
{
    $lines = preg_split('/\r\n|\r|\n/', $md);
    $out = array();
    $inList = false;
    $inTable = false;
    $inCode = false;
    $para = array();

    $flushPara = function () use (&$para, &$out) {
        if (!$para) {
            return;
        }
        $out[] = '<p>' . sc_md_inline(implode(' ', $para)) . '</p>';
        $para = array();
    };

    foreach ($lines as $line) {
        $trim = trim($line);
        if (strpos($trim, '```') === 0) {
            $flushPara();
            if ($inList) { $out[] = '</ul>'; $inList = false; }
            if ($inTable) { $out[] = '</table>'; $inTable = false; }
            $out[] = $inCode ? '</code></pre>' : '<pre><code>';
            $inCode = !$inCode;
            continue;
        }
        if ($inCode) {
            $out[] = htmlspecialchars($line, ENT_QUOTES, 'UTF-8');
            continue;
        }
        if ($trim === '') {
            $flushPara();
            if ($inList) { $out[] = '</ul>'; $inList = false; }
            if ($inTable) { $out[] = '</table>'; $inTable = false; }
            continue;
        }
        if (preg_match('/^(#{1,6})\s+(.*)$/u', $trim, $m)) {
            $flushPara();
            if ($inList) { $out[] = '</ul>'; $inList = false; }
            if ($inTable) { $out[] = '</table>'; $inTable = false; }
            $level = min(6, strlen($m[1]) + 0);
            $out[] = '<h' . $level . '>' . sc_md_inline($m[2]) . '</h' . $level . '>';
            continue;
        }
        if (preg_match('/^[-*]\s+(.*)$/u', $trim, $m)) {
            $flushPara();
            if ($inTable) { $out[] = '</table>'; $inTable = false; }
            if (!$inList) { $out[] = '<ul>'; $inList = true; }
            $out[] = '<li>' . sc_md_inline($m[1]) . '</li>';
            continue;
        }
        if (preg_match('/^\|(.+)\|$/u', $trim, $m)) {
            $flushPara();
            if ($inList) { $out[] = '</ul>'; $inList = false; }
            $cells = array_map('trim', explode('|', trim($m[1], '|')));
            if (preg_match('/^[\s\-:|]+$/', $trim)) {
                continue; // 分隔行
            }
            if (!$inTable) {
                $out[] = '<table><thead><tr>';
                foreach ($cells as $c) {
                    $out[] = '<th>' . sc_md_inline($c) . '</th>';
                }
                $out[] = '</tr></thead><tbody>';
                $inTable = true;
            } else {
                $out[] = '<tr>';
                foreach ($cells as $c) {
                    $out[] = '<td>' . sc_md_inline($c) . '</td>';
                }
                $out[] = '</tr>';
            }
            continue;
        }
        $flushPara();
        if ($inList) { $out[] = '</ul>'; $inList = false; }
        if ($inTable) { $out[] = '</table>'; $inTable = false; }
        $para[] = $trim;
    }
    $flushPara();
    if ($inList) { $out[] = '</ul>'; }
    if ($inTable) { $out[] = '</table>'; }
    if ($inCode) { $out[] = '</code></pre>'; }
    return implode("\n", $out);
}

function sc_md_inline(string $text): string
{
    $t = htmlspecialchars($text, ENT_QUOTES, 'UTF-8');
    $t = preg_replace('/\*\*(.+?)\*\*/u', '<strong>$1</strong>', $t);
    $t = preg_replace('/`([^`]+)`/u', '<code>$1</code>', $t);
    $t = preg_replace('/\[([^\]]+)\]\(([^)]+)\)/u', '<a href="$2" rel="noopener noreferrer">$1</a>', $t);
    return $t;
}

/** GET /api/legal/versions —— 前端同意流程使用的版本清单 */
function api_legal_versions()
{
    $versions = sc_legal_versions();
    $docs = array();
    foreach (sc_legal_docs() as $key => $meta) {
        $docs[] = array(
            'type'    => $key,
            'title'   => $meta['title'],
            'version' => isset($versions[$key]) ? $versions[$key] : '',
        );
    }
    sc_json(array(
        'versions'   => array(
            'privacy'      => $versions['privacy'],
            'terms'        => $versions['terms'],
            'cross-border' => $versions['cross-border'],
        ),
        'docs'       => $docs,
        'updated_at' => isset($versions['updated_at']) ? $versions['updated_at'] : '',
    ));
}
