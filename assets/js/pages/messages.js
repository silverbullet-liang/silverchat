/* 会话列表与聊天页 */
(function () {
  'use strict';

  var SC = window.SC = window.SC || {};
  SC.pages = SC.pages || {};

  function avatarHtml(conv, size) {
    var name = conv.title || '';
    return SC.ui.avatar(conv.public_id, name, size || 'avatar-lg', conv.avatar);
  }

  function refreshTabbarBadge() {
    var badge = SC.qs('.tabbar-item.active .badge-num');
    var tab = SC.qs('.tabbar-item[href="/"]');
    if (!tab) { return; }
    var old = tab.querySelector('.badge-num');
    if (old) { old.parentNode.removeChild(old); }
    if (SC.state.unread > 0) {
      var span = SC.el('span', { class: 'badge-num tab-badge', text: SC.state.unread > 99 ? '99+' : String(SC.state.unread) });
      tab.appendChild(span);
    }
  }

  /* ------------------------------------------------------------- 会话列表 */
  SC.pages.conversations = function () {
    var app = SC.qs('#app');
    app.innerHTML =
      SC.ui.navbar({
        title: 'SilverChat',
        noBack: true,
        right: '<button class="navbar-icon" type="button" id="convSearch" aria-label="搜索">' + SC.icon('search', 21) + '</button>' +
          '<button class="navbar-icon" type="button" id="convAdd" aria-label="更多">' + SC.icon('plus', 22) + '</button>'
      }) +
      '<main class="page"><div id="convList">' + SC.ui.skeleton(6) + '</div></main>' +
      SC.ui.tabbar('chat');

    SC.qs('#convSearch').addEventListener('click', function () { SC.navigate('/search'); });
    SC.qs('#convAdd').addEventListener('click', function () {
      SC.actions([
        { label: '发起群聊' },
        { label: '添加朋友' },
        { label: '扫一扫' }
      ]).then(function (idx) {
        if (idx === 0) { SC.navigate('/group/create'); }
        else if (idx === 1) { SC.navigate('/contacts/add'); }
        else if (idx === 2) { SC.toast('敬请期待'); }
      });
    });

    var listEl = SC.qs('#convList');

    function render() {
      var convs = SC.state.conversations || [];
      var totalUnread = convs.reduce(function (n, c) { return n + (c.unread || 0); }, 0);
      var titleEl = SC.qs('.navbar-title');
      if (titleEl) {
        titleEl.textContent = 'SilverChat' + (totalUnread > 0 ? '(' + (totalUnread > 99 ? '99+' : totalUnread) + ')' : '');
      }
      if (!convs.length) {
        listEl.innerHTML = '';
        listEl.appendChild(SC.ui.empty({
          title: '暂无会话',
          desc: '去通讯录找个朋友聊聊吧',
          action: { label: '去通讯录', onClick: function () { SC.navigate('/contacts'); } }
        }));
        return;
      }
      listEl.innerHTML = '';
      var list = SC.el('div', { class: 'list' });
      convs.forEach(function (conv) {
        var item = SC.el('button', {
          type: 'button',
          class: 'list-item conv-item' + (conv.pinned ? ' pinned' : ''),
          'data-conv': String(conv.conv_id)
        });
        var badgeHtml = conv.unread > 0
          ? '<span class="badge-num conv-badge' + (conv.muted ? ' badge-muted' : '') + '">' + (conv.unread > 99 ? '99+' : conv.unread) + '</span>'
          : '';
        var hasGrid = conv.type === 2 && conv.member_avatars && conv.member_avatars.length &&
          conv.member_avatars.some(function (m) { return !!m.avatar; });
        var avatarHtml;
        if (hasGrid) {
          avatarHtml = '<span class="avatar avatar-lg conv-grid no-select">';
          for (var gi = 0; gi < 9; gi++) {
            var mm = conv.member_avatars[gi];
            avatarHtml += (mm && mm.avatar)
              ? '<img src="/api/avatar/' + encodeURIComponent(mm.public_id) + '" alt="" draggable="false">'
              : '<span class="grid-empty"></span>';
          }
          avatarHtml += '</span>';
        } else {
          avatarHtml = SC.ui.avatar(conv.public_id, conv.title, 'avatar-lg', !!conv.avatar);
        }
        item.innerHTML =
          '<span class="conv-avatar-wrap">' + avatarHtml + badgeHtml + '</span>' +
          '<span class="list-item-body">' +
          '<span class="conv-title-row"><span class="conv-name">' + SC.esc(conv.title || '会话') + '</span>' +
          '<span class="conv-time">' + SC.fmtDay(conv.last ? conv.last.created_at : conv.updated_at) + '</span></span>' +
          '<span class="list-item-desc conv-preview" data-summary>加密消息</span>' +
          '</span>';
        item.addEventListener('click', function () {
          SC.navigate('/talk/' + conv.conv_id);
        });
        bindLongPress(item, function () {
          var items = [
            { label: conv.pinned ? '取消置顶' : '置顶会话' },
            { label: conv.muted ? '取消免打扰' : '消息免打扰' },
            { label: '删除会话', danger: true }
          ];
          SC.actions(items, conv.title).then(function (idx) {
            if (idx === 0) {
              SC.api('conversation/pin', { body: { conv_id: conv.conv_id, pinned: conv.pinned ? 0 : 1 } }).then(function () {
                conv.pinned = !conv.pinned;
                render();
              });
            } else if (idx === 1) {
              SC.api('conversation/mute', { body: { conv_id: conv.conv_id, muted: conv.muted ? 0 : 1 } }).then(function () {
                conv.muted = !conv.muted;
                render();
              });
            } else if (idx === 2) {
              SC.dialog({ title: '删除会话', content: '删除后该会话不再显示，消息仍会保留。', confirmText: '删除', danger: true }).then(function (ok) {
                if (!ok) { return; }
                SC.api('conversation/delete', { body: { conv_id: conv.conv_id } }).then(function () {
                  SC.state.conversations = SC.state.conversations.filter(function (c) { return c.conv_id !== conv.conv_id; });
                  render();
                });
              });
            }
          });
        });
        list.appendChild(item);

        var sumEl = item.querySelector('[data-summary]');
        SC.store.summary(conv).then(function (text) {
          if (sumEl && sumEl.parentNode) { sumEl.textContent = text || ''; }
        });
      });
      listEl.appendChild(list);
    }

    var reload = SC.debounce(function () {
      SC.store.refreshConversations().then(render).catch(function () {});
    }, 300);

    SC.store.refreshConversations().then(render).catch(function (err) {
      listEl.innerHTML = '';
      listEl.appendChild(SC.ui.error('加载失败', function () { SC.render(); }));
    });

    var off1 = SC.on('poll:messages', reload);
    var off2 = SC.on('poll:unread', function (n) {
      SC.state.unread = n;
      refreshTabbarBadge();
    });
    SC.onRouteCleanup(function () { off1(); off2(); });

    // 每次进入刷新一次未读
    SC.api('auth/me').then(function (d) {
      SC.state.unread = d.unread || 0;
      SC.state.pendingRequests = d.pending_requests || 0;
      refreshTabbarBadge();
    }).catch(function () {});
  };

  /* ----------------------------------------------------------- 长按绑定 */
  function bindLongPress(node, fn) {
    var timer = 0, moved = false;
    function start() {
      moved = false;
      timer = setTimeout(function () { if (!moved) { fn(); } }, 480);
    }
    function cancel() { clearTimeout(timer); }
    node.addEventListener('touchstart', start, { passive: true });
    node.addEventListener('touchmove', function () { moved = true; cancel(); }, { passive: true });
    node.addEventListener('touchend', cancel);
    node.addEventListener('touchcancel', cancel);
    node.addEventListener('contextmenu', function (e) { e.preventDefault(); fn(); });
  }

  /* --------------------------------------------------------------- 聊天页 */
  SC.pages.chat = function (params) {
    var convId = parseInt(params.id, 10);
    var app = SC.qs('#app');
    if (!convId) { SC.navigate('/', true); return; }

    app.innerHTML = '<div class="chat-shell">' +
      '<div id="chatNav"></div>' +
      '<div class="chat-stream" id="stream"></div>' +
      '<div class="chat-input" id="composer"></div>' +
      '<div id="panelHost"></div></div>';

    var identity = null;
    var peerKey = '';
    var groupKey = null;
    var conv = SC.store.getConversation(convId);
    var messages = [];
    var oldestId = 0;
    var hasMore = true;
    var loadingMore = false;
    var emojiOpen = false;
    var moreOpen = false;
    var mediaKey = null;

    var stream = SC.qs('#stream');
    var navEl = SC.qs('#chatNav');
    var composer = SC.qs('#composer');
    var panelHost = SC.qs('#panelHost');

    function renderNav() {
      var isStaff = SC.state.user && SC.state.user.is_staff;
      navEl.innerHTML = SC.ui.navbar({
        title: conv ? conv.title : '聊天',
        right: (isStaff
          ? '<button class="navbar-action primary" type="button" id="chatDesk">工作台</button>'
          : '<button class="navbar-icon" type="button" id="chatMore" aria-label="更多">' + SC.icon('more', 22) + '</button>')
      });
      var t = navEl.querySelector('.navbar-title');
      if (conv && conv.type === 2) {
        t.textContent = (conv.title || '群聊') + (conv.member_count ? ' (' + conv.member_count + ')' : '');
      }
      if (isStaff) {
        navEl.querySelector('#chatDesk').addEventListener('click', function () { SC.navigate('/kefu', true); });
      } else {
        navEl.querySelector('#chatMore').addEventListener('click', function () {
          SC.navigate('/talk/' + convId + '/settings');
        });
      }
    }

    /** 客服会话顶部实时状态条 */
    function setupKefuStatus() {
      if (!conv || !conv.peer_is_staff) { return; }
      var shell = SC.qs('.chat-shell');
      if (!shell) { return; }
      var bar = SC.el('div', { class: 'kefu-status' });
      shell.insertBefore(bar, stream);

      function paint(s) {
        var online = !!(s && s.online);
        var text = online ? '客服在线' : (s && s.has_key ? '客服离线，留言会尽快回复' : '客服尚未上线');
        bar.innerHTML = '<span class="kefu-dot' + (online ? ' on' : '') + '"></span><span>' + text + '</span>';
      }
      SC.api('kefu/status').then(paint).catch(function () { paint(null); });
      var timer = setInterval(function () {
        if (!document.hidden) { SC.api('kefu/status').then(paint).catch(function () {}); }
      }, 15000);
      SC.onRouteCleanup(function () { clearInterval(timer); });
    }

    function renderComposer() {
      composer.innerHTML =
        '<button class="icon-btn" type="button" id="btnVoice" aria-label="语音">' + SC.icon('mic', 24) + '</button>' +
        '<textarea id="msgInput" rows="1" placeholder="发消息…" maxlength="4000"></textarea>' +
        '<button class="icon-btn" type="button" id="btnEmoji" aria-label="表情">' + SC.icon('smile', 24) + '</button>' +
        '<button class="icon-btn" type="button" id="btnMore" aria-label="更多">' + SC.icon('add', 24) + '</button>' +
        '<button class="chat-send hidden" type="button" id="btnSend">发送</button>';

      var input = SC.qs('#msgInput');
      var sendBtn = SC.qs('#btnSend');

      function syncSend() {
        var has = input.value.trim().length > 0;
        sendBtn.classList.toggle('hidden', !has);
        SC.qs('#btnMore').classList.toggle('hidden', has);
        input.style.height = 'auto';
        input.style.height = Math.min(110, input.scrollHeight) + 'px';
      }
      input.addEventListener('input', syncSend);
      input.addEventListener('keydown', function (e) {
        if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) {
          e.preventDefault();
          sendText();
        }
      });
      sendBtn.addEventListener('click', sendText);

      SC.qs('#btnEmoji').addEventListener('click', function () {
        moreOpen = false;
        emojiOpen = !emojiOpen;
        renderPanels();
      });
      SC.qs('#btnMore').addEventListener('click', function () {
        emojiOpen = false;
        moreOpen = !moreOpen;
        renderPanels();
      });
      SC.qs('#btnVoice').addEventListener('click', function () {
        SC.toast('按住说话：点击录音开始', 'success');
        toggleRecord();
      });
    }

    /* ------------------------------------------------------------ 面板 */
    function renderPanels() {
      panelHost.innerHTML = '';
      if (!emojiOpen && !moreOpen) { return; }
      if (emojiOpen) {
        var panel = SC.el('div', { class: 'panel' });
        var grid = SC.el('div', { class: 'emoji-grid' });
        var map = SC.store.emojiMap();
        Object.keys(map).forEach(function (code) {
          var it = map[code];
          var btn = SC.el('button', { type: 'button', title: it.name });
          var img = SC.el('img', { src: it.url, alt: it.name, draggable: 'false' });
          btn.appendChild(img);
          btn.addEventListener('click', function () { sendEmoji(code); });
          grid.appendChild(btn);
        });
        if (!grid.children.length) {
          grid.appendChild(SC.el('div', { class: 'muted small p16', text: '暂无表情' }));
        }
        panel.appendChild(grid);
        panelHost.appendChild(panel);
      }
      if (moreOpen) {
        var p = SC.el('div', { class: 'panel' });
        var g = SC.el('div', { class: 'more-grid' });
        var items = [
          { label: '相册', icon: 'image', fn: function () { pickFile('image/*', 1); } },
          { label: '拍摄', icon: 'camera', fn: function () { pickFile('image/*', 1, true); } },
          { label: '位置', icon: 'location', fn: sendLocation },
          { label: '文件', icon: 'file', fn: function () { pickFile('', 4); } },
          { label: '视频', icon: 'play', fn: function () { pickFile('video/*', 3); } }
        ];
        items.forEach(function (it) {
          var btn = SC.el('button', { type: 'button', class: 'more-item' });
          btn.innerHTML = '<span class="more-icon">' + SC.icon(it.icon, 24) + '</span><span>' + it.label + '</span>';
          btn.addEventListener('click', it.fn);
          g.appendChild(btn);
        });
        p.appendChild(g);
        panelHost.appendChild(p);
      }
    }

    /* ------------------------------------------------------- 消息渲染 */
    function keyForMessage(msg) {
      if (conv && conv.type === 2) { return groupKey; }
      return peerKey;
    }

    function decryptText(msg) {
      if (msg.type === 99) { return Promise.resolve(msg.content); }
      if (msg.content === 'expired') { return Promise.resolve(''); }
      var key = keyForMessage(msg);
      if (!key || !identity) { return Promise.reject(new Error('missing key')); }
      if (conv.type === 2) {
        return SC.crypto.decryptWithKey(key, convId, msg.content);
      }
      return SC.crypto.decrypt(identity, key, convId, msg.content);
    }

    function renderAll() {
      stream.innerHTML = '';
      var lastTs = 0;
      messages.forEach(function (msg) {
        if (msg.created_at - lastTs > 300) {
          stream.appendChild(SC.el('div', { class: 'msg-time', text: SC.fmtFullTime(msg.created_at) }));
          lastTs = msg.created_at;
        }
        stream.appendChild(renderMessage(msg));
      });
    }

    function renderMessage(msg) {
      var mine = msg.sender_public_id === (SC.state.user && SC.state.user.public_id);
      if (msg.type === 99) {
        var sys = SC.el('div', { class: 'msg-system' });
        sys.appendChild(SC.el('span', { text: msg.content }));
        return sys;
      }
      if (msg.status === 2) {
        return SC.el('div', { class: 'msg-recall', text: mine ? '你撤回了一条消息' : '对方撤回了一条消息' });
      }

      var row = SC.el('div', { class: 'msg-row' + (mine ? ' self' : '') });
      var avatarWrap = SC.el('span', { class: 'msg-avatar' });
      var avatarImg = SC.ui.avatar(msg.sender_public_id, msg.sender_name, '', !!msg.sender_public_id);
      avatarWrap.innerHTML = avatarImg;
      var main = SC.el('div', { class: 'msg-main' });
      if (conv && conv.type === 2 && !mine) {
        main.appendChild(SC.el('div', { class: 'msg-name', text: msg.sender_name || '' }));
      }
      var line = SC.el('div', { class: 'msg-line' });

      var bubble;
      if (msg.content === 'expired' || (msg.extra && msg.extra.expired)) {
        bubble = SC.el('div', { class: 'bubble bubble-expired', text: '内容已过期' });
      } else if (msg.type === 2) {
        bubble = mediaBubble(msg, 'image');
      } else if (msg.type === 3) {
        bubble = voiceBubble(msg);
      } else if (msg.type === 4) {
        bubble = mediaBubble(msg, 'video');
      } else if (msg.type === 5) {
        bubble = fileBubble(msg);
      } else if (msg.type === 6) {
        bubble = emojiBubble(msg);
      } else if (msg.type === 7) {
        bubble = locationBubble(msg);
      } else {
        bubble = SC.el('div', { class: 'bubble' + (mine ? ' bubble-self' : '') });
        var body = SC.el('span', { class: 'bubble-text', text: msg.text || '' });
        bubble.appendChild(body);
      }
      if (msg.status === -1) { bubble.classList.add('bubble-failed'); }
      line.appendChild(bubble);

      if (mine && msg.type !== 99) {
        var st = SC.el('span', { class: 'msg-status' });
        if (msg.status === 0) { st.textContent = '发送中'; }
        if (msg.status === -1) { st.textContent = '发送失败'; }
        if (msg.status === 1) { st.innerHTML = '<svg viewBox="0 0 20 20" width="13" height="13"><path d="M3 10.5 7 14.5 15 5.5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>'; }
        if (msg.status === 2) { st.innerHTML = '<span class="read"><svg viewBox="0 0 24 20" width="16" height="13"><path d="M2 10.5 6 14.5 14 5.5M9 13.5l1.5 1L20 5.5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg></span>'; }
        line.appendChild(st);
      }
      main.appendChild(line);

      bindLongPress(bubble, function () {
        var acts = [];
        if (msg.type === 1) { acts.push({ label: '复制' }); }
        if (mine && msg.status === 1 && Date.now() / 1000 - msg.created_at < 120) { acts.push({ label: '撤回' }); }
        acts.push({ label: '删除', danger: true });
        SC.actions(acts).then(function (idx) {
          var picked = acts[idx];
          if (!picked) { return; }
          if (picked.label === '复制') {
            if (navigator.clipboard) { navigator.clipboard.writeText(msg.text || '').then(function () { SC.toast('已复制'); }); }
          } else if (picked.label === '撤回') {
            SC.api('message/revoke', { body: { msg_id: msg.id } }).then(function () {
              msg.status = 2;
              renderAll();
              SC.toast('已撤回');
            }).catch(function (e) { SC.toast(e.message, 'error'); });
          } else if (picked.label === '删除') {
            messages = messages.filter(function (m) { return m !== msg; });
            renderAll();
          }
        });
      });

      row.appendChild(avatarWrap);
      row.appendChild(main);
      return row;
    }

    function mediaBubble(msg, kind) {
      var self = msg.sender_public_id === (SC.state.user && SC.state.user.public_id);
      var bubble = SC.el('div', { class: 'bubble bubble-media' + (self ? ' bubble-self' : '') });
      bubble.style.background = 'transparent';
      bubble.style.padding = '0';
      var placeholder = SC.el('div', {
        style: 'width:160px;height:120px;border-radius:6px;background:#e9e9e9;display:flex;align-items:center;justify-content:center;color:#aaa;font-size:12px',
        text: '加载中…'
      });
      bubble.appendChild(placeholder);
      if (msg.extra && msg.extra.media_id) {
        loadMedia(msg.extra.media_id, kind).then(function (url) {
          bubble.innerHTML = '';
          if (kind === 'image') {
            var img = SC.el('img', { src: url, alt: '' });
            img.draggable = false;
            img.addEventListener('click', function () { SC.imageViewer(url); });
            bubble.appendChild(img);
          } else {
            var v = SC.el('video', { src: url, controls: 'controls', playsinline: 'playsinline' });
            v.style.maxWidth = '220px';
            v.style.borderRadius = '6px';
            bubble.appendChild(v);
          }
        }).catch(function () {
          bubble.innerHTML = '';
          bubble.appendChild(SC.el('div', { class: 'bubble bubble-expired', text: kind === 'image' ? '图片已过期' : '视频已过期' }));
        });
      } else {
        placeholder.textContent = '内容已过期';
      }
      return bubble;
    }

    var mediaUrlCache = {};
    function loadMedia(mediaId, kind) {
      if (mediaUrlCache[mediaId]) { return Promise.resolve(mediaUrlCache[mediaId]); }
      var key = keyForMessage({});
      if (!key) { return Promise.reject(new Error('no key')); }
      return fetch('/api/media/' + mediaId, {
        headers: { Authorization: 'Bearer ' + SC.getToken() },
        credentials: 'same-origin'
      }).then(function (res) {
        if (!res.ok) { throw new Error('media ' + res.status); }
        return res.arrayBuffer();
      }).then(function (buf) {
        return SC.crypto.decryptBytes(key, buf);
      }).then(function (plain) {
        var blob = new Blob([plain], { type: kind === 'image' ? 'image/jpeg' : 'application/octet-stream' });
        var url = URL.createObjectURL(blob);
        mediaUrlCache[mediaId] = url;
        return url;
      });
    }

    function voiceBubble(msg) {
      var self = msg.sender_public_id === (SC.state.user && SC.state.user.public_id);
      var bubble = SC.el('div', { class: 'bubble bubble-voice' + (self ? ' bubble-self' : '') });
      var dur = (msg.extra && msg.extra.duration) || 0;
      bubble.innerHTML = '<span style="color:#4a4a4a">' + SC.icon('play', 16) + '</span><span>' + (dur || '') + '"</span>';
      bubble.addEventListener('click', function () {
        if (!msg.extra || !msg.extra.media_id) { SC.toast('语音已过期'); return; }
        loadMedia(msg.extra.media_id, 'voice').then(function (url) {
          var audio = new Audio(url);
          audio.play();
        }).catch(function () { SC.toast('语音已过期'); });
      });
      return bubble;
    }

    function fileBubble(msg) {
      var self = msg.sender_public_id === (SC.state.user && SC.state.user.public_id);
      var name = (msg.extra && msg.extra.name) || '文件';
      var size = (msg.extra && msg.extra.size) || 0;
      var bubble = SC.el('div', { class: 'bubble bubble-file' + (self ? ' bubble-self' : '') });
      bubble.innerHTML = '<span class="file-icon">' + SC.icon('file', 20) + '</span>' +
        '<span class="file-meta"><span class="file-name">' + SC.esc(name) + '</span>' +
        '<span class="file-size">' + SC.fmtSize(size) + '</span></span>';
      bubble.addEventListener('click', function () {
        if (!msg.extra || !msg.extra.media_id) { SC.toast('文件已过期'); return; }
        loadMedia(msg.extra.media_id, 'file').then(function (url) {
          var a = document.createElement('a');
          a.href = url;
          a.download = name;
          a.click();
        }).catch(function () { SC.toast('文件已过期'); });
      });
      return bubble;
    }

    function emojiBubble(msg) {
      var self = msg.sender_public_id === (SC.state.user && SC.state.user.public_id);
      var bubble = SC.el('div', { class: 'bubble bubble-emoji' + (self ? ' bubble-self' : '') });
      var map = SC.store.emojiMap();
      var item = map[msg.text];
      if (item) {
        bubble.innerHTML = '<img src="' + SC.esc(item.url) + '" alt="' + SC.esc(item.name) + '" width="56" height="56" draggable="false">';
      } else {
        bubble.textContent = '[表情]';
      }
      return bubble;
    }

    function locationBubble(msg) {
      var self = msg.sender_public_id === (SC.state.user && SC.state.user.public_id);
      var extra = msg.extra || {};
      var bubble = SC.el('div', { class: 'bubble' + (self ? ' bubble-self' : '') });
      bubble.innerHTML = '<div style="min-width:180px"><div style="font-weight:500">' + SC.esc(extra.name || '位置') + '</div>' +
        '<div class="tiny muted">' + SC.esc((extra.lat || 0).toFixed(4)) + ', ' + SC.esc((extra.lng || 0).toFixed(4)) + '</div></div>';
      return bubble;
    }

    /* --------------------------------------------------------- 加载消息 */
    function mergeMessages(list) {
      var seen = {};
      messages.forEach(function (m) { seen[m.id] = true; });
      var added = 0;
      list.forEach(function (m) {
        if (!seen[m.id]) {
          messages.push(m);
          seen[m.id] = true;
          added++;
        }
      });
      messages.sort(function (a, b) { return a.id - b.id; });
      return added;
    }

    function decryptAll(list) {
      return Promise.all(list.map(function (msg) {
        msg.text = '';
        if (msg.type === 99) { msg.text = msg.content; return Promise.resolve(msg); }
        if (msg.content === 'expired') { return Promise.resolve(msg); }
        return decryptText(msg).then(function (text) {
          msg.text = text;
          return msg;
        }).catch(function () {
          msg.text = '';
          msg.decryptFailed = true;
          return msg;
        });
      }));
    }

    function loadHistory(beforeId) {
      var q = 'message/history?conv_id=' + convId + '&limit=20' + (beforeId ? '&before_id=' + beforeId : '');
      return SC.api(q).then(function (data) {
        var list = (data.messages || []).slice().reverse();
        return decryptAll(list).then(function (decrypted) {
          if (!beforeId) {
            messages = decrypted;
            if (messages.length) { oldestId = messages[0].id; }
          } else {
            mergeMessages(decrypted);
            if (decrypted.length) { oldestId = decrypted[0].id; }
          }
          hasMore = data.has_more;
          renderAll();
          if (!beforeId) { scrollBottom(); }
          SC.poll.resetCursor((data.messages || []).reduce(function (m, x) { return Math.max(m, x.id); }, 0));
        });
      });
    }

    function scrollBottom() {
      requestAnimationFrame(function () { stream.scrollTop = stream.scrollHeight; });
    }

    stream.addEventListener('scroll', function () {
      if (stream.scrollTop < 40 && hasMore && !loadingMore) {
        loadingMore = true;
        var prevHeight = stream.scrollHeight;
        loadHistory(oldestId).then(function () {
          stream.scrollTop = stream.scrollHeight - prevHeight;
          loadingMore = false;
        }).catch(function () { loadingMore = false; });
      }
    });

    /* ------------------------------------------------------------ 发送 */
    function optimistic(text, type, extra) {
      var msg = {
        id: 'tmp_' + Date.now() + '_' + Math.floor(Math.random() * 1000),
        temp: true,
        type: type,
        content: '',
        extra: extra || null,
        status: 0,
        created_at: Math.floor(Date.now() / 1000),
        sender_public_id: SC.state.user.public_id,
        sender_name: SC.state.user.nickname,
        text: text
      };
      messages.push(msg);
      renderAll();
      scrollBottom();
      return msg;
    }

    function submitMessage(text, type, extra) {
      if (!identity || !keyForMessage(msgPlaceholder())) {
        SC.toast('加密通道未就绪，请稍后重试', 'error');
        return Promise.reject(new Error('no key'));
      }
      var msg = optimistic(text, type, extra);
      var encryptPromise = conv.type === 2
        ? SC.crypto.encryptWithKey(groupKey, convId, text)
        : SC.crypto.encrypt(identity, peerKey, convId, text);
      return encryptPromise.then(function (payload) {
        return SC.api('message/send', {
          body: {
            conv_id: convId,
            type: type,
            content: payload,
            extra: extra || null,
            client_msg_id: String(SC.state.user.public_id) + '_' + Date.now() + '_' + Math.floor(Math.random() * 100000)
          }
        });
      }).then(function (res) {
        msg.id = res.msg_id;
        msg.status = 1;
        msg.content = 'sent';
        renderAll();
        SC.poll.kick();
        return res;
      }).catch(function (err) {
        msg.status = -1;
        renderAll();
        SC.toast(err.message || '发送失败', 'error');
        throw err;
      });
    }
    function msgPlaceholder() { return { type: 1 }; }

    function sendText() {
      var input = SC.qs('#msgInput');
      if (!input) { return; }
      var text = input.value.trim();
      if (!text) { return; }
      input.value = '';
      input.style.height = 'auto';
      SC.qs('#btnSend').classList.add('hidden');
      SC.qs('#btnMore').classList.remove('hidden');
      submitMessage(text, 1, null);
    }

    function sendEmoji(code) {
      submitMessage(code, 6, null);
      emojiOpen = false;
      renderPanels();
    }

    /* ------------------------------------------------------------ 媒体 */
    function pickFile(accept, type, capture) {
      var input = document.createElement('input');
      input.type = 'file';
      if (accept) { input.accept = accept; }
      if (capture) { input.capture = 'environment'; }
      input.addEventListener('change', function () {
        var file = input.files && input.files[0];
        if (!file) { return; }
        if (type === 4 && file.size > 20 * 1048576) { SC.toast('文件超过 20 MB', 'error'); return; }
        if (type === 3 && file.size > 50 * 1048576) { SC.toast('视频超过 50 MB', 'error'); return; }
        uploadAndSend(file, type);
      });
      input.click();
    }

    function compressImage(file) {
      return new Promise(function (resolve) {
        var img = new Image();
        img.onload = function () {
          var max = 1600;
          var w = img.width, h = img.height;
          if (w > max || h > max) {
            var s = Math.min(max / w, max / h);
            w = Math.round(w * s);
            h = Math.round(h * s);
          }
          var canvas = document.createElement('canvas');
          canvas.width = w;
          canvas.height = h;
          canvas.getContext('2d').drawImage(img, 0, 0, w, h);
          canvas.toBlob(function (blob) { resolve({ blob: blob, w: w, h: h }); }, 'image/jpeg', 0.82);
        };
        img.onerror = function () { resolve({ blob: file, w: 0, h: 0 }); };
        img.src = URL.createObjectURL(file);
      });
    }

    function uploadAndSend(file, type) {
      var key = keyForMessage({});
      if (!key) { SC.toast('加密通道未就绪', 'error'); return; }
      SC.toast(type === 1 ? '正在处理图片…' : '正在上传…');
      var prep = type === 1 ? compressImage(file) : Promise.resolve({ blob: file, w: 0, h: 0 });
      prep.then(function (res) {
        var blob = res.blob;
        return blob.arrayBuffer().then(function (buf) {
          return SC.crypto.encryptBytes(key, buf);
        }).then(function (enc) {
          var fd = new FormData();
          var ext = file.name && file.name.indexOf('.') > 0 ? file.name.slice(file.name.lastIndexOf('.')) : '';
          var name = type === 1 ? 'image.jpg' : (file.name || ('file' + ext));
          fd.append('file', new Blob([enc]), name);
          fd.append('type', String(type));
          return SC.upload('upload', fd);
        }).then(function (data) {
          var extra = { media_id: data.media_id, size: file.size };
          var text = '';
          if (type === 1) { extra.w = res.w; extra.h = res.h; text = '[图片]'; }
          if (type === 3) { text = '[视频]'; }
          if (type === 4) { extra.name = file.name || '文件'; text = '[文件]'; }
          if (type === 2) { text = '[语音]'; }
          var msgType = type === 1 ? 2 : type === 3 ? 4 : type === 4 ? 5 : 3;
          return submitMessage(text, msgType, extra).then(function () {
            // 用本地预览替换占位
            mediaUrlCache[data.media_id] = URL.createObjectURL(blob);
          });
        });
      }).catch(function (err) {
        SC.toast(err.message || '上传失败', 'error');
      });
    }

    function sendLocation() {
      if (!navigator.geolocation) { SC.toast('设备不支持定位', 'error'); return; }
      SC.toast('正在获取位置…');
      navigator.geolocation.getCurrentPosition(function (pos) {
        var extra = {
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          name: '我的位置'
        };
        submitMessage('[位置]', 7, extra);
      }, function () {
        SC.toast('无法获取位置', 'error');
      }, { timeout: 8000 });
    }

    /* ------------------------------------------------------------ 录音 */
    var recorder = null, recordChunks = [], recordStart = 0;

    function toggleRecord() {
      if (recorder && recorder.state === 'recording') {
        recorder.stop();
        return;
      }
      if (!navigator.mediaDevices || !window.MediaRecorder) {
        SC.toast('浏览器不支持录音', 'error');
        return;
      }
      navigator.mediaDevices.getUserMedia({ audio: true }).then(function (streamObj) {
        recorder = new MediaRecorder(streamObj);
        recordChunks = [];
        recordStart = Date.now();
        recorder.ondataavailable = function (e) { if (e.data.size) { recordChunks.push(e.data); } };
        recorder.onstop = function () {
          var duration = Math.round((Date.now() - recordStart) / 1000);
          streamObj.getTracks().forEach(function (t) { t.stop(); });
          var blob = new Blob(recordChunks, { type: 'audio/webm' });
          if (blob.size < 400 || duration < 1) { SC.toast('录音太短'); return; }
          var key = keyForMessage({});
          if (!key) { return; }
          blob.arrayBuffer().then(function (buf) {
            return SC.crypto.encryptBytes(key, buf);
          }).then(function (enc) {
            var fd = new FormData();
            fd.append('file', new Blob([enc]), 'voice.webm');
            fd.append('type', '2');
            return SC.upload('upload', fd);
          }).then(function (data) {
            return submitMessage('[语音]', 3, { media_id: data.media_id, duration: duration });
          }).catch(function (e) { SC.toast(e.message || '语音发送失败', 'error'); });
        };
        recorder.start();
        SC.toast('录音中，再次点击结束');
      }).catch(function () { SC.toast('无法使用麦克风', 'error'); });
    }

    /* ------------------------------------------------------------ 轮询 */
    var off = SC.on('poll:messages', function (list) {
      var mine = list.filter(function (m) { return m.conv_id === convId; });
      if (!mine.length) { return; }
      decryptAll(mine).then(function (dec) {
        // 排除自己刚发出的（本地已有）
        var filtered = dec.filter(function (m) {
          return !messages.some(function (x) { return String(x.id) === String(m.id); });
        });
        if (!filtered.length) { return; }
        mergeMessages(filtered);
        renderAll();
        scrollBottom();
        SC.api('conversation/read', { body: { conv_id: convId, last_msg_id: filtered[filtered.length - 1].id } }).catch(function () {});
      });
    });
    var offRead = SC.on('poll:read', function (map) {
      var seen = map[convId];
      if (!seen) { return; }
      var changed = false;
      messages.forEach(function (m) {
        if (m.status === 1 && typeof m.id === 'number' && m.id <= seen) { m.status = 2; changed = true; }
      });
      if (changed) { renderAll(); }
    });
    SC.onRouteCleanup(function () {
      off(); offRead();
      Object.keys(mediaUrlCache).forEach(function (k) { URL.revokeObjectURL(mediaUrlCache[k]); });
    });

    /* -------------------------------------------------------- 初始化 */
    function boot() {
      renderNav();
      renderComposer();

      var convPromise = conv ? Promise.resolve(conv) : SC.store.refreshConversations().then(function () {
        conv = SC.store.getConversation(convId);
        if (!conv) { throw new Error('会话不存在'); }
        renderNav();
        return conv;
      });

      convPromise.then(function () {
        return SC.store.ensureIdentity();
      }).then(function (id) {
        identity = id;
        if (conv.type === 2) {
          return SC.store.groupKey(conv.public_id).then(function (gk) {
            groupKey = gk;
            if (!gk) {
              var tip = SC.el('div', { class: 'banner-offline', text: '群密钥尚未就绪，暂时无法解密或发送消息' });
              app.insertBefore(tip, stream);
            }
          });
        }
        return SC.crypto.peerPublicKey(conv.public_id).then(function (pk) { peerKey = pk; });
      }).then(function () {
        setupKefuStatus();
        return loadHistory(0);
      }).then(function () {
        SC.api('conversation/read', { body: { conv_id: convId, last_msg_id: messages.length ? messages[messages.length - 1].id : 0 } }).catch(function () {});
        SC.poll.start();
      }).catch(function (err) {
        stream.innerHTML = '';
        stream.appendChild(SC.ui.error(err.message || '加载失败', function () { SC.render(); }));
      });
    }

    boot();
  };
})();
