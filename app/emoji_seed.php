<?php
declare(strict_types=1);

require_once __DIR__ . '/db.php';

/**
 * 导入内置表情包（B 站「小黄脸」，离线存储）。
 * 优先读取 assets/emoji/builtin/manifest.json；无清单时扫描图片文件。
 * 幂等：重复执行只补齐缺失项并刷新地址。
 */
function sc_seed_builtin_emoji(): int
{
    $dir = SC_ROOT . '/assets/emoji/builtin';
    if (!is_dir($dir)) {
        return 0;
    }
    $manifestPath = $dir . '/manifest.json';
    $items = array();
    $packageName = '小黄脸';
    $packageKey = 'xiaohuanglian';
    $source = 'bilibili';

    if (is_file($manifestPath)) {
        $manifest = json_decode((string) file_get_contents($manifestPath), true);
        if (is_array($manifest) && isset($manifest['items']) && is_array($manifest['items'])) {
            $packageName = isset($manifest['package']) ? (string) $manifest['package'] : $packageName;
            $source = isset($manifest['source']) ? (string) $manifest['source'] : $source;
            foreach ($manifest['items'] as $it) {
                if (!is_array($it) || empty($it['file'])) {
                    continue;
                }
                $file = basename((string) $it['file']);
                if (!is_file($dir . '/' . $file)) {
                    continue;
                }
                $items[] = array(
                    'name'   => isset($it['name']) ? (string) $it['name'] : pathinfo($file, PATHINFO_FILENAME),
                    'file'   => $file,
                    'is_gif' => !empty($it['is_gif']) ? 1 : 0,
                );
            }
        }
    }
    if (!$items) {
        $files = glob($dir . '/*.{png,gif,webp,svg}', GLOB_BRACE);
        if (!$files) {
            return 0;
        }
        sort($files);
        foreach ($files as $f) {
            $items[] = array(
                'name'   => pathinfo($f, PATHINFO_FILENAME),
                'file'   => basename($f),
                'is_gif' => strtolower(pathinfo($f, PATHINFO_EXTENSION)) === 'gif' ? 1 : 0,
            );
        }
    }

    $pkgId = db_val(
        "SELECT id FROM emoji_packages WHERE source = ? AND package_key = ? LIMIT 1",
        array($source, $packageKey)
    );
    if (!$pkgId) {
        $pkgId = db_insert(
            'INSERT INTO emoji_packages (name, source, package_key) VALUES (?,?,?)',
            array($packageName, $source, $packageKey)
        );
    }
    $pkgId = (int) $pkgId;

    $sort = 0;
    $added = 0;
    foreach ($items as $it) {
        $url = '/assets/emoji/builtin/' . $it['file'];
        $exists = db_val('SELECT id FROM emojis WHERE package_id = ? AND name = ? LIMIT 1', array($pkgId, $it['name']));
        if ($exists) {
            db_exec('UPDATE emojis SET url = ?, is_gif = ?, sort_no = ? WHERE id = ?',
                array($url, (int) $it['is_gif'], $sort, (int) $exists));
        } else {
            db_insert(
                'INSERT INTO emojis (package_id, name, url, is_gif, sort_no) VALUES (?,?,?,?,?)',
                array($pkgId, $it['name'], $url, (int) $it['is_gif'], $sort)
            );
            $added++;
        }
        $sort++;
    }
    return $added;
}
