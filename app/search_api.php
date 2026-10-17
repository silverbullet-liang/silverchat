<?php
declare(strict_types=1);

require_once __DIR__ . '/message_api.php';

/** GET /api/search?q= —— 会话/好友/群（昵称为密文，解密后内存匹配）。 */
function api_search()
{
    $u = sc_require_auth();
    $q = trim(sc_str($_GET['q'] ?? '', 40));
    if ($q === '') {
        sc_json(array('conversations' => array(), 'friends' => array(), 'groups' => array()));
    }
    $needle = mb_strtolower($q, 'UTF-8');
    $me = (int) $u['id'];

    $friends = array();
    $rows = db_all(
        'SELECT f.remark_enc, u.public_id, u.nickname_enc, u.avatar FROM friends f
         JOIN users u ON u.id = f.friend_id WHERE f.user_id = ? AND f.status = 1',
        array($me)
    );
    foreach ($rows as $r) {
        $nick = (string) field_decrypt($r['nickname_enc']);
        $remark = $r['remark_enc'] ? (string) field_decrypt($r['remark_enc']) : '';
        $hay = mb_strtolower($remark . ' ' . $nick . ' ' . $r['public_id'], 'UTF-8');
        if (mb_strpos($hay, $needle) !== false) {
            $friends[] = array(
                'public_id' => (string) $r['public_id'],
                'nickname'  => $nick,
                'remark'    => $remark !== '' ? $remark : null,
                'avatar'    => (string) $r['avatar'],
            );
        }
    }

    $groups = array();
    $grows = db_all(
        'SELECT g.* FROM group_members gm JOIN `groups` g ON g.id = gm.group_id WHERE gm.user_id = ?',
        array($me)
    );
    foreach ($grows as $g) {
        $name = (string) field_decrypt($g['name_enc']);
        if (mb_strpos(mb_strtolower($name . ' ' . $g['public_id'], 'UTF-8'), $needle) !== false) {
            $groups[] = array(
                'public_id' => (string) $g['public_id'],
                'name'      => $name,
                'avatar'    => (string) $g['avatar'],
                'conv_id'   => (int) db_val('SELECT id FROM conversations WHERE conv_key = ?', array('g' . (int) $g['id'])),
            );
        }
    }

    // 会话标题匹配
    $conversations = array();
    $convs = db_all(
        'SELECT uc.conv_id, uc.unread, c.type, c.conv_key FROM user_conversations uc
         JOIN conversations c ON c.id = uc.conv_id WHERE uc.user_id = ? AND uc.is_deleted = 0 LIMIT 100',
        array($me)
    );
    foreach ($convs as $c) {
        $title = '';
        if ((int) $c['type'] === 2) {
            $gid = 0;
            if (preg_match('/^g(\d+)$/', (string) $c['conv_key'], $m)) {
                $gid = (int) $m[1];
            }
            $title = $gid > 0 ? (string) field_decrypt(db_val('SELECT name_enc FROM `groups` WHERE id = ?', array($gid))) : '';
        } else {
            $peer = sc_single_peer((int) $c['conv_id'], $me);
            $title = $peer ? ($peer['remark'] !== null && $peer['remark'] !== '' ? $peer['remark'] : $peer['nickname']) : '';
        }
        if ($title !== '' && mb_strpos(mb_strtolower($title, 'UTF-8'), $needle) !== false) {
            $conversations[] = array(
                'conv_id' => (int) $c['conv_id'],
                'type'    => (int) $c['type'],
                'title'   => $title,
                'unread'  => (int) $c['unread'],
            );
        }
    }

    sc_json(array('conversations' => $conversations, 'friends' => $friends, 'groups' => $groups));
}
