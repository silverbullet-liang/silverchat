/* 通讯录、好友、群资料与建群 */
(function () {
  'use strict';

  var SC = window.SC = window.SC || {};
  SC.pages = SC.pages || {};

  function initialOf(name) {
    var c = (name || '').trim().charAt(0).toUpperCase();
    return /[A-Z]/.test(c) ? c : '#';
  }

  function goBackOrHome() {
    if (history.length > 1) { history.back(); } else { SC.navigate('/'); }
  }

  /* ------------------------------------------------------------- 通讯录 */
  SC.pages.contacts = function () {
    var app = SC.qs('#app');
    app.innerHTML = SC.ui.navbar({
      title: '通讯录',
      noBack: true,
      right: '<button class="navbar-icon" type="button" id="ctAdd" aria-label="添加">' + SC.icon('plus', 22) + '</button>'
    }) + '<main class="page"><div id="ctBody">' + SC.ui.skeleton(6) + '</div></main>' + SC.ui.tabbar('contacts');

    SC.qs('#ctAdd').addEventListener('click', function () {
      SC.actions([{ label: '添加朋友' }, { label: '发起群聊' }]).then(function (idx) {
        if (idx === 0) { SC.navigate('/contacts/add'); }
        if (idx === 1) { SC.navigate('/group/create'); }
      });
    });

    var body = SC.qs('#ctBody');

    Promise.all([SC.store.refreshFriends(), SC.api('friend/requests').catch(function () { return { incoming: [] }; })]).then(function (arr) {
      var friends = arr[0] || [];
      var pending = (arr[1].incoming || []).filter(function (r) { return r.status === 0; }).length;
      SC.state.pendingRequests = pending;
      body.innerHTML = '';

      var fixed = SC.el('div', { class: 'list' });
      fixed.appendChild(function () {
        var item = SC.el('button', { type: 'button', class: 'list-item' });
        item.innerHTML = '<span class="avatar" style="background:#fa9d3b;display:flex;align-items:center;justify-content:center;color:#fff">' + SC.icon('users', 20) + '</span>' +
          '<span class="list-item-body"><span class="list-item-title"><span>新的朋友</span></span></span>' +
          (pending ? '<span class="badge-num">' + pending + '</span>' : '') +
          '<span class="list-item-arrow">' + SC.icon('arrow', 18) + '</span>';
        item.addEventListener('click', function () { SC.navigate('/contacts/new-friends'); });
        return item;
      }());
      fixed.appendChild(function () {
        var item = SC.el('button', { type: 'button', class: 'list-item' });
        item.innerHTML = '<span class="avatar" style="background:#10aeff;display:flex;align-items:center;justify-content:center;color:#fff">' + SC.icon('chat', 20) + '</span>' +
          '<span class="list-item-body"><span class="list-item-title"><span>群聊</span></span></span>' +
          '<span class="list-item-arrow">' + SC.icon('arrow', 18) + '</span>';
        item.addEventListener('click', function () { SC.navigate('/contacts/groups'); });
        return item;
      }());
      fixed.appendChild(function () {
        var item = SC.el('button', { type: 'button', class: 'list-item' });
        item.innerHTML = '<span class="avatar" style="background:#8d9db6;display:flex;align-items:center;justify-content:center;color:#fff">' + SC.icon('block', 20) + '</span>' +
          '<span class="list-item-body"><span class="list-item-title"><span>黑名单</span></span></span>' +
          '<span class="list-item-arrow">' + SC.icon('arrow', 18) + '</span>';
        item.addEventListener('click', function () { SC.navigate('/contacts/blocklist'); });
        return item;
      }());
      body.appendChild(fixed);

      if (!friends.length) {
        body.appendChild(SC.ui.empty({ title: '通讯录还是空的', desc: '添加朋友开始聊天', action: { label: '添加朋友', onClick: function () { SC.navigate('/contacts/add'); } } }));
        return;
      }

      var starred = friends.filter(function (f) { return f.starred; });
      var groups = {};
      friends.forEach(function (f) {
        var name = f.remark || f.nickname || '?';
        var k = initialOf(name);
        (groups[k] = groups[k] || []).push(f);
      });
      var keys = Object.keys(groups).sort(function (a, b) {
        if (a === '#') { return 1; }
        if (b === '#') { return -1; }
        return a.localeCompare(b);
      });

      if (starred.length) {
        var sg = SC.el('div', { class: 'list' });
        sg.appendChild(SC.el('div', { class: 'list-group-title', text: '星标朋友' }));
        starred.forEach(function (f) { sg.appendChild(friendRow(f)); });
        body.appendChild(sg);
      }

      keys.forEach(function (k) {
        var g = SC.el('div', { class: 'list', id: 'grp-' + (k === '#' ? 'hash' : k) });
        g.appendChild(SC.el('div', { class: 'list-group-title', text: k }));
        groups[k].sort(function (a, b) { return (a.remark || a.nickname).localeCompare(b.remark || b.nickname, 'zh-Hans-CN'); });
        groups[k].forEach(function (f) { g.appendChild(friendRow(f)); });
        body.appendChild(g);
      });

      if (keys.length > 3) {
        var idxBar = SC.el('div', { class: 'index-bar' });
        keys.forEach(function (k) {
          var b = SC.el('button', { type: 'button', text: k });
          b.addEventListener('click', function () {
            var el = SC.qs('#grp-' + (k === '#' ? 'hash' : k));
            if (el) { el.scrollIntoView({ behavior: 'smooth', block: 'start' }); }
          });
          idxBar.appendChild(b);
        });
        body.appendChild(idxBar);
      }
    }).catch(function (e) {
      body.innerHTML = '';
      body.appendChild(SC.ui.error(e.message || '加载失败', function () { SC.render(); }));
    });

    function friendRow(f) {
      var name = f.remark || f.nickname;
      var item = SC.el('button', { type: 'button', class: 'list-item' });
      item.innerHTML = SC.ui.avatar(f.public_id, name, 'avatar-lg', true) +
        '<span class="list-item-body"><span class="list-item-title"><span>' + SC.esc(name) + '</span></span></span>';
      item.addEventListener('click', function () { SC.navigate('/user/' + f.public_id); });
      bindLong(f, item);
      return item;
    }

    function bindLong(f, node) {
      var timer = 0;
      function open() {
        var acts = [
          { label: f.remark ? '修改备注' : '设置备注' },
          { label: f.starred ? '取消星标' : '设为星标' },
          { label: f.blocked ? '解除拉黑' : '加入黑名单', danger: !f.blocked },
          { label: '删除好友', danger: true }
        ];
        SC.actions(acts, f.remark || f.nickname).then(function (idx) {
          if (idx === 0) {
            SC.dialog({ title: '设置备注', input: true, value: f.remark || '', maxlength: 16 }).then(function (v) {
              if (v === null) { return; }
              SC.api('friend/remark', { body: { public_id: f.public_id, remark: v } }).then(function () {
                SC.toast('已保存'); SC.render();
              });
            });
          } else if (idx === 1) {
            SC.api('friend/star', { body: { public_id: f.public_id, starred: f.starred ? 0 : 1 } }).then(function () {
              SC.toast('已更新'); SC.render();
            });
          } else if (idx === 2) {
            SC.api('friend/block', { body: { public_id: f.public_id, blocked: f.blocked ? 0 : 1 } }).then(function () {
              SC.toast('已更新'); SC.render();
            });
          } else if (idx === 3) {
            SC.dialog({ title: '删除好友', content: '删除后无法恢复，确定删除该好友？', confirmText: '删除', danger: true }).then(function (ok) {
              if (!ok) { return; }
              SC.api('friend/delete', { body: { public_id: f.public_id } }).then(function () { SC.toast('已删除'); SC.render(); });
            });
          }
        });
      }
      node.addEventListener('touchstart', function () {
        clearTimeout(timer);
        timer = setTimeout(open, 480);
      }, { passive: true });
      node.addEventListener('touchend', function () { clearTimeout(timer); });
      node.addEventListener('touchmove', function () { clearTimeout(timer); });
      node.addEventListener('contextmenu', function (e) { e.preventDefault(); open(); });
    }
  };

  /* --------------------------------------------------------- 新的朋友 */
  SC.pages.newFriends = function () {
    var app = SC.qs('#app');
    app.innerHTML = SC.ui.navbar({
      title: '新的朋友',
      right: '<button class="navbar-action primary" type="button" id="nfAdd">添加朋友</button>'
    }) + '<main class="page page-full"><div id="nfBody">' + SC.ui.skeleton(4) + '</div></main>';

    SC.qs('#nfAdd').addEventListener('click', function () { SC.navigate('/contacts/add'); });
    var body = SC.qs('#nfBody');

    function render(items) {
      body.innerHTML = '';
      if (!items.length) {
        body.appendChild(SC.ui.empty({ title: '暂无新的朋友', desc: '添加朋友后会在这里显示' }));
        return;
      }
      var list = SC.el('div', { class: 'list' });
      items.forEach(function (r) {
        var row = SC.el('div', { class: 'list-item' });
        row.innerHTML = SC.ui.avatar(r.public_id, r.nickname, 'avatar-lg', true) +
          '<span class="list-item-body"><span class="list-item-title"><span>' + SC.esc(r.nickname) + '</span></span>' +
          '<span class="list-item-desc">' + SC.esc(r.message || '') + '</span></span>';
        var right = SC.el('span', { class: 'list-item-right' });
        if (r.status === 0) {
          var ok = SC.el('button', { class: 'btn btn-primary btn-sm', type: 'button', text: '接受' });
          ok.addEventListener('click', function () {
            SC.api('friend/handle', { body: { id: r.id, action: 'accept' } }).then(function () {
              ok.textContent = '已添加';
              ok.disabled = true;
              SC.toast('已添加');
              SC.store.refreshFriends();
            }).catch(function (e) { SC.toast(e.message, 'error'); });
          });
          var no = SC.el('button', { class: 'btn btn-secondary btn-sm', type: 'button', text: '拒绝' });
          no.addEventListener('click', function () {
            SC.api('friend/handle', { body: { id: r.id, action: 'reject' } }).then(function () {
              row.parentNode.removeChild(row);
            });
          });
          right.appendChild(ok);
          right.appendChild(no);
        } else if (r.status === 1) {
          right.innerHTML = '<span class="muted small">已添加</span>';
        } else if (r.status === 2) {
          right.innerHTML = '<span class="muted small">已拒绝</span>';
        }
        row.appendChild(right);
        list.appendChild(row);
      });
      body.appendChild(list);
    }

    SC.api('friend/requests').then(function (data) {
      var items = (data.incoming || []).filter(function (r) { return r.status === 0; })
        .concat((data.outgoing || []).filter(function (r) { return r.status === 0; }));
      render(items);
    }).catch(function (e) {
      body.innerHTML = '';
      body.appendChild(SC.ui.error(e.message || '加载失败', function () { SC.render(); }));
    });
  };

  /* ------------------------------------------------------------- 我的群聊 */
  SC.pages.groups = function () {
    var app = SC.qs('#app');
    app.innerHTML = SC.ui.navbar({
      title: '群聊',
      right: '<button class="navbar-action primary" type="button" id="grpCreate">发起群聊</button>'
    }) + '<main class="page page-full"><div id="grpBody">' + SC.ui.skeleton(4) + '</div></main>';
    SC.qs('#grpCreate').addEventListener('click', function () { SC.navigate('/group/create'); });

    var body = SC.qs('#grpBody');
    SC.api('group/list').then(function (data) {
      var groups = data.groups || [];
      SC.state.groups = groups;
      body.innerHTML = '';
      if (!groups.length) {
        body.appendChild(SC.ui.empty({ title: '还没有群聊', desc: '创建一个群聊，把朋友聚起来', action: { label: '发起群聊', onClick: function () { SC.navigate('/group/create'); } } }));
        return;
      }
      var list = SC.el('div', { class: 'list' });
      groups.forEach(function (g) {
        var item = SC.el('button', { type: 'button', class: 'list-item' });
        item.innerHTML = SC.ui.avatar(g.public_id, g.name, 'avatar-lg', true) +
          '<span class="list-item-body"><span class="list-item-title"><span>' + SC.esc(g.name) + '</span></span>' +
          '<span class="list-item-desc">' + g.member_count + ' 人 · ' + SC.esc(g.public_id) + '</span></span>' +
          '<span class="list-item-arrow">' + SC.icon('arrow', 18) + '</span>';
        item.addEventListener('click', function () {
          if (g.conv_id) { SC.navigate('/chat/' + g.conv_id); }
          else { SC.navigate('/group/' + g.public_id); }
        });
        list.appendChild(item);
      });
      body.appendChild(list);
    }).catch(function (e) {
      body.innerHTML = '';
      body.appendChild(SC.ui.error(e.message || '加载失败', function () { SC.render(); }));
    });
  };

  /* ------------------------------------------------------- 添加朋友/加群 */
  SC.pages.addFriend = function () {
    var app = SC.qs('#app');
    app.innerHTML = SC.ui.navbar({ title: '添加朋友' }) +
      '<main class="page page-full">' +
      '<div class="search-bar"><div class="search-input-wrap">' + SC.icon('search', 18) +
      '<input id="afInput" placeholder="账号 sc_xxx 或群号 gp_xxx" autocomplete="off"></div>' +
      '<button class="navbar-action primary" type="button" id="afSearch">搜索</button></div>' +
      '<div id="afBody" class="p16"></div></main>';

    var input = SC.qs('#afInput');
    var body = SC.qs('#afBody');

    function search() {
      var q = input.value.trim();
      body.innerHTML = '';
      if (!q) { return; }
      if (q.indexOf('sc_') !== 0 && q.indexOf('gp_') !== 0) {
        body.appendChild(SC.el('div', { class: 'alert alert-warn', text: '账号以 sc_ 开头，群号以 gp_ 开头' }));
        return;
      }
      body.innerHTML = SC.ui.skeleton(2);
      if (q.indexOf('gp_') === 0) {
        SC.api('group/search?q=' + encodeURIComponent(q)).then(function (data) {
          renderGroup(data.group);
        }).catch(function (e) {
          body.innerHTML = '';
          body.appendChild(SC.ui.empty({ title: '没有找到该群', desc: e.message || '' }));
        });
      } else {
        SC.api('friend/search?q=' + encodeURIComponent(q)).then(function (data) {
          renderUser(data);
        }).catch(function (e) {
          body.innerHTML = '';
          body.appendChild(SC.ui.empty({ title: '没有找到该用户', desc: e.message || '' }));
        });
      }
    }

    function renderUser(data) {
      body.innerHTML = '';
      var card = SC.el('div', { class: 'code-card', style: 'text-align:left;display:flex;gap:14px;align-items:center' });
      card.innerHTML = SC.ui.avatar(data.user.public_id, data.user.nickname, 'avatar-xl', true) +
        '<div style="flex:1;min-width:0"><div style="font-size:17px;font-weight:600">' + SC.esc(data.user.nickname) + '</div>' +
        '<div class="muted small">' + SC.esc(data.user.public_id) + '</div>' +
        '<div class="muted small">' + SC.esc(data.user.signature || '') + '</div></div>';
      body.appendChild(card);

      var btn = SC.el('button', { class: 'btn btn-block ', type: 'button' });
      if (data.is_self) {
        btn.className += 'btn-secondary'; btn.textContent = '这是你自己'; btn.disabled = true;
      } else if (data.is_friend) {
        btn.className += 'btn-secondary'; btn.textContent = '已是好友'; btn.disabled = true;
      } else if (data.has_pending) {
        btn.className += 'btn-secondary'; btn.textContent = '已发送申请'; btn.disabled = true;
      } else {
        btn.className += 'btn-primary'; btn.textContent = '添加到通讯录';
        btn.addEventListener('click', function () {
          SC.dialog({ title: '验证申请', input: true, value: '我是' + (SC.state.user.nickname || ''), maxlength: 50, placeholder: '填写验证信息' }).then(function (msg) {
            if (msg === null) { return; }
            SC.api('friend/request', { body: { to_public_id: data.user.public_id, message: msg } }).then(function () {
              SC.toast('申请已发送');
              btn.textContent = '已发送申请';
              btn.disabled = true;
              btn.className = 'btn btn-secondary btn-block';
            }).catch(function (e) { SC.toast(e.message, 'error'); });
          });
        });
      }
      body.appendChild(btn);
    }

    function renderGroup(g) {
      body.innerHTML = '';
      var card = SC.el('div', { class: 'code-card', style: 'text-align:left;display:flex;gap:14px;align-items:center' });
      card.innerHTML = SC.ui.avatar(g.public_id, g.name, 'avatar-xl', true) +
        '<div style="flex:1;min-width:0"><div style="font-size:17px;font-weight:600">' + SC.esc(g.name) + '</div>' +
        '<div class="muted small">' + SC.esc(g.public_id) + ' · ' + g.member_count + ' 人</div></div>';
      body.appendChild(card);

      var btn = SC.el('button', { class: 'btn btn-block ', type: 'button' });
      if (g.is_member) {
        btn.className += 'btn-secondary'; btn.textContent = '已在群中'; btn.disabled = true;
      } else if (g.join_mode !== 1) {
        btn.className += 'btn-secondary'; btn.textContent = '该群需邀请加入'; btn.disabled = true;
      } else {
        btn.className += 'btn-primary'; btn.textContent = '加入群聊';
        btn.addEventListener('click', function () {
          SC.api('group/join', { body: { public_id: g.public_id } }).then(function (data) {
            SC.toast('已加入群聊', 'success');
            setTimeout(function () { SC.navigate('/chat/' + data.conv_id, true); }, 500);
          }).catch(function (e) { SC.toast(e.message, 'error'); });
        });
      }
      body.appendChild(btn);
    }

    SC.qs('#afSearch').addEventListener('click', search);
    input.addEventListener('keydown', function (e) { if (e.key === 'Enter') { search(); } });
    setTimeout(function () { input.focus(); }, 80);
  };

  /* -------------------------------------------------------------- 黑名单 */
  SC.pages.blocklist = function () {
    var app = SC.qs('#app');
    app.innerHTML = SC.ui.navbar({ title: '黑名单' }) + '<main class="page page-full"><div id="blBody">' + SC.ui.skeleton(3) + '</div></main>';
    var body = SC.qs('#blBody');
    SC.api('friend/blocklist').then(function (data) {
      body.innerHTML = '';
      if (!data.users.length) {
        body.appendChild(SC.ui.empty({ title: '黑名单为空', desc: '被拉黑的用户会显示在这里' }));
        return;
      }
      var list = SC.el('div', { class: 'list' });
      data.users.forEach(function (u) {
        var row = SC.el('div', { class: 'list-item' });
        row.innerHTML = SC.ui.avatar(u.public_id, u.nickname, 'avatar-lg', true) +
          '<span class="list-item-body"><span class="list-item-title"><span>' + SC.esc(u.nickname) + '</span></span></span>';
        var btn = SC.el('button', { class: 'btn btn-secondary btn-sm', type: 'button', text: '解除' });
        btn.addEventListener('click', function () {
          SC.dialog({ title: '解除拉黑', content: '解除后可正常接收对方消息。', confirmText: '解除' }).then(function (ok) {
            if (!ok) { return; }
            SC.api('friend/block', { body: { public_id: u.public_id, blocked: 0 } }).then(function () {
              row.parentNode.removeChild(row);
              SC.toast('已解除');
            });
          });
        });
        row.appendChild(btn);
        list.appendChild(row);
      });
      body.appendChild(list);
    });
  };

  /* ------------------------------------------------------------ 用户资料 */
  SC.pages.userProfile = function (params) {
    var app = SC.qs('#app');
    app.innerHTML = SC.ui.navbar({
      title: '',
      right: '<button class="navbar-icon" type="button" id="upMore" aria-label="更多">' + SC.icon('more', 22) + '</button>'
    }) + '<main class="page page-full"><div id="upBody">' + SC.ui.skeleton(3) + '</div></main>';

    var body = SC.qs('#upBody');
    var current = null;

    SC.api('user/info?public_id=' + encodeURIComponent(params.id)).then(function (data) {
      current = data;
      var u = data.user;
      var name = u.nickname;
      body.innerHTML = '';
      var hero = SC.el('div', { class: 'profile-hero' });
      hero.innerHTML = SC.ui.avatar(u.public_id, name, 'avatar-xl', true) +
        '<div><div class="profile-name">' + SC.esc(name) + '</div>' +
        '<div class="profile-id">' + SC.esc(u.public_id) + ' <button class="btn-text small" type="button" id="upCopy">复制</button></div>' +
        '<div class="muted small" style="margin-top:4px">' + (u.gender === 1 ? '男' : u.gender === 2 ? '女' : '') + '</div></div>';
      body.appendChild(hero);

      if (u.signature) {
        var sig = SC.el('div', { class: 'list-item no-avatar' });
        sig.innerHTML = '<span class="list-item-body"><span class="list-item-desc">' + SC.esc(u.signature) + '</span></span>';
        body.appendChild(sig);
      }

      var acts = SC.el('div', { class: 'profile-actions' });
      var btn = SC.el('button', { class: 'btn btn-block', type: 'button' });
      if (data.is_self) {
        btn.className += 'btn-secondary'; btn.textContent = '编辑我的资料';
        btn.addEventListener('click', function () { SC.navigate('/profile'); });
      } else if (data.is_friend) {
        btn.className += 'btn-primary'; btn.textContent = '发消息';
        btn.addEventListener('click', function () { openChat(u.public_id); });
      } else if (data.has_pending) {
        btn.className += 'btn-secondary'; btn.textContent = '已发送申请'; btn.disabled = true;
      } else {
        btn.className += 'btn-primary'; btn.textContent = '添加到通讯录';
        btn.addEventListener('click', function () {
          SC.dialog({ title: '验证申请', input: true, value: '我是' + (SC.state.user.nickname || ''), maxlength: 50 }).then(function (msg) {
            if (msg === null) { return; }
            SC.api('friend/request', { body: { to_public_id: u.public_id, message: msg } }).then(function () {
              SC.toast('申请已发送');
              btn.textContent = '已发送申请';
              btn.className = 'btn btn-secondary btn-block';
            }).catch(function (e) { SC.toast(e.message, 'error'); });
          });
        });
      }
      acts.appendChild(btn);
      body.appendChild(acts);

      SC.qs('#upCopy').addEventListener('click', function () {
        if (navigator.clipboard) { navigator.clipboard.writeText(u.public_id).then(function () { SC.toast('已复制'); }); }
      });

      var moreBtn = SC.qs('#upMore');
      if (data.is_self || !data.is_friend) { moreBtn.classList.add('hidden'); }
      moreBtn.addEventListener('click', function () {
        SC.actions([
          { label: current.remark ? '修改备注' : '设置备注' },
          { label: current.blocked ? '解除拉黑' : '加入黑名单', danger: !current.blocked },
          { label: '删除好友', danger: true }
        ]).then(function (idx) {
          if (idx === 0) {
            SC.dialog({ title: '设置备注', input: true, value: current.remark || '', maxlength: 16 }).then(function (v) {
              if (v === null) { return; }
              SC.api('friend/remark', { body: { public_id: u.public_id, remark: v } }).then(function () {
                SC.toast('已保存'); SC.render();
              });
            });
          } else if (idx === 1) {
            SC.api('friend/block', { body: { public_id: u.public_id, blocked: current.blocked ? 0 : 1 } }).then(function () {
              SC.toast('已更新'); SC.render();
            });
          } else if (idx === 2) {
            SC.dialog({ title: '删除好友', content: '删除后无法恢复，确定删除该好友？', confirmText: '删除', danger: true }).then(function (ok) {
              if (!ok) { return; }
              SC.api('friend/delete', { body: { public_id: u.public_id } }).then(function () {
                SC.toast('已删除'); SC.navigate('/contacts', true);
              });
            });
          }
        });
      });
    }).catch(function (e) {
      body.innerHTML = '';
      body.appendChild(SC.ui.error(e.message || '加载失败', function () { SC.render(); }));
    });

    function openChat(publicId) {
      SC.store.refreshConversations().then(function (convs) {
        var conv = convs.filter(function (c) { return c.type === 1 && c.public_id === publicId; })[0];
        if (conv) { SC.navigate('/chat/' + conv.conv_id); }
        else { SC.toast('会话尚未建立，请稍后重试'); }
      });
    }
  };

  /* ------------------------------------------------------------- 群资料 */
  SC.pages.groupProfile = function (params) {
    var app = SC.qs('#app');
    app.innerHTML = SC.ui.navbar({ title: '群资料' }) + '<main class="page page-full"><div id="gpBody">' + SC.ui.skeleton(4) + '</div></main>';
    var body = SC.qs('#gpBody');

    Promise.all([SC.api('group/search?q=' + encodeURIComponent(params.id)), SC.api('group/members?public_id=' + encodeURIComponent(params.id))]).then(function (arr) {
      var g = arr[0].group;
      var members = arr[1].members || [];
      body.innerHTML = '';
      var hero = SC.el('div', { class: 'profile-hero' });
      hero.innerHTML = SC.ui.avatar(g.public_id, g.name, 'avatar-xl', true) +
        '<div><div class="profile-name">' + SC.esc(g.name) + '</div>' +
        '<div class="profile-id">' + SC.esc(g.public_id) + ' <button class="btn-text small" type="button" id="gpCopy">复制</button></div>' +
        '<div class="muted small" style="margin-top:4px">' + g.member_count + ' 人 · ' + (g.join_mode === 1 ? '可搜索加入' : '仅邀请加入') + '</div></div>';
      body.appendChild(hero);
      SC.qs('#gpCopy').addEventListener('click', function () {
        if (navigator.clipboard) { navigator.clipboard.writeText(g.public_id).then(function () { SC.toast('已复制'); }); }
      });

      if (g.notice) {
        var notice = SC.el('div', { class: 'cell-group' });
        var row = SC.el('div', { class: 'list-item no-avatar' });
        row.innerHTML = '<span class="list-item-body"><span class="list-item-title"><span>群公告</span></span>' +
          '<span class="list-item-desc" style="white-space:normal">' + SC.esc(g.notice) + '</span></span>';
        notice.appendChild(row);
        body.appendChild(notice);
      }

      var grid = SC.el('div', { class: 'member-grid' });
      members.slice(0, 15).forEach(function (m) {
        var cell = SC.el('div', { class: 'member-cell' });
        cell.innerHTML = SC.ui.avatar(m.public_id, m.nickname, '', true) + '<span>' + SC.esc(m.nickname) + '</span>';
        cell.addEventListener('click', function () { SC.navigate('/user/' + m.public_id); });
        grid.appendChild(cell);
      });
      body.appendChild(grid);

      var acts = SC.el('div', { class: 'profile-actions' });
      var btn = SC.el('button', { class: 'btn btn-block', type: 'button' });
      if (g.is_member) {
        btn.className += 'btn-primary'; btn.textContent = '进入群聊';
        btn.addEventListener('click', function () {
          SC.store.refreshConversations().then(function (convs) {
            var conv = convs.filter(function (c) { return c.type === 2 && c.public_id === g.public_id; })[0];
            if (conv) { SC.navigate('/chat/' + conv.conv_id); }
          });
        });
      } else if (g.join_mode !== 1) {
        btn.className += 'btn-secondary'; btn.textContent = '该群需邀请加入'; btn.disabled = true;
      } else {
        btn.className += 'btn-primary'; btn.textContent = '加入群聊';
        btn.addEventListener('click', function () {
          SC.api('group/join', { body: { public_id: g.public_id } }).then(function (data) {
            SC.toast('已加入群聊', 'success');
            setTimeout(function () { SC.navigate('/chat/' + data.conv_id, true); }, 500);
          }).catch(function (e) { SC.toast(e.message, 'error'); });
        });
      }
      acts.appendChild(btn);

      if (g.is_member) {
        var invite = SC.el('button', { class: 'btn btn-secondary btn-block mt8', type: 'button', text: '邀请好友' });
        invite.addEventListener('click', function () { SC.navigate('/group/invite/' + g.public_id); });
        acts.appendChild(invite);
      }
      body.appendChild(acts);
    }).catch(function (e) {
      body.innerHTML = '';
      body.appendChild(SC.ui.error(e.message || '加载失败', function () { SC.render(); }));
    });
  };

  /* ------------------------------------------------------------- 建群 */
  SC.pages.groupCreate = function () {
    var app = SC.qs('#app');
    app.innerHTML = SC.ui.navbar({
      title: '发起群聊',
      right: '<button class="navbar-action primary" type="button" id="gcDone" disabled>完成(0)</button>'
    }) + '<main class="page page-full"><div class="search-bar"><div class="search-input-wrap">' + SC.icon('search', 18) +
      '<input id="gcSearch" placeholder="搜索好友"></div></div><div id="gcList">' + SC.ui.skeleton(5) + '</div></main>';

    var selected = {};
    var friends = [];
    var doneBtn = SC.qs('#gcDone');

    SC.store.refreshFriends().then(function (list) {
      friends = list.filter(function (f) { return !f.blocked; });
      renderList('');
    });

    function renderList(q) {
      var host = SC.qs('#gcList');
      host.innerHTML = '';
      var filtered = friends.filter(function (f) {
        if (!q) { return true; }
        var name = (f.remark || f.nickname) + ' ' + f.public_id;
        return name.toLowerCase().indexOf(q.toLowerCase()) >= 0;
      });
      if (!filtered.length) {
        host.appendChild(SC.ui.empty({ title: '没有可选的好友', desc: '先去添加朋友' }));
        return;
      }
      var list = SC.el('div', { class: 'list' });
      filtered.forEach(function (f) {
        var name = f.remark || f.nickname;
        var row = SC.el('button', { type: 'button', class: 'check-item' + (selected[f.public_id] ? ' on' : '') });
        row.innerHTML = '<span class="box">' + (selected[f.public_id] ? SC.icon('check', 12) : '') + '</span>' +
          SC.ui.avatar(f.public_id, name, 'avatar', true) +
          '<span style="flex:1">' + SC.esc(name) + '</span>';
        row.addEventListener('click', function () {
          if (selected[f.public_id]) { delete selected[f.public_id]; }
          else {
            if (Object.keys(selected).length >= 49) { SC.toast('群成员上限 50 人'); return; }
            selected[f.public_id] = f;
          }
          var n = Object.keys(selected).length;
          doneBtn.textContent = '完成(' + n + ')';
          doneBtn.disabled = n === 0;
          renderList(SC.qs('#gcSearch').value.trim());
        });
        list.appendChild(row);
      });
      host.appendChild(list);
    }

    SC.qs('#gcSearch').addEventListener('input', function () { renderList(this.value.trim()); });

    doneBtn.addEventListener('click', function () {
      var chosen = Object.keys(selected).map(function (k) { return selected[k]; });
      if (!chosen.length) { return; }
      SC.dialog({ title: '群名称', input: true, placeholder: '可跳过，默认用你的昵称命名', maxlength: 20, required: false }).then(function (name) {
        if (name === null) { return; }
        createGroup(chosen, name);
      });
    });

    function createGroup(chosen, name) {
      SC.toast('正在创建群聊…');
      SC.store.ensureIdentity().then(function (identity) {
        var gk = SC.crypto.generateGroupKey();
        var wraps = chosen.map(function (f) {
          return SC.crypto.wrapGroupKey(identity, f.public_key, gk).then(function (wrapped) {
            return { user_public_id: f.public_id, wrapped: wrapped };
          });
        });
        // 自己也封装一份，便于换设备时恢复
        wraps.push(SC.crypto.wrapGroupKey(identity, identity.publicKey, gk).then(function (wrapped) {
          return { user_public_id: SC.state.user.public_id, wrapped: wrapped };
        }));
        return Promise.all(wraps).then(function (list) {
          return SC.api('group/create', {
            body: {
              name: name || '',
              member_public_ids: chosen.map(function (f) { return f.public_id; }),
              group_key_wraps: list
            }
          });
        }).then(function (data) {
          return SC.store.refreshConversations().then(function () {
            var conv = SC.store.getConversation(
              (SC.state.conversations.filter(function (c) { return c.public_id === data.group.public_id; })[0] || {}).conv_id
            );
            var convId = conv ? conv.conv_id : 0;
            if (convId) {
              // 缓存群密钥，避免二次解封
              SC.store.setGroupKey(data.group.public_id, gk);
              SC.navigate('/chat/' + convId, true);
            } else {
              SC.navigate('/contacts/groups', true);
            }
          });
        });
      }).catch(function (e) {
        SC.toast(e.message || '创建失败', 'error');
      });
    }
  };

  /* ------------------------------------------------------------- 邀请 */
  SC.pages.groupInvite = function (params) {
    var app = SC.qs('#app');
    app.innerHTML = SC.ui.navbar({
      title: '邀请好友',
      right: '<button class="navbar-action primary" type="button" id="giDone" disabled>完成(0)</button>'
    }) + '<main class="page page-full"><div id="giList">' + SC.ui.skeleton(5) + '</div></main>';

    var groupId = params.id;
    var selected = {};
    var doneBtn = SC.qs('#giDone');
    var members = [];

    Promise.all([
      SC.store.refreshFriends(),
      SC.api('group/members?public_id=' + encodeURIComponent(groupId))
    ]).then(function (arr) {
      members = (arr[1].members || []).map(function (m) { return m.public_id; });
      var candidates = (arr[0] || []).filter(function (f) { return members.indexOf(f.public_id) < 0; });
      var host = SC.qs('#giList');
      host.innerHTML = '';
      if (!candidates.length) {
        host.appendChild(SC.ui.empty({ title: '没有可邀请的好友', desc: '好友都已在群中' }));
        return;
      }
      var list = SC.el('div', { class: 'list' });
      candidates.forEach(function (f) {
        var name = f.remark || f.nickname;
        var row = SC.el('button', { type: 'button', class: 'check-item' });
        row.innerHTML = '<span class="box"></span>' + SC.ui.avatar(f.public_id, name, 'avatar', true) + '<span style="flex:1">' + SC.esc(name) + '</span>';
        row.addEventListener('click', function () {
          if (selected[f.public_id]) { delete selected[f.public_id]; row.classList.remove('on'); row.querySelector('.box').innerHTML = ''; }
          else {
            selected[f.public_id] = f;
            row.classList.add('on');
            row.querySelector('.box').innerHTML = SC.icon('check', 12);
          }
          var n = Object.keys(selected).length;
          doneBtn.textContent = '完成(' + n + ')';
          doneBtn.disabled = n === 0;
        });
        list.appendChild(row);
      });
      host.appendChild(list);
    });

    doneBtn.addEventListener('click', function () {
      var chosen = Object.keys(selected).map(function (k) { return selected[k]; });
      if (!chosen.length) { return; }
      SC.toast('正在邀请…');
      SC.store.ensureIdentity().then(function (identity) {
        return SC.store.groupKeyRaw(groupId).then(function (gkBytes) {
          if (!gkBytes) { throw new Error('群密钥未就绪，请让群主重新邀请'); }
          return SC.api('group/invite', { body: { public_id: groupId, user_public_ids: chosen.map(function (f) { return f.public_id; }) } })
            .then(function () {
              var jobs = chosen.map(function (f) {
                return SC.crypto.wrapGroupKey(identity, f.public_key, gkBytes).then(function (wrapped) {
                  return SC.api('group/key', { body: { public_id: groupId, user_public_id: f.public_id, wrapped: wrapped } });
                });
              });
              return Promise.all(jobs);
            });
        });
      }).then(function () {
        SC.toast('已邀请', 'success');
        SC.navigate('/group/' + groupId, true);
      }).catch(function (e) {
        SC.toast(e.message || '邀请失败', 'error');
      });
    });
  };
})();
