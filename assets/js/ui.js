/* SilverChat 通用界面组件 */
(function () {
  'use strict';

  var SC = window.SC = window.SC || {};

  var NAV_ICON_BACK = '<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><path d="M15 4 7 12l8 8" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>';

  SC.ui = {
    /** 顶部导航栏 HTML。right 为 HTML 片段（已转义由调用方负责）。 */
    navbar: function (opts) {
      opts = opts || {};
      var left = opts.noBack ? '<span class="navbar-left"></span>' : (
        '<button class="navbar-icon" type="button" data-nav-back aria-label="返回">' + NAV_ICON_BACK + '</button>'
      );
      var right = opts.right || '';
      return '<header class="navbar">' + left +
        '<h1 class="navbar-title">' + SC.esc(opts.title || '') + '</h1>' +
        '<div class="navbar-right">' + right + '</div></header>';
    },

    tabbar: function (active) {
      var tabs = [
        { key: 'chat', label: '消息', path: '/', icon: 'chat', fill: 'chatFill' },
        { key: 'contacts', label: '通讯录', path: '/contacts', icon: 'contacts', fill: 'contactsFill' },
        { key: 'discover', label: '发现', path: '/discover', icon: 'discover', fill: 'discoverFill' },
        { key: 'me', label: '我', path: '/me', icon: 'me', fill: 'meFill' }
      ];
      var html = '<nav class="tabbar">';
      tabs.forEach(function (t) {
        var on = t.key === active;
        var badge = '';
        if (t.key === 'chat' && SC.state.unread > 0) {
          badge = '<span class="badge-num tab-badge">' + (SC.state.unread > 99 ? '99+' : SC.state.unread) + '</span>';
        }
        if (t.key === 'contacts' && SC.state.pendingRequests > 0) {
          badge = '<span class="badge-dot"></span>';
        }
        if (t.key === 'discover' && SC.state.momentNotice > 0) {
          badge = '<span class="badge-dot"></span>';
        }
        html += '<a class="tabbar-item' + (on ? ' active' : '') + '" href="' + t.path + '" data-link>' +
          SC.icon(on ? t.fill : t.icon, 24) + '<span>' + t.label + '</span>' + badge + '</a>';
      });
      return html + '</nav>';
    },

    avatar: function (publicId, name, sizeClass, hasAvatar) {
      sizeClass = sizeClass || '';
      var initial = (name || '?').trim().charAt(0) || '?';
      var inner;
      if (publicId && hasAvatar) {
        inner = '<img src="/api/avatar/' + encodeURIComponent(publicId) + '" alt="" draggable="false" loading="lazy">';
      } else {
        var colors = ['#7a9e9f', '#8d9db6', '#b8a08a', '#8aa17c', '#a58ba5', '#8fa3bf'];
        var idx = 0;
        for (var i = 0; i < (name || '').length; i++) { idx = (idx + name.charCodeAt(i)) % colors.length; }
        inner = '<span class="avatar-fallback" style="background:' + colors[idx] + '">' + SC.esc(initial) + '</span>';
      }
      return '<span class="avatar ' + sizeClass + ' no-select">' + inner + '</span>';
    },

    empty: function (opts) {
      opts = opts || {};
      var node = SC.el('div', { class: 'empty' });
      node.innerHTML = '<svg viewBox="0 0 120 96" width="120" height="96" aria-hidden="true">' +
        '<rect x="18" y="18" width="84" height="60" rx="10" fill="#f4f4f4"/>' +
        '<path d="M38 44h44M38 56h28" stroke="#dcdcdc" stroke-width="3" stroke-linecap="round"/>' +
        '<circle cx="92" cy="26" r="10" fill="#e8f8ef"/><path d="M88 26h8M92 22v8" stroke="#07c160" stroke-width="2" stroke-linecap="round"/></svg>';
      if (opts.title) { node.appendChild(SC.el('div', { class: 'empty-title', text: opts.title })); }
      if (opts.desc) { node.appendChild(SC.el('div', { class: 'empty-desc', text: opts.desc })); }
      if (opts.action) {
        var btn = SC.el('button', { class: 'btn btn-primary btn-sm', type: 'button', text: opts.action.label });
        btn.addEventListener('click', opts.action.onClick);
        node.appendChild(btn);
      }
      return node;
    },

    error: function (msg, retry) {
      var node = SC.el('div', { class: 'error-state' }, [
        SC.el('div', { text: msg || '加载失败' })
      ]);
      if (retry) {
        var btn = SC.el('button', { class: 'btn btn-secondary btn-sm', type: 'button', text: '重试' });
        btn.addEventListener('click', retry);
        node.appendChild(btn);
      }
      return node;
    },

    skeleton: function (rows) {
      var html = '<div class="skeleton-list">';
      for (var i = 0; i < (rows || 6); i++) {
        html += '<div class="skeleton-row"><div class="sk sk-avatar"></div><div style="flex:1">' +
          '<div class="sk sk-line" style="width:' + (50 + (i % 3) * 12) + '%"></div>' +
          '<div class="sk sk-line short"></div></div></div>';
      }
      return html + '</div>';
    },

    /** 绑定所有头像加载失败的兜底显示。 */
    bindAvatars: function (root) {
      SC.qsa('.avatar img', root).forEach(function (img) {
        img.addEventListener('error', function () {
          var holder = img.parentNode;
          if (!holder || holder.dataset.fb === '1') { return; }
          holder.dataset.fb = '1';
          holder.innerHTML = '<span class="avatar-fallback" style="background:#9aa0a6">?</span>';
        });
      });
    },

    /** 页面容器（带 tabbar 的主页面） */
    mainPage: function (activeTab, contentHtml) {
      return contentHtml + SC.ui.tabbar(activeTab);
    }
  };

  /* 全局链接拦截：所有 data-link 走 History API */
  document.addEventListener('click', function (e) {
    var link = e.target.closest ? e.target.closest('[data-link]') : null;
    if (link) {
      e.preventDefault();
      var href = link.getAttribute('href');
      if (href) { SC.navigate(href); }
      return;
    }
    var back = e.target.closest ? e.target.closest('[data-nav-back]') : null;
    if (back) {
      e.preventDefault();
      if (history.length > 1) { history.back(); }
      else { SC.navigate('/'); }
    }
  });
})();
