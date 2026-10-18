/* 发现与动态 */
(function () {
  'use strict';

  var SC = window.SC = window.SC || {};
  SC.pages = SC.pages || {};

  /* --------------------------------------------------------------- 发现 */
  SC.pages.discover = function () {
    var app = SC.qs('#app');
    app.innerHTML = SC.ui.navbar({ title: '发现', noBack: true }) +
      '<main class="page"><div class="list">' +
      '<button class="list-item" type="button" id="dvMoments">' +
      '<span class="avatar" style="background:#07c160;display:flex;align-items:center;justify-content:center;color:#fff">' + SC.icon('image', 20) + '</span>' +
      '<span class="list-item-body"><span class="list-item-title"><span>动态</span></span></span>' +
      '<span class="list-item-arrow">' + SC.icon('arrow', 18) + '</span></button>' +
      '<button class="list-item" type="button" data-soon><span class="avatar" style="background:#fa9d3b;display:flex;align-items:center;justify-content:center;color:#fff">' + SC.icon('play', 18) + '</span>' +
      '<span class="list-item-body"><span class="list-item-title"><span>视频号</span></span></span><span class="list-item-arrow">' + SC.icon('arrow', 18) + '</span></button>' +
      '<button class="list-item" type="button" data-soon><span class="avatar" style="background:#8d9db6;display:flex;align-items:center;justify-content:center;color:#fff">' + SC.icon('camera', 20) + '</span>' +
      '<span class="list-item-body"><span class="list-item-title"><span>扫一扫</span></span></span><span class="list-item-arrow">' + SC.icon('arrow', 18) + '</span></button>' +
      '<button class="list-item" type="button" data-soon><span class="avatar" style="background:#8aa17c;display:flex;align-items:center;justify-content:center;color:#fff">' + SC.icon('search', 20) + '</span>' +
      '<span class="list-item-body"><span class="list-item-title"><span>搜一搜</span></span></span><span class="list-item-arrow">' + SC.icon('arrow', 18) + '</span></button>' +
      '</div></main>' + SC.ui.tabbar('discover');

    SC.qs('#dvMoments').addEventListener('click', function () { SC.navigate('/moments'); });
    SC.qsa('[data-soon]').forEach(function (b) {
      b.addEventListener('click', function () { SC.toast('敬请期待'); });
    });
  };

  /* --------------------------------------------------------------- 动态 */
  SC.pages.moments = function () {
    var app = SC.qs('#app');
    app.innerHTML = SC.ui.navbar({ title: '动态' }) +
      '<main class="page" id="mtPage"><div id="mtList">' + SC.ui.skeleton(4) + '</div></main>' +
      '<button class="fab" type="button" id="mtPublish" aria-label="发布动态">' + SC.icon('camera', 24) + '</button>';

    var page = SC.qs('#mtPage');
    var listEl = SC.qs('#mtList');
    var offset = 0;
    var loading = false;
    var hasMore = true;
    var moments = [];

    SC.qs('#mtPublish').addEventListener('click', function () { SC.navigate('/moment/publish'); });

    function renderHead() {
      var cover = SC.el('div', { class: 'moment-cover' });
      var owner = SC.el('div', { class: 'moment-owner' });
      var u = SC.state.user;
      owner.innerHTML = '<span class="muted small" style="color:#fff;opacity:.9">' + SC.esc(u.nickname) + '</span>' +
        SC.ui.avatar(u.public_id, u.nickname, 'avatar-xxl', true);
      cover.appendChild(owner);
      return cover;
    }

    function renderList() {
      listEl.innerHTML = '';
      var wrap = SC.el('div', { class: 'moment-list' });
      listEl.appendChild(renderHead());
      if (!moments.length) {
        wrap.appendChild(SC.ui.empty({ title: '还没有动态', desc: '记录生活中的一刻', action: { label: '发布动态', onClick: function () { SC.navigate('/moment/publish'); } } }));
        listEl.appendChild(wrap);
        return;
      }
      moments.forEach(function (m) { wrap.appendChild(renderMoment(m)); });
      listEl.appendChild(wrap);
    }

    function renderMoment(m) {
      var item = SC.el('div', { class: 'moment-item' });
      var authorName = m.author.remark || m.author.nickname;
      var avatar = SC.ui.avatar(m.author.public_id, authorName, 'avatar-lg', true);
      var main = SC.el('div', { class: 'moment-main' });
      var head = SC.el('div', { class: 'moment-author', text: authorName });
      head.addEventListener('click', function () { SC.navigate('/user/' + m.author.public_id); });
      main.appendChild(head);
      if (m.text) { main.appendChild(SC.el('div', { class: 'moment-text', text: m.text })); }

      if (m.media && m.media.length) {
        var grid = SC.el('div', { class: 'moment-media n' + Math.min(9, m.media.length) });
        m.media.forEach(function (md) {
          var img = SC.el('img', { src: md.url, alt: '', loading: 'lazy' });
          img.draggable = false;
          img.addEventListener('click', function () { SC.imageViewer(md.url); });
          grid.appendChild(img);
        });
        main.appendChild(grid);
      }

      var foot = SC.el('div', { class: 'moment-foot' });
      foot.appendChild(SC.el('span', { class: 'moment-time', text: SC.fmtDay(m.created_at) }));
      var likeBtn = SC.el('button', { type: 'button', class: 'moment-act' + (m.liked ? ' liked' : '') });
      likeBtn.innerHTML = '<svg viewBox="0 0 24 24" width="16" height="16"><path d="M12 20s-7-4.4-7-9.5A4 4 0 0 1 12 7a4 4 0 0 1 7 3.5C19 15.6 12 20 12 20z" fill="' + (m.liked ? 'currentColor' : 'none') + '" stroke="currentColor" stroke-width="1.6"/></svg><span>' + (m.like_count || '') + '</span>';
      likeBtn.addEventListener('click', function () {
        var on = !m.liked;
        m.liked = on;
        m.like_count += on ? 1 : -1;
        renderList();
        SC.api('moment/like', { body: { id: m.id, on: on ? 1 : 0 } }).then(function (res) {
          m.like_count = res.like_count;
          renderList();
        }).catch(function () {
          m.liked = !on;
          m.like_count += on ? -1 : 1;
          renderList();
          SC.toast('操作失败');
        });
      });
      var commentBtn = SC.el('button', { type: 'button', class: 'moment-act' });
      commentBtn.innerHTML = '<svg viewBox="0 0 24 24" width="16" height="16"><path d="M4 5h16v11H9l-4 3v-3H4z" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/></svg><span>' + (m.comment_count || '') + '</span>';
      commentBtn.addEventListener('click', function () { openComment(m); });
      foot.appendChild(likeBtn);
      foot.appendChild(commentBtn);
      main.appendChild(foot);

      if ((m.like_users && m.like_users.length) || (m.comments && m.comments.length)) {
        var box = SC.el('div', { class: 'moment-interact' });
        if (m.like_users && m.like_users.length) {
          var likes = SC.el('div', { class: 'moment-likes' });
          likes.textContent = m.like_users.slice(0, 12).map(function (u) { return u.nickname; }).join('，') +
            (m.like_users.length > 12 ? ' 等' : '');
          box.appendChild(likes);
        }
        (m.comments || []).slice(0, 3).forEach(function (c) {
          var row = SC.el('div', { class: 'moment-comment' });
          row.innerHTML = '<b>' + SC.esc(c.nickname) + '</b>' +
            (c.reply_to_nickname ? ' 回复 <b>' + SC.esc(c.reply_to_nickname) + '</b>' : '') + '：' + SC.esc(c.content);
          box.appendChild(row);
        });
        if (m.comment_count > 3) {
          var more = SC.el('button', { type: 'button', class: 'btn-text small', text: '查看全部 ' + m.comment_count + ' 条评论' });
          more.addEventListener('click', function () { SC.navigate('/moment/' + m.id); });
          box.appendChild(more);
        }
        main.appendChild(box);
      }

      var longTimer = 0;
      item.addEventListener('touchstart', function () {
        longTimer = setTimeout(function () {
          if (m.is_mine) {
            SC.actions([{ label: '删除', danger: true }]).then(function (idx) {
              if (idx === 0) {
                SC.dialog({ title: '删除动态', content: '删除后无法恢复，确定删除？', confirmText: '删除', danger: true }).then(function (ok) {
                  if (!ok) { return; }
                  SC.api('moment/delete', { body: { id: m.id } }).then(function () {
                    moments = moments.filter(function (x) { return x.id !== m.id; });
                    renderList();
                    SC.toast('已删除');
                  });
                });
              }
            });
          }
        }, 500);
      }, { passive: true });
      item.addEventListener('touchend', function () { clearTimeout(longTimer); });
      item.addEventListener('touchmove', function () { clearTimeout(longTimer); });

      item.appendChild(SC.el('div', { html: avatar }));
      item.appendChild(main);
      return item;
    }

    function openComment(m) {
      SC.dialog({ title: '评论', input: true, placeholder: '写下你的评论…', maxlength: 200 }).then(function (text) {
        if (text === null || !text) { return; }
        SC.api('moment/comment', { body: { id: m.id, content: text } }).then(function (res) {
          m.comments = (m.comments || []).concat([res.comment]);
          m.comment_count += 1;
          renderList();
          SC.toast('已发送');
        }).catch(function (e) { SC.toast(e.message, 'error'); });
      });
    }

    function load(reset) {
      if (loading) { return; }
      loading = true;
      if (reset) { offset = 0; hasMore = true; }
      SC.api('moment/feed?offset=' + offset + '&limit=20').then(function (data) {
        if (reset) { moments = []; }
        moments = moments.concat(data.moments || []);
        offset += (data.moments || []).length;
        hasMore = data.has_more;
        renderList();
        loading = false;
      }).catch(function (e) {
        loading = false;
        if (!moments.length) {
          listEl.innerHTML = '';
          listEl.appendChild(SC.ui.error(e.message || '加载失败', function () { load(true); }));
        }
      });
    }

    page.addEventListener('scroll', function () {
      if (page.scrollTop + page.clientHeight >= page.scrollHeight - 120 && hasMore && !loading) {
        load(false);
      }
    });

    var off = SC.on('poll:notices', function () {
      SC.toast('你有一条新的动态互动');
    });
    SC.onRouteCleanup(function () { off(); });

    load(true);
  };

  /* --------------------------------------------------------------- 发布 */
  SC.pages.momentPublish = function () {
    var app = SC.qs('#app');
    var picked = [];
    var visibility = 1;
    var visibleUsers = [];

    app.innerHTML = SC.ui.navbar({
      title: '发布动态',
      right: '<button class="navbar-action primary" type="button" id="mpSend" disabled>发布</button>'
    }) + '<main class="page page-full"><div class="p16" style="background:#fff">' +
      '<textarea class="textarea" id="mpText" maxlength="1000" placeholder="这一刻的想法…" style="min-height:140px"></textarea>' +
      '<div class="row-between mt8"><span class="tiny muted" id="mpCount">0/1000</span></div>' +
      '<div class="publish-media" id="mpMedia"><button class="publish-add" type="button" id="mpAdd">' + SC.icon('plus', 26) + '</button></div>' +
      '</div>' +
      '<div class="cell-group"><button class="list-item no-avatar" type="button" id="mpVisibility">' +
      '<span class="list-item-body"><span class="list-item-title"><span>谁可以看</span></span></span>' +
      '<span class="muted small" id="mpVisText">公开</span><span class="list-item-arrow">' + SC.icon('arrow', 18) + '</span></button></div>' +
      '</main>';

    var textEl = SC.qs('#mpText');
    var sendBtn = SC.qs('#mpSend');
    var mediaEl = SC.qs('#mpMedia');
    var addBtn = SC.qs('#mpAdd');

    function refreshBtn() {
      sendBtn.disabled = !(textEl.value.trim() || picked.length);
    }
    textEl.addEventListener('input', function () {
      SC.qs('#mpCount').textContent = textEl.value.length + '/1000';
      refreshBtn();
    });

    function renderMedia() {
      SC.qsa('.thumb', mediaEl).forEach(function (n) { n.parentNode.removeChild(n); });
      picked.forEach(function (item, idx) {
        var thumb = SC.el('div', { class: 'thumb' });
        thumb.innerHTML = '<img src="' + item.preview + '" alt="" draggable="false" loading="lazy">';
        var del = SC.el('button', { type: 'button', text: '×' });
        del.addEventListener('click', function () {
          picked.splice(idx, 1);
          renderMedia();
        });
        thumb.appendChild(del);
        mediaEl.insertBefore(thumb, addBtn);
      });
      addBtn.style.display = picked.length >= 9 ? 'none' : 'flex';
      refreshBtn();
    }

    addBtn.addEventListener('click', function () {
      var input = document.createElement('input');
      input.type = 'file';
      input.accept = 'image/*';
      input.multiple = true;
      input.addEventListener('change', function () {
        var files = Array.prototype.slice.call(input.files || []);
        if (picked.length + files.length > 9) { SC.toast('最多 9 张'); files = files.slice(0, 9 - picked.length); }
        files.forEach(function (file) {
          picked.push({ file: file, preview: URL.createObjectURL(file), mediaId: 0 });
        });
        renderMedia();
      });
      input.click();
    });

    SC.qs('#mpVisibility').addEventListener('click', function () {
      SC.actions([{ label: '公开' }, { label: '私密（仅自己）' }, { label: '部分可见' }]).then(function (idx) {
        if (idx === 0) { visibility = 1; visibleUsers = []; SC.qs('#mpVisText').textContent = '公开'; }
        if (idx === 1) { visibility = 3; visibleUsers = []; SC.qs('#mpVisText').textContent = '仅自己'; }
        if (idx === 2) { pickVisible(); }
      });
    });

    function pickVisible() {
      SC.store.refreshFriends().then(function (friends) {
        var chosen = {};
        var mask = SC.el('div', { class: 'mask' });
        var sheet = SC.el('div', { class: 'action-sheet', style: 'max-height:70vh;overflow:auto' });
        sheet.appendChild(SC.el('div', { class: 'action-sheet-title', text: '选择可见的好友' }));
        friends.forEach(function (f) {
          var name = f.remark || f.nickname;
          var row = SC.el('button', { type: 'button', class: 'check-item' });
          row.innerHTML = '<span class="box"></span>' + SC.ui.avatar(f.public_id, name, 'avatar', true) + '<span style="flex:1">' + SC.esc(name) + '</span>';
          row.addEventListener('click', function () {
            if (chosen[f.public_id]) { delete chosen[f.public_id]; row.classList.remove('on'); row.querySelector('.box').innerHTML = ''; }
            else { chosen[f.public_id] = f; row.classList.add('on'); row.querySelector('.box').innerHTML = SC.icon('check', 12); }
          });
          sheet.appendChild(row);
        });
        var done = SC.el('button', { type: 'button', class: 'action-sheet-item', text: '完成' });
        done.addEventListener('click', function () {
          visibleUsers = Object.keys(chosen).map(function (k) { return chosen[k]; });
          if (visibleUsers.length) {
            visibility = 4;
            SC.qs('#mpVisText').textContent = '部分可见(' + visibleUsers.length + ')';
          }
          if (mask.parentNode) { mask.parentNode.removeChild(mask); }
        });
        sheet.appendChild(done);
        mask.appendChild(sheet);
        document.body.appendChild(mask);
      });
    }

    sendBtn.addEventListener('click', function () {
      var text = textEl.value.trim();
      if (!text && !picked.length) { return; }
      sendBtn.disabled = true;
      sendBtn.classList.add('btn-loading');
      SC.toast('正在发布…');

      var jobs = picked.map(function (item) {
        if (item.mediaId) { return Promise.resolve(item); }
        return compress(item.file).then(function (blob) {
          var fd = new FormData();
          fd.append('file', new Blob([blob]), 'moment.jpg');
          fd.append('type', '1');
          fd.append('scope', 'moment');
          return SC.upload('upload', fd).then(function (data) {
            item.mediaId = data.media_id;
            return item;
          });
        });
      });

      Promise.all(jobs).then(function (items) {
        return SC.api('moment/post', {
          body: {
            text: text,
            visibility: visibility,
            visible_user_ids: visibleUsers.map(function (u) { return u.public_id; }),
            media: items.map(function (it) { return { media_id: it.mediaId, type: 1 }; })
          }
        });
      }).then(function () {
        SC.toast('已发布', 'success');
        SC.navigate('/moments', true);
      }).catch(function (e) {
        sendBtn.disabled = false;
        sendBtn.classList.remove('btn-loading');
        SC.toast(e.message || '发布失败', 'error');
      });
    });

    function compress(file) {
      return new Promise(function (resolve) {
        var img = new Image();
        img.onload = function () {
          var max = 1600;
          var w = img.width, h = img.height;
          if (w > max || h > max) {
            var s = Math.min(max / w, max / h);
            w = Math.round(w * s); h = Math.round(h * s);
          }
          var canvas = document.createElement('canvas');
          canvas.width = w; canvas.height = h;
          canvas.getContext('2d').drawImage(img, 0, 0, w, h);
          canvas.toBlob(function (blob) { resolve(blob || file); }, 'image/jpeg', 0.82);
        };
        img.onerror = function () { resolve(file); };
        img.src = URL.createObjectURL(file);
      });
    }
  };

  /* --------------------------------------------------------------- 详情 */
  SC.pages.momentDetail = function (params) {
    var app = SC.qs('#app');
    app.innerHTML = SC.ui.navbar({ title: '动态' }) + '<main class="page page-with-input"><div id="mdBody">' + SC.ui.skeleton(3) + '</div></main>' +
      '<div class="chat-input"><textarea id="mdInput" rows="1" placeholder="评论…" maxlength="200"></textarea>' +
      '<button class="chat-send" type="button" id="mdSend">发送</button></div>';

    var body = SC.qs('#mdBody');
    var moment = null;
    var replyTo = 0;

    function render() {
      body.innerHTML = '';
      var m = moment;
      var authorName = m.author.remark || m.author.nickname;
      var head = SC.el('div', { class: 'profile-hero' });
      head.innerHTML = SC.ui.avatar(m.author.public_id, authorName, 'avatar-lg', true) +
        '<div><div style="font-size:17px;font-weight:600">' + SC.esc(authorName) + '</div>' +
        '<div class="muted small">' + SC.fmtFullTime(m.created_at) + '</div></div>';
      body.appendChild(head);

      var content = SC.el('div', { class: 'p16', style: 'background:#fff' });
      if (m.text) { content.appendChild(SC.el('div', { class: 'moment-text', text: m.text, style: 'font-size:16px' })); }
      if (m.media && m.media.length) {
        var grid = SC.el('div', { class: 'moment-media n' + Math.min(9, m.media.length), style: 'max-width:100%' });
        m.media.forEach(function (md) {
          var img = SC.el('img', { src: md.url, alt: '', loading: 'lazy' });
          img.addEventListener('click', function () { SC.imageViewer(md.url); });
          grid.appendChild(img);
        });
        content.appendChild(grid);
      }
      body.appendChild(content);

      var likes = SC.el('div', { class: 'p16', style: 'background:#fff;border-top:.5px solid #eee' });
      likes.innerHTML = '<div class="moment-likes">' + (m.like_users.length
        ? m.like_users.map(function (u) { return SC.esc(u.nickname); }).join('，')
        : '<span class="muted">还没有人点赞</span>') + '</div>';
      body.appendChild(likes);

      body.appendChild(SC.el('div', { class: 'list-group-title', text: '全部评论 ' + m.comment_count }));
      var list = SC.el('div', { class: 'list' });
      (m.comments || []).forEach(function (c) {
        var row = SC.el('div', { class: 'list-item' });
        row.innerHTML = SC.ui.avatar(c.public_id, c.nickname, 'avatar-sm', true) +
          '<span class="list-item-body"><span class="list-item-title"><span>' + SC.esc(c.nickname) + '</span></span>' +
          '<span class="list-item-desc" style="white-space:normal">' +
          (c.reply_to_nickname ? '回复 ' + SC.esc(c.reply_to_nickname) + '：' : '') + SC.esc(c.content) + '</span></span>';
        row.addEventListener('click', function () {
          replyTo = c.id;
          var input = SC.qs('#mdInput');
          input.placeholder = '回复 ' + c.nickname + '…';
          input.focus();
        });
        list.appendChild(row);
      });
      if (!(m.comments || []).length) {
        list.appendChild(SC.ui.empty({ title: '还没有评论', desc: '来说点什么' }));
      }
      body.appendChild(list);
    }

    SC.api('moment/detail?id=' + encodeURIComponent(params.id)).then(function (data) {
      moment = data.moment;
      render();
    }).catch(function (e) {
      body.innerHTML = '';
      body.appendChild(SC.ui.error(e.message || '加载失败', function () { SC.render(); }));
    });

    SC.qs('#mdSend').addEventListener('click', function () {
      var input = SC.qs('#mdInput');
      var text = input.value.trim();
      if (!text) { return; }
      SC.api('moment/comment', { body: { id: moment.id, content: text, reply_to: replyTo || 0 } }).then(function () {
        input.value = '';
        replyTo = 0;
        input.placeholder = '评论…';
        return SC.api('moment/detail?id=' + moment.id).then(function (d) {
          moment = d.moment;
          render();
          SC.toast('已发送');
        });
      }).catch(function (e) { SC.toast(e.message, 'error'); });
    });
  };
})();
