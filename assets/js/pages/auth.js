/* 登录、注册、找回密码 */
(function () {
  'use strict';

  var SC = window.SC = window.SC || {};
  SC.pages = SC.pages || {};

  var agreementCache = null;

  function loadAgreement() {
    if (agreementCache) { return Promise.resolve(agreementCache); }
    return SC.api('legal/versions', { auth: false }).then(function (data) {
      agreementCache = data;
      return data;
    });
  }

  function logoHtml() {
    return '<div class="auth-logo">' +
      '<svg viewBox="0 0 64 64" width="40" height="40" aria-hidden="true">' +
      '<path d="M16 18h32a6 6 0 0 1 6 6v14a6 6 0 0 1-6 6H34l-10 8v-8h-8a6 6 0 0 1-6-6V24a6 6 0 0 1 6-6z" fill="#fff"/>' +
      '<circle cx="24" cy="31" r="2.6" fill="#07c160"/><circle cx="32" cy="31" r="2.6" fill="#07c160"/><circle cx="40" cy="31" r="2.6" fill="#07c160"/>' +
      '</svg></div>';
  }

  function consentHtml(prefix) {
    return '<div class="auth-consent">' +
      '<label class="checkbox"><input type="checkbox" id="' + prefix + 'Consent"><span class="box">' +
      '<svg viewBox="0 0 20 20" width="12" height="12" aria-hidden="true"><path d="M4 10.5 8 14.5 16 5.5" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>' +
      '</span><span>我已阅读并同意 <a href="/legal.php?doc=terms" target="_blank" rel="noopener">《用户协议》</a>' +
      '<a href="/legal.php?doc=privacy" target="_blank" rel="noopener">《隐私政策》</a>' +
      '<a href="/legal.php?doc=cross-border" target="_blank" rel="noopener">《跨境数据传输协议》</a></span></label></div>';
  }

  function setLoading(btn, on) {
    if (!btn) { return; }
    if (on) { btn.classList.add('btn-loading'); btn.disabled = true; }
    else { btn.classList.remove('btn-loading'); btn.disabled = false; }
  }

  function showError(msg) { SC.toast(msg, 'error'); }

  /* ----------------------------------------------------------------- 登录 */
  SC.pages.login = function () {
    var app = SC.qs('#app');
    app.innerHTML =
      '<div class="page-auth">' +
      '<div class="auth-head">' + logoHtml() +
      '<div class="auth-title">SilverChat</div>' +
      '<div class="auth-sub">端到端加密的即时通讯</div></div>' +
      '<div class="auth-form">' +
      '<label class="field"><input class="input" id="loginUser" placeholder="用户名" autocomplete="username" maxlength="20"></label>' +
      '<label class="field"><div class="input-wrap">' +
      '<input class="input" id="loginPass" type="password" placeholder="密码" autocomplete="current-password" maxlength="128">' +
      '<button class="input-eye" type="button" id="loginEye" aria-label="显示密码">' + SC.icon('eye', 20) + '</button>' +
      '</div></label>' +
      '<button class="btn btn-primary btn-block" type="button" id="loginBtn">登录</button>' +
      '</div>' +
      consentHtml('login') +
      '<div class="auth-links"><a href="/register" data-link>没有账号？立即注册</a><a href="/reset" data-link>忘记密码</a></div>' +
      '<p class="tiny muted" style="margin-top:22px;line-height:18px">加密密钥只保存在本机。在新设备登录会生成新的密钥，历史消息将无法解密。</p>' +
      '<p class="tiny muted" style="margin-top:10px">打不开或报 500？<a href="/diag.php" target="_blank" rel="noopener">运行环境自检</a></p>' +
      '</div>';

    var userEl = SC.qs('#loginUser');
    var passEl = SC.qs('#loginPass');
    var btn = SC.qs('#loginBtn');
    var consent = SC.qs('#loginConsent');

    function refresh() {
      var ready = !!(consent.checked && userEl.value.trim() && passEl.value);
      btn.setAttribute('aria-disabled', ready ? 'false' : 'true');
    }
    [userEl, passEl].forEach(function (el) { el.addEventListener('input', refresh); });
    consent.addEventListener('change', refresh);

    SC.qs('#loginEye').addEventListener('click', function () {
      var show = passEl.type === 'password';
      passEl.type = show ? 'text' : 'password';
      this.innerHTML = SC.icon(show ? 'eyeOff' : 'eye', 20);
    });

    function submit() {
      var username = userEl.value.trim();
      var password = passEl.value;
      if (!consent.checked) { showError('请先阅读并同意协议'); return; }
      if (!username || !password) { showError('请输入用户名和密码'); return; }
      setLoading(btn, true);
      SC.store.ensureIdentity().then(function (identity) {
        return SC.api('auth/login', {
          auth: false,
          body: {
            username: username,
            password: password,
            public_key: identity.publicKey,
            device_id: SC.deviceId()
          }
        });
      }).then(function (data) {
        SC.setToken(data.token);
        if (SC.getToken() !== data.token) {
          setLoading(btn, false);
          showError('浏览器禁止本地存储，无法保持登录');
          return;
        }
        SC.state.user = data.user;
        SC.state.booted = true;
        if (data.needs_reconsent) {
          return loadAgreement().then(function (agree) {
            return SC.dialog({
              title: '协议已更新',
              content: '我们更新了服务协议，请阅读并同意后继续使用。',
              confirmText: '同意并继续',
              cancelText: '稍后'
            }).then(function (ok) {
              if (!ok) { return; }
              return SC.api('auth/reconsent', { body: { consent_versions: agree.versions } });
            });
          });
        }
      }).then(function () {
        SC.toast('登录成功', 'success');
        SC.navigate(SC.state.user && SC.state.user.is_staff ? '/kefu' : '/', true);
      }).catch(function (err) {
        setLoading(btn, false);
        showError(err.message || '登录失败');
        if (err.code === 1102) { passEl.value = ''; refresh(); }
      });
    }

    btn.addEventListener('click', submit);
    passEl.addEventListener('keydown', function (e) { if (e.key === 'Enter') { submit(); } });
    setTimeout(function () { userEl.focus(); refresh(); }, 80);
    setTimeout(refresh, 600);
  };

  /* ----------------------------------------------------------------- 注册 */
  function usernameValid(name) {
    if (name.length < 2 || name.length > 20) { return { ok: false, msg: '用户名长度需为 2–20 个字符' }; }
    if (!/^[\u3400-\u4DBF\u4E00-\u9FA5A-Za-z0-9_.@#$&+\-]+$/.test(name)) {
      return { ok: false, msg: '仅支持中英文、数字和 _ - . @ # $ & +' };
    }
    if (/^[._\-]|[._\-]$/.test(name)) { return { ok: false, msg: '用户名不能以符号开头或结尾' }; }
    if (/\s/.test(name)) { return { ok: false, msg: '用户名不能包含空格' }; }
    return { ok: true, msg: '' };
  }

  function passwordScore(pw) {
    var score = 0;
    if (pw.length >= 6) { score++; }
    if (pw.length >= 10) { score++; }
    if (/[A-Za-z]/.test(pw) && /\d/.test(pw)) { score++; }
    if (/[^A-Za-z0-9]/.test(pw)) { score++; }
    return Math.min(score, 3);
  }

  SC.pages.register = function () {
    var app = SC.qs('#app');
    app.innerHTML =
      '<div class="page-auth">' +
      '<header class="navbar" style="margin:0 -28px">' +
      '<button class="navbar-icon" type="button" data-nav-back aria-label="返回">' +
      '<svg viewBox="0 0 24 24" width="22" height="22"><path d="M15 4 7 12l8 8" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg></button>' +
      '<h1 class="navbar-title">注册</h1><span class="navbar-right"></span></header>' +
      '<div class="auth-head" style="padding-top:28px"><div class="auth-title">创建账号</div>' +
      '<div class="auth-sub">设置用户名与密码，生成你的加密身份</div></div>' +
      '<div class="auth-form">' +
      '<label class="field"><span>用户名（登录凭证，注册后不可修改）</span>' +
      '<div class="input-wrap"><input class="input" id="regUser" maxlength="20" placeholder="2–20 个字符" autocomplete="username">' +
      '<span class="input-counter" id="regUserCount">0/20</span></div>' +
      '<div class="input-hint" id="regUserHint">支持中英文、数字和 _ - . @ # $ &amp; +</div></label>' +
      '<label class="field"><span>密码</span><input class="input" id="regPass" type="password" placeholder="至少 6 位" autocomplete="new-password" maxlength="128">' +
      '<div class="pw-strength" id="regStrength"><i></i><i></i><i></i></div></label>' +
      '<label class="field"><span>确认密码</span><input class="input" id="regPass2" type="password" autocomplete="new-password" maxlength="128"></label>' +
      '<label class="field"><span>昵称</span>' +
      '<div class="input-wrap"><input class="input" id="regNick" maxlength="16" placeholder="1–16 个字符">' +
      '<span class="input-counter" id="regNickCount">0/16</span></div></label>' +
      '<label class="field"><span>安全问题（用于找回密码，可选）</span>' +
      '<input class="input" id="regQuestion" maxlength="50" placeholder="例如：我的第一只宠物叫什么"></label>' +
      '<label class="field"><span>安全问题答案</span>' +
      '<input class="input" id="regAnswer" maxlength="50" placeholder="答案不区分大小写"></label>' +
      '<button class="btn btn-primary btn-block" type="button" id="regBtn">注册</button>' +
      '</div>' +
      consentHtml('reg') +
      '<div class="auth-links"><span></span><a href="/login" data-link>已有账号？去登录</a></div>' +
      '</div>';

    var userEl = SC.qs('#regUser');
    var passEl = SC.qs('#regPass');
    var pass2El = SC.qs('#regPass2');
    var nickEl = SC.qs('#regNick');
    var btn = SC.qs('#regBtn');
    var consent = SC.qs('#regConsent');
    var hint = SC.qs('#regUserHint');

    function refresh() {
      SC.qs('#regUserCount').textContent = userEl.value.length + '/20';
      SC.qs('#regNickCount').textContent = nickEl.value.length + '/16';
      var score = passwordScore(passEl.value);
      SC.qsa('#regStrength i').forEach(function (bar, i) {
        bar.className = i < score ? (score === 1 ? 'weak' : score === 2 ? 'mid' : 'on') : '';
      });
      var uv = usernameValid(userEl.value.trim());
      if (userEl.value && !uv.ok) {
        hint.className = 'input-hint-error';
        hint.textContent = uv.msg;
      } else {
        hint.className = 'input-hint';
        hint.textContent = '支持中英文、数字和 _ - . @ # $ & +';
      }
      var ok = uv.ok && passEl.value.length >= 6 && passEl.value === pass2El.value &&
        nickEl.value.trim().length >= 1 && nickEl.value.trim().length <= 16 && consent.checked;
      btn.setAttribute('aria-disabled', ok ? 'false' : 'true');
    }
    [userEl, passEl, pass2El, nickEl].forEach(function (el) { el.addEventListener('input', refresh); });
    consent.addEventListener('change', refresh);

    btn.addEventListener('click', function () {
      var username = userEl.value.trim();
      var password = passEl.value;
      var nickname = nickEl.value.trim();
      var question = SC.qs('#regQuestion').value.trim();
      var answer = SC.qs('#regAnswer').value.trim();
      if (!usernameValid(username).ok) { showError(usernameValid(username).msg); return; }
      if (!nickname || nickname.length > 16) { showError('昵称需为 1–16 个字符'); return; }
      if (password.length < 6) { showError('密码至少 6 位'); return; }
      if (password !== pass2El.value) { showError('两次密码不一致'); return; }
      if (!consent.checked) { showError('请先阅读并同意协议'); return; }

      setLoading(btn, true);
      loadAgreement().then(function (agree) {
        return SC.store.ensureIdentity().then(function (identity) {
          return SC.api('auth/register', {
            auth: false,
            body: {
              username: username,
              password: password,
              nickname: nickname,
              public_key: identity.publicKey,
              device_id: SC.deviceId(),
              consent_versions: agree.versions,
              sec_question: question,
              sec_answer: answer
            }
          });
        });
      }).then(function (data) {
        SC.setToken(data.token);
        if (SC.getToken() !== data.token) {
          setLoading(btn, false);
          showError('浏览器禁止本地存储，无法保持登录');
          return;
        }
        SC.state.user = data.user;
        SC.state.booted = true;
        SC.toast('欢迎加入', 'success');
        SC.navigate('/', true);
      }).catch(function (err) {
        setLoading(btn, false);
        showError(err.message || '注册失败');
      });
    });

    setTimeout(function () { userEl.focus(); refresh(); }, 80);
    setTimeout(refresh, 600);
  };

  /* ------------------------------------------------------------- 找回密码 */
  SC.pages.reset = function () {
    var app = SC.qs('#app');
    app.innerHTML =
      '<div class="page-auth">' +
      '<header class="navbar" style="margin:0 -28px">' +
      '<button class="navbar-icon" type="button" data-nav-back aria-label="返回">' +
      '<svg viewBox="0 0 24 24" width="22" height="22"><path d="M15 4 7 12l8 8" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg></button>' +
      '<h1 class="navbar-title">找回密码</h1><span class="navbar-right"></span></header>' +
      '<div class="auth-head" style="padding-top:28px"><div class="auth-title">重置密码</div>' +
      '<div class="auth-sub">通过注册时设置的安全问题验证身份</div></div>' +
      '<div class="auth-form">' +
      '<label class="field"><span>用户名</span><input class="input" id="rsUser" maxlength="20" autocomplete="username"></label>' +
      '<label class="field"><span>安全问题</span><input class="input" id="rsQuestion" readonly placeholder="输入用户名后自动获取"></label>' +
      '<label class="field"><span>答案</span><input class="input" id="rsAnswer" maxlength="50"></label>' +
      '<label class="field"><span>新密码</span><input class="input" id="rsPass" type="password" placeholder="至少 6 位" autocomplete="new-password"></label>' +
      '<button class="btn btn-primary btn-block" type="button" id="rsBtn">重置密码</button>' +
      '</div>' +
      '<div class="auth-links"><span></span><a href="/login" data-link>返回登录</a></div>' +
      '</div>';

    var userEl = SC.qs('#rsUser');
    var qEl = SC.qs('#rsQuestion');
    var btn = SC.qs('#rsBtn');
    var loadedName = '';

    var fetchQuestion = SC.debounce(function () {
      var name = userEl.value.trim();
      if (name.length < 2 || name === loadedName) { return; }
      loadedName = name;
      qEl.value = '获取中…';
      SC.api('auth/security_question?username=' + encodeURIComponent(name), { auth: false }).then(function (data) {
        qEl.value = data.question;
      }).catch(function () {
        qEl.value = '获取失败，请重试';
        loadedName = '';
      });
    }, 400);

    userEl.addEventListener('input', fetchQuestion);

    btn.addEventListener('click', function () {
      var username = userEl.value.trim();
      var answer = SC.qs('#rsAnswer').value.trim();
      var newPass = SC.qs('#rsPass').value;
      if (!username || !answer || newPass.length < 6) { showError('请填写完整，新密码至少 6 位'); return; }
      setLoading(btn, true);
      SC.api('auth/reset_password', {
        auth: false,
        body: { username: username, answer: answer, new_password: newPass }
      }).then(function () {
        SC.toast('密码已重置', 'success');
        setTimeout(function () { SC.navigate('/login', true); }, 600);
      }).catch(function (err) {
        setLoading(btn, false);
        showError(err.message || '重置失败');
      });
    });

    setTimeout(function () { userEl.focus(); }, 80);
  };
})();
