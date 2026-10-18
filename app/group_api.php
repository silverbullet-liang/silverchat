<?php
declare(strict_types=1);

require_once __DIR__ . '/message_api.php';

function sc_group_view(array $g, int $viewerId): array
{
    $gid = (int) $g['id'];
    $memberCount = (int) db_val('SELECT COUNT(*) FROM group_members WHERE group_id = ?', array($gid));
    $isMember = (bool) db_val('SELECT 1 FROM group_members WHERE group_id = ? AND user_id = ?', array($gid, $viewerId));
    $owner = sc_user_by_id((int) $g['owner_id']);
    return array(
        'public_id'    => (string) $g['public_id'],
        'name'         => (string) field_decrypt($g['name_enc']),
        'avatar'       => (string) $g['avatar'],
        'join_mode'    => (int) $g['join_mode'],
        'notice'       => (string) field_decrypt($g['notice_enc']),
        'owner'        => $owner ? array('public_id' => $owner['public_id'], 'nickname' => $owner['nickname']) : null,
        'member_count' => $memberCount,
        'is_member'    => $isMember,
        'created_at'   => (int) $g['created_at'],
    );
}

function sc_group_by_public_id(string $pid)
{
    if ($pid === '') {
        return null;
    }
    return db_one('SELECT * FROM `groups` WHERE public_id = ? LIMIT 1', array($pid));
}

/** POST /api/group/create */
function api_group_create()
{
    $u = sc_require_auth();
    $name = trim(sc_str(sc_in('name'), 40));
    $memberPids = sc_in('member_public_ids', array());
    if (!is_array($memberPids)) {
        $memberPids = array();
    }
    if (mb_strlen($name, 'UTF-8') > 20) {
        sc_fail(1001, '群名称最多 20 个字符');
    }
    $memberPids = array_slice(array_values(array_unique($memberPids)), 0, 49);

    $memberIds = array((int) $u['id']);
    foreach ($memberPids as $pid) {
        $target = sc_user_by_public_id(sc_str($pid, 24));
        if ($target && (int) $target['id'] !== (int) $u['id']) {
            if (!sc_is_friend((int) $u['id'], (int) $target['id'])) {
                sc_fail(1001, '只能邀请好友加入群聊');
            }
            $memberIds[] = (int) $target['id'];
        }
    }
    $memberIds = array_values(array_unique($memberIds));
    if (count($memberIds) > 50) {
        sc_fail(1402);
    }
    if ($name === '') {
        $name = $u['nickname'] . '的群聊';
    }

    // 群密钥封装：客户端为每位成员各生成一份，服务器只存密文
    $rawWraps = sc_in('group_key_wraps', array());
    $wraps = array();
    if (is_array($rawWraps)) {
        foreach ($rawWraps as $w) {
            if (!is_array($w)) {
                continue;
            }
            $target = sc_user_by_public_id(sc_str($w['user_public_id'] ?? '', 24));
            $wrapped = sc_str($w['wrapped'] ?? '', 4096);
            if ($target && $wrapped !== '' && in_array((int) $target['id'], $memberIds, true)) {
                $wraps[(int) $target['id']] = $wrapped;
            }
        }
    }

    $groupId = db_tx(function () use ($u, $name, $memberIds, $wraps) {
        $gid = db_insert(
            'INSERT INTO `groups` (public_id, name_enc, avatar, join_mode, owner_id, notice_enc, created_at)
             VALUES (?,?,"",1,?,NULL,?)',
            array('tmp_' . bin2hex(random_bytes(4)), field_encrypt($name), (int) $u['id'], time())
        );
        db_exec('UPDATE `groups` SET public_id = ? WHERE id = ?', array(group_public_id_new(), $gid));
        foreach ($memberIds as $mid) {
            $role = $mid === (int) $u['id'] ? 2 : 0;
            db_exec('INSERT IGNORE INTO group_members (group_id, user_id, role, joined_at) VALUES (?,?,?,?)',
                array($gid, $mid, $role, time()));
        }
        $convId = db_insert(
            'INSERT INTO conversations (type, conv_key, last_msg_at) VALUES (2,?,0) ON DUPLICATE KEY UPDATE id = LAST_INSERT_ID(id)',
            array('g' . $gid)
        );
        foreach ($memberIds as $mid) {
            db_exec('INSERT IGNORE INTO user_conversations (user_id, conv_id, updated_at) VALUES (?,?,?)',
                array($mid, $convId, time()));
        }
        foreach ($wraps as $mid => $wrapped) {
            db_exec(
                'INSERT INTO group_keys (group_id, user_id, wrapped, created_at) VALUES (?,?,?,?)
                 ON DUPLICATE KEY UPDATE wrapped = VALUES(wrapped)',
                array($gid, (int) $mid, $wrapped, time())
            );
        }
        sc_system_message($convId, 0, $u['nickname'] . '创建了群聊');
        return $gid;
    });

    $g = db_one('SELECT * FROM `groups` WHERE id = ?', array($groupId));
    sc_json(array('group' => sc_group_view($g, (int) $u['id'])));
}

/** GET /api/group/search?q=gp_xxx */
function api_group_search()
{
    $u = sc_require_auth();
    $q = trim(sc_str($_GET['q'] ?? '', 24));
    $g = sc_group_by_public_id($q);
    if (!$g) {
        sc_fail(1401);
    }
    sc_json(array('group' => sc_group_view($g, (int) $u['id'])));
}

/** POST /api/group/join */
function api_group_join()
{
    $u = sc_require_auth();
    $g = sc_group_by_public_id(trim(sc_str(sc_in('public_id'), 24)));
    if (!$g) {
        sc_fail(1401);
    }
    $gid = (int) $g['id'];
    if (db_val('SELECT 1 FROM group_members WHERE group_id = ? AND user_id = ?', array($gid, (int) $u['id']))) {
        sc_fail(1405);
    }
    if ((int) $g['join_mode'] !== 1) {
        sc_fail(1404);
    }

    try {
        db_tx(function () use ($gid, $u) {
            // 事务内加锁计数，避免并发加入突破上限
            $count = (int) db_val('SELECT COUNT(*) FROM group_members WHERE group_id = ? FOR UPDATE', array($gid));
            if ($count >= 50) {
                throw new RuntimeException('group_full');
            }
            $n = db_exec('INSERT IGNORE INTO group_members (group_id, user_id, role, joined_at) VALUES (?,?,0,?)',
                array($gid, (int) $u['id'], time()));
            if ($n === 0) {
                throw new RuntimeException('already_member');
            }
            $convId = (int) db_val('SELECT id FROM conversations WHERE conv_key = ?', array('g' . $gid));
            if ($convId > 0) {
                db_exec('INSERT IGNORE INTO user_conversations (user_id, conv_id, updated_at) VALUES (?,?,?)',
                    array((int) $u['id'], $convId, time()));
                if ($count >= 1) {
                    sc_system_message($convId, 0, $u['nickname'] . '加入了群聊');
                }
            }
        });
    } catch (RuntimeException $e) {
        sc_fail($e->getMessage() === 'group_full' ? 1402 : 1405);
    }

    $convId = (int) db_val('SELECT id FROM conversations WHERE conv_key = ?', array('g' . $gid));
    sc_json(array('ok' => true, 'conv_id' => $convId, 'group' => sc_group_view($g, (int) $u['id'])));
}

/** GET /api/group/list */
function api_group_list()
{
    $u = sc_require_auth();
    $rows = db_all(
        'SELECT g.* FROM group_members gm JOIN `groups` g ON g.id = gm.group_id
         WHERE gm.user_id = ? ORDER BY g.created_at DESC',
        array((int) $u['id'])
    );
    $out = array();
    foreach ($rows as $g) {
        $view = sc_group_view($g, (int) $u['id']);
        $view['conv_id'] = (int) db_val('SELECT id FROM conversations WHERE conv_key = ?', array('g' . (int) $g['id']));
        $out[] = $view;
    }
    sc_json(array('groups' => $out));
}

/** POST /api/group/invite */
function api_group_invite()
{
    $u = sc_require_auth();
    $g = sc_group_by_public_id(trim(sc_str(sc_in('public_id'), 24)));
    if (!$g) {
        sc_fail(1401);
    }
    $gid = (int) $g['id'];
    if (!db_val('SELECT 1 FROM group_members WHERE group_id = ? AND user_id = ?', array($gid, (int) $u['id']))) {
        sc_fail(1401, '你不在该群中');
    }
    $pids = sc_in('user_public_ids', array());
    if (!is_array($pids) || !$pids) {
        sc_fail(1001);
    }
    $convId = (int) db_val('SELECT id FROM conversations WHERE conv_key = ?', array('g' . $gid));
    $count = (int) db_val('SELECT COUNT(*) FROM group_members WHERE group_id = ?', array($gid));
    $added = 0;
    foreach ($pids as $pid) {
        $target = sc_user_by_public_id(sc_str($pid, 24));
        if (!$target) {
            continue;
        }
        if ($count + $added >= 50) {
            sc_fail(1402);
        }
        if (!sc_is_friend((int) $u['id'], (int) $target['id'])) {
            continue;
        }
        $n = db_exec('INSERT IGNORE INTO group_members (group_id, user_id, role, joined_at) VALUES (?,?,0,?)',
            array($gid, (int) $target['id'], time()));
        if ($n > 0) {
            $added++;
            db_exec('INSERT IGNORE INTO user_conversations (user_id, conv_id, updated_at) VALUES (?,?,?)',
                array((int) $target['id'], $convId, time()));
            sc_system_message($convId, 0, $target['nickname'] . '加入了群聊');
        }
    }
    sc_json(array('ok' => true, 'added' => $added));
}

/** POST /api/group/kick */
function api_group_kick()
{
    $u = sc_require_auth();
    $g = sc_group_by_public_id(trim(sc_str(sc_in('public_id'), 24)));
    if (!$g) {
        sc_fail(1401);
    }
    if ((int) $g['owner_id'] !== (int) $u['id']) {
        sc_fail(1403);
    }
    $gid = (int) $g['id'];
    $target = sc_user_by_public_id(trim(sc_str(sc_in('user_public_id'), 24)));
    if (!$target || (int) $target['id'] === (int) $u['id']) {
        sc_fail(1001);
    }
    $convId = (int) db_val('SELECT id FROM conversations WHERE conv_key = ?', array('g' . $gid));
    db_exec('DELETE FROM group_members WHERE group_id = ? AND user_id = ?', array($gid, (int) $target['id']));
    db_exec('UPDATE user_conversations SET is_deleted = 1 WHERE user_id = ? AND conv_id = ?', array((int) $target['id'], $convId));
    sc_system_message($convId, 0, $target['nickname'] . '被移出群聊');
    sc_json(array('ok' => true));
}

/** POST /api/group/quit */
function api_group_quit()
{
    $u = sc_require_auth();
    $g = sc_group_by_public_id(trim(sc_str(sc_in('public_id'), 24)));
    if (!$g) {
        sc_fail(1401);
    }
    $gid = (int) $g['id'];
    $mine = db_one('SELECT * FROM group_members WHERE group_id = ? AND user_id = ?', array($gid, (int) $u['id']));
    if (!$mine) {
        sc_fail(1401, '你不在该群中');
    }
    $convId = (int) db_val('SELECT id FROM conversations WHERE conv_key = ?', array('g' . $gid));

    db_tx(function () use ($gid, $u, $mine, $convId, $g) {
        db_exec('DELETE FROM group_members WHERE group_id = ? AND user_id = ?', array($gid, (int) $u['id']));
        db_exec('UPDATE user_conversations SET is_deleted = 1 WHERE user_id = ? AND conv_id = ?', array((int) $u['id'], $convId));
        $rest = db_val('SELECT COUNT(*) FROM group_members WHERE group_id = ?', array($gid));
        if ((int) $rest === 0) {
            db_exec('DELETE FROM `groups` WHERE id = ?', array($gid));
            db_exec('DELETE FROM user_conversations WHERE conv_id = ?', array($convId));
            db_exec('DELETE FROM messages WHERE conv_id = ?', array($convId));
            db_exec('DELETE FROM conversations WHERE id = ?', array($convId));
            return;
        }
        if ((int) $mine['role'] === 2) {
            $next = db_one('SELECT user_id FROM group_members WHERE group_id = ? ORDER BY joined_at ASC, user_id ASC LIMIT 1', array($gid));
            if ($next) {
                db_exec('UPDATE group_members SET role = 2 WHERE group_id = ? AND user_id = ?', array($gid, (int) $next['user_id']));
                db_exec('UPDATE `groups` SET owner_id = ? WHERE id = ?', array((int) $next['user_id'], $gid));
            }
        }
        sc_system_message($convId, 0, $u['nickname'] . '退出了群聊');
    });
    sc_json(array('ok' => true));
}

/** POST /api/group/update */
function api_group_update()
{
    $u = sc_require_auth();
    $g = sc_group_by_public_id(trim(sc_str(sc_in('public_id'), 24)));
    if (!$g) {
        sc_fail(1401);
    }
    $gid = (int) $g['id'];
    $member = db_one('SELECT * FROM group_members WHERE group_id = ? AND user_id = ?', array($gid, (int) $u['id']));
    if (!$member) {
        sc_fail(1401, '你不在该群中');
    }
    $isOwner = (int) $g['owner_id'] === (int) $u['id'];

    if (sc_in('name') !== null) {
        if (!$isOwner) {
            sc_fail(1403);
        }
        $name = trim(sc_str(sc_in('name'), 40));
        if ($name === '' || mb_strlen($name, 'UTF-8') > 20) {
            sc_fail(1001, '群名称需为 1–20 个字符');
        }
        db_exec('UPDATE `groups` SET name_enc = ? WHERE id = ?', array(field_encrypt($name), $gid));
    }
    if (sc_in('notice') !== null) {
        if (!$isOwner && (int) $member['role'] !== 1) {
            sc_fail(1403);
        }
        $notice = trim(sc_str(sc_in('notice'), 1000));
        if (mb_strlen($notice, 'UTF-8') > 500) {
            sc_fail(1001, '群公告最多 500 个字符');
        }
        db_exec('UPDATE `groups` SET notice_enc = ? WHERE id = ?', array($notice === '' ? null : field_encrypt($notice), $gid));
    }
    if (sc_in('join_mode') !== null) {
        if (!$isOwner) {
            sc_fail(1403);
        }
        $mode = sc_int(sc_in('join_mode'), 1);
        if (!in_array($mode, array(1, 2), true)) {
            sc_fail(1001);
        }
        db_exec('UPDATE `groups` SET join_mode = ? WHERE id = ?', array($mode, $gid));
    }
    if (sc_in('my_nickname') !== null) {
        $nick = trim(sc_str(sc_in('my_nickname'), 32));
        if (mb_strlen($nick, 'UTF-8') > 16) {
            sc_fail(1001, '群昵称最多 16 个字符');
        }
        db_exec('UPDATE group_members SET group_nickname_enc = ? WHERE group_id = ? AND user_id = ?',
            array($nick === '' ? null : field_encrypt($nick), $gid, (int) $u['id']));
    }

    $g = db_one('SELECT * FROM `groups` WHERE id = ?', array($gid));
    sc_json(array('group' => sc_group_view($g, (int) $u['id'])));
}

/** GET /api/group/members?public_id= */
function api_group_members()
{
    $u = sc_require_auth();
    $g = sc_group_by_public_id(trim(sc_str($_GET['public_id'] ?? '', 24)));
    if (!$g) {
        sc_fail(1401);
    }
    $gid = (int) $g['id'];
    $isMember = (bool) db_val(
        'SELECT 1 FROM group_members WHERE group_id = ? AND user_id = ?',
        array($gid, (int) $u['id'])
    );
    if (!$isMember) {
        // 非成员只返回人数，成员名单仅群内可见
        sc_json(array(
            'members' => array(),
            'is_member' => false,
            'member_count' => (int) db_val('SELECT COUNT(*) FROM group_members WHERE group_id = ?', array($gid)),
        ));
    }
    $rows = db_all(
        'SELECT gm.role, gm.group_nickname_enc, gm.joined_at, u.public_id, u.nickname_enc, u.avatar
         FROM group_members gm JOIN users u ON u.id = gm.user_id
         WHERE gm.group_id = ? ORDER BY gm.role DESC, gm.joined_at ASC',
        array($gid)
    );
    $out = array();
    foreach ($rows as $r) {
        $out[] = array(
            'public_id'   => (string) $r['public_id'],
            'nickname'    => (string) field_decrypt($r['nickname_enc']),
            'group_nickname' => $r['group_nickname_enc'] ? (string) field_decrypt($r['group_nickname_enc']) : null,
            'avatar'      => (string) $r['avatar'],
            'role'        => (int) $r['role'],
            'joined_at'   => (int) $r['joined_at'],
        );
    }
    sc_json(array('members' => $out, 'is_member' => true));
}

/** GET /api/group/key?public_id=gp_xxx —— 取自己那份被封装的群密钥 */
function api_group_key_get()
{
    $u = sc_require_auth();
    $g = sc_group_by_public_id(trim(sc_str($_GET['public_id'] ?? '', 24)));
    if (!$g) {
        sc_fail(1401);
    }
    $wrapped = db_val(
        'SELECT wrapped FROM group_keys WHERE group_id = ? AND user_id = ? LIMIT 1',
        array((int) $g['id'], (int) $u['id'])
    );
    sc_json(array('wrapped' => $wrapped !== null ? (string) $wrapped : ''));
}

/**
 * POST /api/group/key —— 上传某成员的群密钥封装。
 * 仅群成员可操作；目标必须也在群内。已有封装且非本人时拒绝覆盖。
 */
function api_group_key_put()
{
    $u = sc_require_auth();
    $g = sc_group_by_public_id(trim(sc_str(sc_in('public_id'), 24)));
    if (!$g) {
        sc_fail(1401);
    }
    $gid = (int) $g['id'];
    if (!db_val('SELECT 1 FROM group_members WHERE group_id = ? AND user_id = ?', array($gid, (int) $u['id']))) {
        sc_fail(1401, '你不在该群中');
    }
    $target = sc_user_by_public_id(trim(sc_str(sc_in('user_public_id'), 24)));
    $wrapped = trim(sc_str(sc_in('wrapped'), 4096));
    if (!$target || $wrapped === '') {
        sc_fail(1001);
    }
    if (!db_val('SELECT 1 FROM group_members WHERE group_id = ? AND user_id = ?', array($gid, (int) $target['id']))) {
        sc_fail(1001, '目标不是群成员');
    }
    $exists = db_val('SELECT wrapped FROM group_keys WHERE group_id = ? AND user_id = ?', array($gid, (int) $target['id']));
    if ($exists !== null && (int) $target['id'] !== (int) $u['id']) {
        sc_fail(1001, '该成员已有群密钥');
    }
    db_exec(
        'INSERT INTO group_keys (group_id, user_id, wrapped, created_at) VALUES (?,?,?,?)
         ON DUPLICATE KEY UPDATE wrapped = VALUES(wrapped)',
        array($gid, (int) $target['id'], $wrapped, time())
    );
    sc_json(array('ok' => true));
}
