<?php
declare(strict_types=1);

require_once __DIR__ . '/helpers.php';
require_once __DIR__ . '/media_api.php';

/** 动态可见性：1 公开（好友可见）/2 仅好友/3 仅自己/4 指定可见。 */
function sc_moment_visible(array $post, int $viewerId): bool
{
    $authorId = (int) $post['author_id'];
    if ($authorId === $viewerId) {
        return true;
    }
    if ((int) $post['status'] !== 1) {
        return false;
    }
    if (!sc_is_friend($authorId, $viewerId)) {
        return false;
    }
    $visibility = (int) $post['visibility'];
    if ($visibility === 3) {
        return false;
    }
    if ($visibility === 4) {
        return (bool) db_val(
            'SELECT 1 FROM moment_visibility WHERE post_id = ? AND user_id = ?',
            array((int) $post['id'], $viewerId)
        );
    }
    return true;
}

function sc_moment_payload(array $post, int $viewerId, bool $withAllComments = false): array
{
    $pid = (int) $post['id'];
    $authorId = (int) $post['author_id'];
    $author = sc_user_by_id($authorId);
    $remark = null;
    if ($author && sc_is_friend($viewerId, $authorId)) {
        $r = db_val('SELECT remark_enc FROM friends WHERE user_id = ? AND friend_id = ?', array($viewerId, $authorId));
        $remark = $r ? field_decrypt($r) : null;
    }

    $mediaRows = db_all(
        'SELECT media_url, media_type, sort_no FROM moment_media WHERE post_id = ? ORDER BY sort_no ASC',
        array($pid)
    );
    $media = array();
    foreach ($mediaRows as $m) {
        $media[] = array(
            'media_id' => (int) $m['media_url'],
            'type'     => (int) $m['media_type'],
            'url'      => sc_media_url((int) $m['media_url'], true),
        );
    }

    $likes = db_all(
        'SELECT ml.user_id, u.public_id, u.nickname_enc, u.avatar FROM moment_likes ml
         JOIN users u ON u.id = ml.user_id WHERE ml.post_id = ? ORDER BY ml.created_at ASC LIMIT 100',
        array($pid)
    );
    $likeUsers = array();
    $liked = false;
    foreach ($likes as $l) {
        if ((int) $l['user_id'] === $viewerId) {
            $liked = true;
        }
        $likeUsers[] = array(
            'public_id' => (string) $l['public_id'],
            'nickname'  => (string) field_decrypt($l['nickname_enc']),
        );
    }

    $limit = $withAllComments ? 200 : 3;
    $comments = db_all(
        'SELECT mc.id, mc.user_id, mc.content_enc, mc.reply_to, mc.created_at,
                u.public_id, u.nickname_enc, ru.public_id AS reply_public_id, ru.nickname_enc AS reply_nickname_enc
         FROM moment_comments mc
         JOIN users u ON u.id = mc.user_id
         LEFT JOIN moment_comments rc ON rc.id = mc.reply_to
         LEFT JOIN users ru ON ru.id = rc.user_id
         WHERE mc.post_id = ? AND mc.status = 1 ORDER BY mc.created_at ASC LIMIT ' . $limit,
        array($pid)
    );
    $commentOut = array();
    foreach ($comments as $c) {
        $commentOut[] = array(
            'id'         => (int) $c['id'],
            'public_id'  => (string) $c['public_id'],
            'nickname'   => (string) field_decrypt($c['nickname_enc']),
            'content'    => (string) field_decrypt($c['content_enc']),
            'reply_to'   => $c['reply_to'] !== null ? (int) $c['reply_to'] : null,
            'reply_to_nickname' => $c['reply_nickname_enc'] ? (string) field_decrypt($c['reply_nickname_enc']) : null,
            'created_at' => (int) $c['created_at'],
        );
    }

    return array(
        'id'            => $pid,
        'author'        => array(
            'public_id' => $author ? $author['public_id'] : '',
            'nickname'  => $author ? $author['nickname'] : '',
            'avatar'    => $author ? $author['avatar'] : '',
            'remark'    => $remark,
        ),
        'text'          => (string) field_decrypt($post['text_content_enc']),
        'visibility'    => (int) $post['visibility'],
        'media'         => $media,
        'like_count'    => (int) $post['like_count'],
        'comment_count' => (int) $post['comment_count'],
        'liked'         => $liked,
        'like_users'    => $likeUsers,
        'comments'      => $commentOut,
        'created_at'    => (int) $post['created_at'],
        'is_mine'       => $authorId === $viewerId,
    );
}

/** POST /api/moment/post */
function api_moment_post()
{
    $u = sc_require_auth();
    sc_rate('moment:' . (int) $u['id'], 10, 3600, 1004);

    $text = trim(sc_str(sc_in('text'), 2000));
    $media = sc_in('media', array());
    $visibility = sc_int(sc_in('visibility'), 1);
    $visibleIds = sc_in('visible_user_ids', array());

    if (!is_array($media)) {
        $media = array();
    }
    if (!is_array($visibleIds)) {
        $visibleIds = array();
    }
    if (mb_strlen($text, 'UTF-8') > 1000) {
        sc_fail(1602, '文字最多 1000 个字符');
    }
    if (count($media) > 9) {
        sc_fail(1602, '最多 9 张图片');
    }
    if ($text === '' && !$media) {
        sc_fail(1001, '请输入内容');
    }
    if (!in_array($visibility, array(1, 2, 3, 4), true)) {
        sc_fail(1001);
    }
    if ($visibility === 4) {
        $visibleIds = array_slice(array_values(array_unique($visibleIds)), 0, 200);
        if (!$visibleIds) {
            sc_fail(1001, '请选择可见范围');
        }
    }
    $hasVideo = false;
    $hasImage = false;
    foreach ($media as $m) {
        $t = is_array($m) ? sc_int($m['type'] ?? 1, 1) : 1;
        if ($t === 2) {
            $hasVideo = true;
        } else {
            $hasImage = true;
        }
    }
    if ($hasVideo && ($hasImage || count($media) > 1)) {
        sc_fail(1001, '视频与图片不能同时发布');
    }

    $postId = db_tx(function () use ($u, $text, $media, $visibility, $visibleIds) {
        $pid = db_insert(
            'INSERT INTO moment_posts (author_id, text_content_enc, visibility, like_count, comment_count, status, created_at)
             VALUES (?,?,?,0,0,1,?)',
            array((int) $u['id'], $text === '' ? null : field_encrypt($text), $visibility, time())
        );
        $sort = 0;
        foreach ($media as $m) {
            $mid = is_array($m) ? sc_int($m['media_id'] ?? 0, 0) : 0;
            $type = is_array($m) ? sc_int($m['type'] ?? 1, 1) : 1;
            if ($mid <= 0) {
                continue;
            }
            $row = db_one('SELECT * FROM media_files WHERE id = ? AND uploader_id = ? AND deleted = 0 LIMIT 1', array($mid, (int) $u['id']));
            if (!$row) {
                continue;
            }
            db_insert(
                'INSERT INTO moment_media (post_id, media_url, media_type, sort_no, expired_at) VALUES (?,?,?,?,?)',
                array($pid, (string) $mid, $type === 2 ? 2 : 1, $sort++, time() + (int) sc_cfg('media.ttl', 604800))
            );
        }
        if ($visibility === 4) {
            foreach ($visibleIds as $pidStr) {
                $target = sc_user_by_public_id(sc_str($pidStr, 24));
                if ($target) {
                    db_exec('INSERT IGNORE INTO moment_visibility (post_id, user_id) VALUES (?,?)', array($pid, (int) $target['id']));
                }
            }
        }
        return $pid;
    });

    $post = db_one('SELECT * FROM moment_posts WHERE id = ?', array($postId));
    sc_json(array('moment' => sc_moment_payload($post, (int) $u['id'])));
}

/** GET /api/moment/feed?offset=&limit= */
function api_moment_feed()
{
    $u = sc_require_auth();
    $offset = max(0, sc_int($_GET['offset'] ?? 0, 0));
    $limit = max(1, min(30, sc_int($_GET['limit'] ?? 20, 20)));
    $me = (int) $u['id'];

    $rows = db_all(
        'SELECT p.* FROM moment_posts p
         WHERE (p.author_id = ? OR p.author_id IN (SELECT friend_id FROM friends WHERE user_id = ? AND status = 1))
           AND p.status = 1
           AND (p.author_id = ? OR p.visibility IN (1,2)
                OR (p.visibility = 4 AND EXISTS (SELECT 1 FROM moment_visibility mv WHERE mv.post_id = p.id AND mv.user_id = ?)))
         ORDER BY p.created_at DESC, p.id DESC LIMIT ' . $limit . ' OFFSET ' . $offset,
        array($me, $me, $me, $me)
    );
    $out = array();
    foreach ($rows as $r) {
        $out[] = sc_moment_payload($r, $me);
    }
    sc_json(array('moments' => $out, 'has_more' => count($rows) === $limit));
}

/** GET /api/moment/detail?id= */
function api_moment_detail()
{
    $u = sc_require_auth();
    $id = sc_int($_GET['id'] ?? 0, 0);
    $post = db_one('SELECT * FROM moment_posts WHERE id = ? LIMIT 1', array($id));
    if (!$post || !sc_moment_visible($post, (int) $u['id'])) {
        sc_fail(1601);
    }
    sc_json(array('moment' => sc_moment_payload($post, (int) $u['id'], true)));
}

/** POST /api/moment/like {id, on} */
function api_moment_like()
{
    $u = sc_require_auth();
    $id = sc_int(sc_in('id'), 0);
    $on = sc_int(sc_in('on'), 1) === 1;
    $post = db_one('SELECT * FROM moment_posts WHERE id = ? LIMIT 1', array($id));
    if (!$post || !sc_moment_visible($post, (int) $u['id'])) {
        sc_fail(1601);
    }
    if ($on) {
        $n = db_exec('INSERT IGNORE INTO moment_likes (post_id, user_id, created_at) VALUES (?,?,?)',
            array($id, (int) $u['id'], time()));
        if ($n > 0) {
            db_exec('UPDATE moment_posts SET like_count = like_count + 1 WHERE id = ?', array($id));
        }
    } else {
        $n = db_exec('DELETE FROM moment_likes WHERE post_id = ? AND user_id = ?', array($id, (int) $u['id']));
        if ($n > 0) {
            db_exec('UPDATE moment_posts SET like_count = GREATEST(like_count - 1, 0) WHERE id = ?', array($id));
        }
    }
    $count = (int) db_val('SELECT like_count FROM moment_posts WHERE id = ?', array($id));
    sc_json(array('ok' => true, 'liked' => $on, 'like_count' => $count));
}

/** POST /api/moment/comment {id, content, reply_to} */
function api_moment_comment()
{
    $u = sc_require_auth();
    $id = sc_int(sc_in('id'), 0);
    $content = trim(sc_str(sc_in('content'), 500));
    $replyTo = sc_int(sc_in('reply_to'), 0);
    $post = db_one('SELECT * FROM moment_posts WHERE id = ? LIMIT 1', array($id));
    if (!$post || !sc_moment_visible($post, (int) $u['id'])) {
        sc_fail(1601);
    }
    if ($content === '' || mb_strlen($content, 'UTF-8') > 200) {
        sc_fail(1001, '评论需为 1–200 个字符');
    }
    if ($replyTo > 0 && !db_val('SELECT 1 FROM moment_comments WHERE id = ? AND post_id = ?', array($replyTo, $id))) {
        $replyTo = 0;
    }
    $cid = db_insert(
        'INSERT INTO moment_comments (post_id, user_id, content_enc, reply_to, status, created_at) VALUES (?,?,?,?,1,?)',
        array($id, (int) $u['id'], field_encrypt($content), $replyTo > 0 ? $replyTo : null, time())
    );
    db_exec('UPDATE moment_posts SET comment_count = comment_count + 1 WHERE id = ?', array($id));

    $c = db_one(
        'SELECT mc.*, u.public_id, u.nickname_enc FROM moment_comments mc JOIN users u ON u.id = mc.user_id WHERE mc.id = ?',
        array($cid)
    );
    sc_json(array('comment' => array(
        'id'         => (int) $c['id'],
        'public_id'  => (string) $c['public_id'],
        'nickname'   => (string) field_decrypt($c['nickname_enc']),
        'content'    => $content,
        'reply_to'   => $replyTo > 0 ? $replyTo : null,
        'created_at' => (int) $c['created_at'],
    )));
}

/** POST /api/moment/delete {id} */
function api_moment_delete()
{
    $u = sc_require_auth();
    $id = sc_int(sc_in('id'), 0);
    $post = db_one('SELECT * FROM moment_posts WHERE id = ? LIMIT 1', array($id));
    if (!$post) {
        sc_fail(1601);
    }
    if ((int) $post['author_id'] !== (int) $u['id']) {
        sc_fail(1003);
    }
    db_exec('UPDATE moment_posts SET status = 0 WHERE id = ?', array($id));
    sc_json(array('ok' => true));
}
