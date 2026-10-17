/* 客服工作台：仅客服账号可用，只处理消息 */
(function () {
  'use strict';

  var SC = window.SC = window.SC || {};
  SC.pages = SC.pages || {};

  SC.pages.kefu = function () {
    var app = SC.qs('#app');
    var user = SC.state.user;
    if (!user || !user.is_staff) {
      SC.navigate('/', true);
      return;
    }

    app.innerHTML = SC.ui.navbar({
      title: '客服工作台',
      noBack: true,
      right: '<button class="navbar-action" type="button" id="kfSwitch">切换账号</button>'
    }) + '<main class="page page-full">' +
      '<div class="kefu-desk-status" id="kfStatus"><span class="kefu-dot on"></span><span>在线接单中</span></div>' +
      '<div id="kfList">' + SC.ui.skeleton(5) + '</div></main>';

    SC.qs('#kfSwitch').addEventListener('click', function () {
      SC.dialog({ title: '切换账号', content: '退出当前客服账号并返回登录页？', confirmText: '退出', danger: true }).then(function (ok) {
        if (!ok) { return; }
        SC.api('auth/logout').catch(function () {}).then(function () {
          SC.setToken('');
          SC.state.user = null;
          SC.navigate('/login', true);
        });
      });
    });

    var listEl = SC.qs('#kfList');

    function refreshStatus(convs) {
      var pending = convs.reduce(function (n, c) { return n + (c.unread || 0); }, 0);
      var el = SC.qs('#kfStatus');
      if (el) {
        el.innerHTML = '<span class="kefu-dot on"></span><span>在线接单中 · 待回复 ' + pending + ' 条</span>';
      }
    }

    function render() {
      var convs = (SC.state.conversations || []).filter(function (c) { return c.type === 1; });
      refreshStatus(convs);
      listEl.innerHTML = '';
      if (!convs.length) {
        listEl.appendChild(SC.ui.empty({
          title: '暂无咨询',
          desc: '用户从「我 → 客服」发起的会话会出现在这里'
        }));
        return;
      }
      var list = SC.el('div', { class: 'list' });
      convs.forEach(function (conv) {
        var item = SC.el('button', { type: 'button', class: 'list-item' });
        item.innerHTML = SC.ui.avatar(conv.public_id, conv.title, 'avatar-lg', true) +
          '<span class="list-item-body">' +
          '<span class="list-item-title"><span>' + SC.esc(conv.title || '用户') + '</span>' +
          '<span class="badge-pill">' + SC.esc(conv.public_id) + '</span></span>' +
          '<span class="list-item-desc" data-summary>加密消息</span></span>' +
          '<span class="list-item-right"><span>' + SC.fmtDay(conv.last ? conv.last.created_at : conv.updated_at) + '</span>' +
          (conv.unread > 0 ? '<span class="badge-num">' + (conv.unread > 99 ? '99+' : conv.unread) + '</span>' : '') +
          '</span>';
        item.addEventListener('click', function () { SC.navigate('/chat/' + conv.conv_id); });
        list.appendChild(item);

        var sumEl = item.querySelector('[data-summary]');
        if (conv.last && conv.last.type === 99) {
          sumEl.textContent = conv.last.content || '';
        } else {
          SC.store.summary(conv).then(function (text) {
            if (sumEl && sumEl.parentNode) { sumEl.textContent = text || ''; }
          });
        }
      });
      listEl.appendChild(list);
    }

    var reload = SC.debounce(function () {
      SC.store.refreshConversations().then(render).catch(function () {});
    }, 400);

    SC.store.refreshConversations().then(render).catch(function (e) {
      listEl.innerHTML = '';
      listEl.appendChild(SC.ui.error(e.message || '加载失败', function () { SC.render(); }));
    });

    var off = SC.on('poll:messages', reload);
    var off2 = SC.on('poll:unread', reload);
    SC.onRouteCleanup(function () { off(); off2(); });

    // 工作台保持轮询：既是消息来源，也是“客服在线”的心跳
    SC.poll.start();
  };
})();
