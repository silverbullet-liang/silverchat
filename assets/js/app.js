/* 路由注册与启动 */
(function () {
  'use strict';

  var SC = window.SC;
  if (!SC) { return; }

  function auth(handler) {
    return function (params) {
      if (!SC.getToken()) {
        history.replaceState(null, '', '/login');
        SC.pages.login();
        return;
      }
      // 客服账号只能停留在工作台与具体的单聊页
      if (SC.state.user && SC.state.user.is_staff) {
        var path = (location.pathname.replace(/\/+$/, '') || '/');
        var allowed = path === '/kefu' || /^\/talk\/\d+$/.test(path);
        if (!allowed) {
          history.replaceState(null, '', '/kefu');
          SC.pages.kefu();
          return;
        }
      }
      handler(params);
    };
  }

  SC.route('/', auth(SC.pages.conversations));
  SC.route('/login', function () {
    if (SC.getToken()) { SC.navigate('/', true); return; }
    SC.pages.login();
  });
  SC.route('/register', function () {
    if (SC.getToken()) { SC.navigate('/', true); return; }
    SC.pages.register();
  });
  SC.route('/reset', SC.pages.reset);

  SC.route('/talk/:id', auth(SC.pages.chat));
  SC.route('/talk/:id/settings', auth(SC.pages.chatSettings));
  SC.route('/talk/:id/verify', auth(SC.pages.verify));
  SC.route('/search', auth(SC.pages.search));

  SC.route('/contacts', auth(SC.pages.contacts));
  SC.route('/contacts/new-friends', auth(SC.pages.newFriends));
  SC.route('/contacts/groups', auth(SC.pages.groups));
  SC.route('/contacts/add', auth(SC.pages.addFriend));
  SC.route('/contacts/blocklist', auth(SC.pages.blocklist));
  SC.route('/user/:id', auth(SC.pages.userProfile));
  SC.route('/group/create', auth(SC.pages.groupCreate));
  SC.route('/group/invite/:id', auth(SC.pages.groupInvite));
  SC.route('/group/:id', auth(SC.pages.groupProfile));

  SC.route('/discover', auth(SC.pages.discover));
  SC.route('/moments', auth(SC.pages.moments));
  SC.route('/moment/publish', auth(SC.pages.momentPublish));
  SC.route('/moment/:id', auth(SC.pages.momentDetail));

  SC.route('/me', auth(SC.pages.me));
  SC.route('/kefu', auth(SC.pages.kefu));
  SC.route('/profile', auth(SC.pages.profile));
  SC.route('/profile/edit-nickname', auth(SC.pages.editNickname));
  SC.route('/profile/edit-signature', auth(SC.pages.editSignature));
  SC.route('/profile/security', auth(SC.pages.security));
  SC.route('/settings', auth(SC.pages.settings));
  SC.route('/settings/devices', auth(SC.pages.devices));
  SC.route('/settings/about', auth(SC.pages.about));
  SC.route('/settings/legal', auth(SC.pages.legalList));

  // 法律文档由服务端直出，整页加载（不依赖 URL 重写）
  SC.route('/legal/:doc', function (params) {
    window.location.href = '/legal.php?doc=' + encodeURIComponent(params.doc);
  });

  /* ---------------------------------------------------------------- 启动 */
  var bootEl = SC.qs('#boot');

  function finish() {
    if (bootEl && bootEl.parentNode) { bootEl.parentNode.removeChild(bootEl); }
    SC.start();
  }

  function fail() {
    SC.setToken('');
    history.replaceState(null, '', '/login');
    finish();
  }

  function isSecureContextOk() {
    if (typeof window.isSecureContext === 'boolean') { return window.isSecureContext; }
    var h = location.hostname;
    return location.protocol === 'https:' || h === 'localhost' || h === '127.0.0.1' || h === '[::1]';
  }

  if (!SC.crypto || !SC.crypto.available) {
    if (bootEl) {
      var secure = isSecureContextOk();
      var title = secure ? '浏览器未提供加密接口' : '需要 HTTPS 访问';
      var desc = secure
        ? '当前浏览器未启用 Web Crypto。请检查浏览器设置（企业策略、隐私扩展）或更换最新版 Chrome、Edge、Firefox、Safari。'
        : '当前页面通过 HTTP 打开，浏览器出于安全考虑禁用了 Web Crypto，端到端加密无法工作。请改用 https:// 域名访问；本地调试请使用 http://localhost 或 http://127.0.0.1。';
      bootEl.innerHTML = '<div class="p16 text-center" style="max-width:440px;margin:0 auto">' +
        '<div class="empty-title">' + title + '</div>' +
        '<p class="muted small" style="margin-top:10px;line-height:20px">' + desc + '</p>' +
        '<p class="tiny muted" style="margin-top:14px">当前地址：' + SC.esc(location.origin) + '</p>' +
        (secure ? '' : '<p class="tiny muted" style="margin-top:8px">部署提示：在 config/config.php 中设置 <code>site.force_https = true</code>，或为站点启用证书。</p>') +
        '</div>';
    }
  } else if (!SC.getToken()) {
    if (location.pathname !== '/login' && location.pathname !== '/register' && location.pathname !== '/reset') {
      history.replaceState(null, '', '/login');
    }
    finish();
  } else {
    SC.store.boot().then(function (ok) {
      if (!ok) { fail(); return; }
      finish();
    }).catch(function () {
      fail();
    });
  }
})();
