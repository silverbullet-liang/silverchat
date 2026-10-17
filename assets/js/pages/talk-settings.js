/* 会话设置、安全码、全局搜索 */
(function () {
  'use strict';

  var SC = window.SC = window.SC || {};
  SC.pages = SC.pages || {};

  function getConv(convId) {
    return SC.store.getConversation(convId) || null;
  }

  /* --------------------------------------------------------- 会话设置 */
  SC.pages.chatSettings = function (params) {
    var convId = parseInt(params.id, 10);
    var app = SC.qs('#app');
    app.innerHTML = '<div id="csNav"></div><main class="page page-full" id="csBody">' + SC.ui.skeleton(5) + '</main>';

    function render(conv) {
      SC.qs('#csNav').innerHTML = SC.ui.navbar({ title: '聊天信息' });
      var body = SC.qs('#csBody');
      body.innerHTML = '';

      if (conv.type === 2) {
        // 群成员网格
        var grid = SC.el('div', { class: 'member-grid' });
        SC.api('group/members?public_id=' + encodeURIComponent(conv.public_id)).then(function (data) {
          (data.members || []).forEach(function (m) {
            var cell = SC.el('div', { class: 'member-cell' });
            cell.innerHTML = SC.ui.avatar(m.public_id, m.nickname, '', true) +
              '<span>' + SC.esc(m.nickname) + '</span>';
            cell.addEventListener('click', function () {
              SC.navigate('/user/' + m.public_id);
            });
            grid.appendChild(cell);
          });
          if (data.is_member) {
            var add = SC.el('button', { type: 'button', class: 'member-cell add' });
            add.innerHTML = '<span class="avatar">' + SC.icon('plus', 20) + '</span><span>邀请</span>';
            add.addEventListener('click', function () { SC.navigate('/group/invite/' + conv.public_id); });
            grid.appendChild(add);
          }
        });
        body.appendChild(grid);
      }

      var list = SC.el('div', { class: 'cell-group' });
      if (conv.type === 1) {
        list.appendChild(linkRow('对方资料', function () { SC.navigate('/user/' + conv.public_id); }));
      } else {
        list.appendChild(textRow('群名称', conv.title, function () { editGroupName(conv); }));
        list.appendChild(textRow('群公告', '查看与编辑', function () { editNotice(conv); }));
        list.appendChild(textRow('我的群昵称', '', function () { editMyNickname(conv); }));
        list.appendChild(copyRow('群号', conv.public_id));
        list.appendChild(toggleRow('仅邀请加入', conv.join_mode && conv.join_mode !== 1, function (on) {
          SC.api('group/update', { body: { public_id: conv.public_id, join_mode: on ? 2 : 1 } }).then(function () {
            conv.join_mode = on ? 2 : 1;
            SC.toast('已更新');
          }).catch(function (e) { SC.toast(e.message, 'error'); });
        }));
      }

      list.appendChild(linkRow('加密安全码', function () { SC.navigate('/talk/' + convId + '/verify'); }));
      if (conv.type === 1) {
        list.appendChild(linkRow('查找聊天记录', function () { SC.navigate('/search'); }));
      }
      list.appendChild(toggleRow('消息免打扰', conv.muted, function (on) {
        SC.api('conversation/mute', { body: { conv_id: convId, muted: on ? 1 : 0 } }).then(function () {
          conv.muted = on;
          SC.toast('已更新');
        });
      }));
      list.appendChild(toggleRow('置顶聊天', conv.pinned, function (on) {
        SC.api('conversation/pin', { body: { conv_id: convId, pinned: on ? 1 : 0 } }).then(function () {
          conv.pinned = on;
          SC.toast('已更新');
        });
      }));
      list.appendChild(linkRow('清空聊天记录', function () {
        SC.dialog({ title: '清空聊天记录', content: '仅清空你本机的显示，不影响对方。', confirmText: '清空', danger: true }).then(function (ok) {
          if (!ok) { return; }
          SC.api('conversation/delete', { body: { conv_id: convId } }).then(function () {
            SC.toast('已清空');
            SC.navigate('/', true);
          });
        });
      }));
      body.appendChild(list);

      var danger = SC.el('div', { class: 'cell-group' });
      if (conv.type === 1 && !conv.peer_is_staff) {
        danger.appendChild(dangerRow('删除好友', function () {
          SC.dialog({ title: '删除好友', content: '删除后无法恢复，聊天记录将一并隐藏。', confirmText: '删除', danger: true }).then(function (ok) {
            if (!ok) { return; }
            SC.api('friend/delete', { body: { public_id: conv.public_id } }).then(function () {
              SC.toast('已删除');
              SC.navigate('/', true);
            });
          });
        }));
      } else {
        var isOwner = conv.member_count > 0;
        danger.appendChild(dangerRow('退出群聊', function () {
          SC.dialog({
            title: '退出群聊',
            content: '退出后将不再接收该群消息。若你是群主，群主会自动转让给最早加入的成员。',
            confirmText: '退出',
            danger: true
          }).then(function (ok) {
            if (!ok) { return; }
            SC.api('group/quit', { body: { public_id: conv.public_id } }).then(function () {
              SC.toast('已退出');
              SC.navigate('/', true);
            });
          });
        }));
      }
      body.appendChild(danger);
    }

    function linkRow(label, fn) {
      var row = SC.el('button', { type: 'button', class: 'list-item no-avatar' });
      row.innerHTML = '<span class="list-item-body"><span class="list-item-title"><span>' + label + '</span></span></span>' +
        '<span class="list-item-arrow">' + SC.icon('arrow', 18) + '</span>';
      row.addEventListener('click', fn);
      return row;
    }
    function textRow(label, value, fn) {
      var row = SC.el('button', { type: 'button', class: 'list-item no-avatar' });
      row.innerHTML = '<span class="list-item-body"><span class="list-item-title"><span>' + label + '</span></span></span>' +
        '<span class="muted small">' + SC.esc(value || '') + '</span><span class="list-item-arrow">' + SC.icon('arrow', 18) + '</span>';
      row.addEventListener('click', fn);
      return row;
    }
    function copyRow(label, value) {
      var row = SC.el('button', { type: 'button', class: 'list-item no-avatar' });
      row.innerHTML = '<span class="list-item-body"><span class="list-item-title"><span>' + label + '</span></span></span>' +
        '<span class="muted small mono">' + SC.esc(value) + '</span>';
      row.addEventListener('click', function () {
        if (navigator.clipboard) { navigator.clipboard.writeText(value).then(function () { SC.toast('已复制'); }); }
      });
      return row;
    }
    function toggleRow(label, on, fn) {
      var row = SC.el('div', { class: 'list-item no-avatar' });
      row.innerHTML = '<span class="list-item-body"><span class="list-item-title"><span>' + label + '</span></span></span>' +
        '<span class="switch' + (on ? ' switch-on' : '') + '" role="switch" aria-checked="' + (on ? 'true' : 'false') + '">' +
        '<i></i></span>';
      var sw = row.querySelector('.switch');
      row.addEventListener('click', function () {
        var next = !sw.classList.contains('switch-on');
        sw.classList.toggle('switch-on', next);
        sw.setAttribute('aria-checked', next ? 'true' : 'false');
        fn(next);
      });
      return row;
    }
    function dangerRow(label, fn) {
      var row = SC.el('button', { type: 'button', class: 'list-item no-avatar danger' });
      row.innerHTML = '<span class="list-item-body"><span class="list-item-title"><span>' + label + '</span></span></span>';
      row.addEventListener('click', fn);
      return row;
    }

    function editGroupName(conv) {
      SC.dialog({ title: '群名称', input: true, value: conv.title, maxlength: 20, placeholder: '1–20 个字符' }).then(function (v) {
        if (v === null) { return; }
        SC.api('group/update', { body: { public_id: conv.public_id, name: v } }).then(function (data) {
          conv.title = data.group.name;
          SC.toast('已保存');
          render(conv);
        }).catch(function (e) { SC.toast(e.message, 'error'); });
      });
    }
    function editNotice(conv) {
      SC.dialog({ title: '群公告', input: true, textarea: true, value: conv.notice || '', maxlength: 500, placeholder: '最多 500 个字符' }).then(function (v) {
        if (v === null) { return; }
        SC.api('group/update', { body: { public_id: conv.public_id, notice: v } }).then(function () {
          SC.toast('已保存');
        }).catch(function (e) { SC.toast(e.message, 'error'); });
      });
    }
    function editMyNickname(conv) {
      SC.dialog({ title: '我的群昵称', input: true, maxlength: 16 }).then(function (v) {
        if (v === null) { return; }
        SC.api('group/update', { body: { public_id: conv.public_id, my_nickname: v } }).then(function () {
          SC.toast('已保存');
        }).catch(function (e) { SC.toast(e.message, 'error'); });
      });
    }

    if (!getConv(convId)) {
      SC.store.refreshConversations().then(function () {
        var c = getConv(convId);
        if (!c) { SC.qs('#csBody').innerHTML = ''; SC.qs('#csBody').appendChild(SC.ui.error('会话不存在')); return; }
        render(c);
      });
    } else {
      render(getConv(convId));
    }
  };

  /* ------------------------------------------------------------- 安全码 */
  SC.pages.verify = function (params) {
    var convId = parseInt(params.id, 10);
    var app = SC.qs('#app');
    app.innerHTML = SC.ui.navbar({ title: '加密安全码' }) +
      '<main class="page page-full" id="vfBody"><div class="p16 muted small">正在计算…</div></main>';

    function render(conv, identity, peerPublicKey) {
      var body = SC.qs('#vfBody');
      body.innerHTML = '';
      var card = SC.el('div', { class: 'code-card' });
      card.appendChild(SC.el('p', { class: 'small muted', text: '对比双方安全码，完全一致则说明通信没有中间人。请通过线下或电话等带外方式核对。' }));

      var codeEl = SC.el('div', { class: 'safety-code', text: '' });
      card.appendChild(codeEl);

      var statusEl = SC.el('div', { style: 'margin-bottom:14px' });
      card.appendChild(statusEl);

      var storageKey = 'sc_verify_' + conv.public_id;
      var peerHashPromise = SC.crypto.peerKeyHash(peerPublicKey);

      SC.crypto.safetyCode(identity, peerPublicKey).then(function (groups) {
        codeEl.textContent = '';
        groups.forEach(function (g) { codeEl.appendChild(SC.el('span', { text: g })); });
      }).catch(function (e) {
        codeEl.textContent = '无法计算：' + e.message;
      });

      peerHashPromise.then(function (hash) {
        var saved = null;
        try { saved = JSON.parse(localStorage.getItem(storageKey) || 'null'); } catch (e) {}
        var state = 'warn';
        if (saved && saved.hash === hash) { state = 'ok'; }
        else if (saved && saved.hash !== hash) { state = 'bad'; }

        statusEl.innerHTML = state === 'ok'
          ? '<span class="shield shield-ok">' + SC.icon('shield', 16) + ' 已验证 ' + SC.esc(saved.at) + '</span>'
          : state === 'bad'
            ? '<span class="shield shield-bad">' + SC.icon('shield', 16) + ' 对方安全码已改变，请重新验证</span>'
            : '<span class="shield shield-warn">' + SC.icon('shield', 16) + ' 尚未验证</span>';

        var btn = SC.el('button', { class: 'btn ' + (state === 'ok' ? 'btn-secondary' : 'btn-primary') + ' btn-block', type: 'button',
          text: state === 'ok' ? '取消验证' : '标记为已验证' });
        btn.addEventListener('click', function () {
          if (state === 'ok') {
            localStorage.removeItem(storageKey);
            SC.toast('已取消验证');
            SC.render();
          } else {
            var d = new Date();
            var at = d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2) + '-' + ('0' + d.getDate()).slice(-2);
            localStorage.setItem(storageKey, JSON.stringify({ hash: hash, at: at }));
            SC.toast('已标记', 'success');
            render(conv, identity, peerPublicKey);
          }
        });
        card.appendChild(btn);
      });

      var note = SC.el('p', { class: 'tiny muted', style: 'margin-top:14px;line-height:18px',
        text: '安全码由双方公钥计算得出。若服务器替换了公钥，安全码将不一致。' });
      card.appendChild(note);
      body.appendChild(card);
    }

    var conv = getConv(convId);
    var promise = conv ? Promise.resolve(conv) : SC.store.refreshConversations().then(function () { return getConv(convId); });
    promise.then(function (c) {
      if (!c) { throw new Error('会话不存在'); }
      return Promise.all([SC.store.ensureIdentity(), SC.crypto.peerPublicKey(c.public_id)]).then(function (arr) {
        render(c, arr[0], arr[1]);
      });
    }).catch(function (e) {
      SC.qs('#vfBody').innerHTML = '';
      SC.qs('#vfBody').appendChild(SC.ui.error(e.message || '无法计算安全码'));
    });
  };

  /* ------------------------------------------------------------- 搜索 */
  SC.pages.search = function () {
    var app = SC.qs('#app');
    app.innerHTML = '<div class="search-bar">' +
      '<div class="search-input-wrap">' + SC.icon('search', 18) +
      '<input id="searchInput" placeholder="搜索好友、群聊、会话" autocomplete="off"></div>' +
      '<button class="search-cancel" type="button" id="searchCancel">取消</button></div>' +
      '<main class="page page-full" id="searchBody"></main>';

    var input = SC.qs('#searchInput');
    var body = SC.qs('#searchBody');
    SC.qs('#searchCancel').addEventListener('click', function () {
      if (history.length > 1) { history.back(); } else { SC.navigate('/'); }
    });

    function row(title, desc, onClick) {
      var item = SC.el('button', { type: 'button', class: 'list-item no-avatar' });
      item.innerHTML = '<span class="list-item-body"><span class="list-item-title"><span>' + SC.esc(title) + '</span></span>' +
        (desc ? '<span class="list-item-desc">' + SC.esc(desc) + '</span>' : '') + '</span>';
      item.addEventListener('click', onClick);
      return item;
    }

    var doSearch = SC.debounce(function () {
      var q = input.value.trim();
      if (!q) { body.innerHTML = ''; return; }
      body.innerHTML = SC.ui.skeleton(3);
      SC.api('search?q=' + encodeURIComponent(q)).then(function (data) {
        body.innerHTML = '';
        var total = (data.conversations || []).length + (data.friends || []).length + (data.groups || []).length;
        if (!total) {
          body.appendChild(SC.ui.empty({ title: '未找到相关内容', desc: '换个关键词试试' }));
          return;
        }
        if ((data.conversations || []).length) {
          body.appendChild(SC.el('div', { class: 'list-group-title', text: '会话' }));
          var l1 = SC.el('div', { class: 'list' });
          data.conversations.forEach(function (c) {
            l1.appendChild(row(c.title, c.type === 2 ? '群聊' : '单聊', function () { SC.navigate('/talk/' + c.conv_id); }));
          });
          body.appendChild(l1);
        }
        if ((data.friends || []).length) {
          body.appendChild(SC.el('div', { class: 'list-group-title', text: '好友' }));
          var l2 = SC.el('div', { class: 'list' });
          data.friends.forEach(function (f) {
            l2.appendChild(row(f.remark || f.nickname, f.public_id, function () { SC.navigate('/user/' + f.public_id); }));
          });
          body.appendChild(l2);
        }
        if ((data.groups || []).length) {
          body.appendChild(SC.el('div', { class: 'list-group-title', text: '群聊' }));
          var l3 = SC.el('div', { class: 'list' });
          data.groups.forEach(function (g) {
            l3.appendChild(row(g.name, g.public_id, function () {
              SC.navigate(g.conv_id ? '/talk/' + g.conv_id : '/group/' + g.public_id);
            }));
          });
          body.appendChild(l3);
        }
      }).catch(function (e) {
        body.innerHTML = '';
        body.appendChild(SC.ui.error(e.message || '搜索失败'));
      });
    }, 300);

    input.addEventListener('input', doSearch);
    setTimeout(function () { input.focus(); }, 80);
  };
})();
