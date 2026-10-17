<?php
declare(strict_types=1);

require_once __DIR__ . '/helpers.php';

/** GET /api/emoji/packages —— 离线表情包（静态资源，不参与清理）。 */
function api_emoji_packages()
{
    sc_require_auth();
    $pkgs = db_all('SELECT id, name, source, package_key FROM emoji_packages ORDER BY id ASC');
    $out = array();
    foreach ($pkgs as $p) {
        $items = db_all(
            'SELECT name, url, is_gif FROM emojis WHERE package_id = ? ORDER BY sort_no ASC, id ASC',
            array((int) $p['id'])
        );
        $list = array();
        foreach ($items as $it) {
            $list[] = array(
                'name'   => (string) $it['name'],
                'url'    => (string) $it['url'],
                'is_gif' => (int) $it['is_gif'] === 1,
                'code'   => 'bili:' . $p['package_key'] . ':' . $it['name'],
            );
        }
        $out[] = array(
            'key'   => (string) $p['package_key'],
            'name'  => (string) $p['name'],
            'source' => (string) $p['source'],
            'items' => $list,
        );
    }
    sc_json(array('packages' => $out));
}
