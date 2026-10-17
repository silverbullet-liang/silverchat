/* 我、资料、账号安全、设置、法律入口 */
(function () {
  'use strict';

  var SC = window.SC = window.SC || {};
  SC.pages = SC.pages || {};

  /** 多字段表单弹窗，返回 {field: value} 或 null */
  function formDialog(title, fields, confirmText) {
    return new Promise(function (resolve) {
      var mask = SC.el('div', { class: 'mask' });
      var content = SC.el('div', { class: 'dialog-content left' });
      var inputs = {};
      fields.forEach(function (f) {
        var wrap = SC.el('label', { class: 'field' });
        wrap.appendChild(SC.el('span', { text: f.label }));
        var input = SC.el('input', {
          class: 'input',
          type: f.password ? 'password' : 'text',
          placeholder: f.placeholder || '',
          maxlength: f.maxlength || 100
        });
        if (f.value) { input.value = f.value; }
        wrap.appendChild(input);
        content.appendChild(wrap);
        inputs[f.key] = input;
      });
      var cancel = SC.el('button', { type: 'button', text: '取消' });
      var ok = SC.el('button', { type: 'button', class: 'primary', text: confirmText || '确定' });
      var dialog = SC.el('div', { class: 'dialog' }, [
        SC.el('div', { class: 'dialog-title', text: title }),
        content,
        SC.el('div', { class: 'dialog-actions' }, [cancel, ok])
      ]);
      mask.appendChild(dialog);
      document.body.appendChild(mask);
      function close(v) {
        if (mask.parentNode) { mask.parentNode.removeChild(mask); }
        resolve(v);
      }
      cancel.addEventListener('click', function () { close(null); });
      ok.addEventListener('click', function () {
        var out = {};
        fields.forEach(function (f) { out[f.key] = inputs[f.key].value.trim(); });
        close(out);
      });
      mask.addEventListener('click', function (e) { if (e.target === mask) { close(null); } });
      if (fields[0] && inputs[fields[0].key]) { setTimeout(function () { inputs[fields[0].key].focus(); }, 50); }
    });
  }

  function clearUserCaches(keepKeys) {
    var keep = keepKeys || [];
    try {
      var keys = [];
      for (var i = 0; i < localStorage.length; i++) { keys.push(localStorage.key(i)); }
      keys.forEach(function (k) {
        if (keep.indexOf(k) >= 0) { return; }
        if (k === 'sc_token' || k === 'sc_device') { return; }
        if (k.indexOf('sc_pk_') === 0 || k === 'sc_emoji' || k.indexOf('sc_verify_') === 0) {
          localStorage.removeItem(k);
        }
      });
    } catch (e) {}
  }

  /* ---------------------------------------------------------------- 我 */
  SC.pages.me = function () {
    var app = SC.qs('#app');
    var u = SC.state.user;

    function render() {
      u = SC.state.user;
      app.innerHTML = SC.ui.navbar({
        title: '我',
        noBack: true,
        right: '<button class="navbar-icon" type="button" id="meSettingsTop" aria-label="设置">' + SC.icon('settings', 21) + '</button>'
      }) +
        '<main class="page">' +
        '<div class="me-hero">' +
        '<span id="meAvatar">' + SC.ui.avatar(u.public_id, u.nickname, 'avatar-xxl', true) + '</span>' +
        '<div><div class="name">' + SC.esc(u.nickname) + '</div><div class="id">' + SC.esc(u.public_id) + '</div></div>' +
        '</div>' +
        '<div class="cell-group">' +
        '<button class="list-item" type="button" id="meMoments">' +
        '<span class="avatar avatar-sm" style="background:#07c160;display:flex;align-items:center;justify-content:center;color:#fff">' + SC.icon('image', 16) + '</span>' +
        '<span class="list-item-body"><span class="list-item-title"><span>动态</span></span></span>' +
        '<span class="list-item-arrow">' + SC.icon('arrow', 18) + '</span></button>' +
        '<button class="list-item" type="button" id="meFav">' +
        '<span class="avatar avatar-sm" style="background:#fa9d3b;display:flex;align-items:center;justify-content:center;color:#fff">' + SC.icon('star', 16) + '</span>' +
        '<span class="list-item-body"><span class="list-item-title"><span>收藏</span></span></span>' +
        '<span class="list-item-arrow">' + SC.icon('arrow', 18) + '</span></button>' +
        '</div>' +
        '<div class="cell-group">' +
        '<button class="list-item" type="button" id="meKefu">' +
        '<span class="avatar avatar-sm" style="background:#10aeff;display:flex;align-items:center;justify-content:center;color:#fff">' + SC.icon('users', 16) + '</span>' +
        '<span class="list-item-body"><span class="list-item-title"><span>客服</span></span>' +
        '<span class="list-item-desc" id="meKefuStatus">发送消息或图片，获取帮助</span></span>' +
        '<span class="list-item-arrow">' + SC.icon('arrow', 18) + '</span></button>' +
        '</div>' +
        '<div class="cell-group">' +
        '<button class="list-item" type="button" id="meLegal">' +
        '<span class="avatar avatar-sm" style="background:#8d9db6;display:flex;align-items:center;justify-content:center;color:#fff">' + SC.icon('doc', 16) + '</span>' +
        '<span class="list-item-body"><span class="list-item-title"><span>隐私与法律</span></span></span>' +
        '<span class="list-item-arrow">' + SC.icon('arrow', 18) + '</span></button>' +
        '</div>' +
        '<div class="cell-group">' +
        '<button class="list-item" type="button" id="meSettings">' +
        '<span class="avatar avatar-sm" style="background:#7a9e9f;display:flex;align-items:center;justify-content:center;color:#fff">' + SC.icon('settings', 16) + '</span>' +
        '<span class="list-item-body"><span class="list-item-title"><span>设置</span></span></span>' +
        '<span class="list-item-arrow">' + SC.icon('arrow', 18) + '</span></button>' +
        '</div>' +
        '</main>' + SC.ui.tabbar('me');

      SC.qs('#meAvatar').addEventListener('click', function () { SC.navigate('/profile'); });
      SC.qs('#meMoments').addEventListener('click', function () { SC.navigate('/moments'); });
      SC.qs('#meFav').addEventListener('click', function () { SC.toast('敬请期待'); });
      SC.qs('#meLegal').addEventListener('click', function () { SC.navigate('/settings/legal'); });
      SC.qs('#meKefu').addEventListener('click', function () {
        SC.api('kefu/start', { body: {} }).then(function (data) {
          if (!data.kefu.has_key) {
            SC.toast('客服尚未上线，请稍后再试', 'error');
            return;
          }
          return SC.store.refreshConversations().then(function () {
            SC.navigate('/talk/' + data.conv_id);
          });
        }).catch(function (e) { SC.toast(e.message || '客服暂不可用', 'error'); });
      });
      SC.api('kefu/status').then(function (s) {
        var el = SC.qs('#meKefuStatus');
        if (!el) { return; }
        if (!s.exists) { el.textContent = '客服尚未开通'; return; }
        el.textContent = s.online ? '客服在线' : (s.has_key ? '客服离线，可留言' : '客服尚未上线');
        el.style.color = s.online ? 'var(--color-primary)' : '';
      }).catch(function () {});
      SC.qs('#meSettings').addEventListener('click', function () { SC.navigate('/settings'); });
      SC.qs('#meSettingsTop').addEventListener('click', function () { SC.navigate('/settings'); });
    }

    if (!SC.state.user) {
      SC.api('auth/me').then(function (d) {
        SC.state.user = d.user;
        render();
      }).catch(function () { SC.navigate('/login', true); });
    } else {
      render();
    }
  };

  /* ------------------------------------------------------------- 个人信息 */
  SC.pages.profile = function () {
    var app = SC.qs('#app');

    function render() {
      var u = SC.state.user;
      app.innerHTML = SC.ui.navbar({ title: '个人信息' }) +
        '<main class="page page-full">' +
        '<div class="cell-group">' +
        '<div class="list-item"><span class="list-item-body"><span class="list-item-title"><span>头像</span></span></span>' +
        '<button type="button" id="pfAvatar" style="background:none">' + SC.ui.avatar(u.public_id, u.nickname, 'avatar-lg', true) + '</button>' +
        '<span class="list-item-arrow">' + SC.icon('arrow', 18) + '</span></div>' +
        '<button class="list-item no-avatar" type="button" id="pfNick"><span class="list-item-body"><span class="list-item-title"><span>昵称</span></span></span>' +
        '<span class="muted small">' + SC.esc(u.nickname) + '</span><span class="list-item-arrow">' + SC.icon('arrow', 18) + '</span></button>' +
        '<button class="list-item no-avatar" type="button" id="pfId"><span class="list-item-body"><span class="list-item-title"><span>账号</span></span></span>' +
        '<span class="muted small mono">' + SC.esc(u.public_id) + '</span><span class="list-item-arrow">' + SC.icon('arrow', 18) + '</span></button>' +
        '<button class="list-item no-avatar" type="button" id="pfGender"><span class="list-item-body"><span class="list-item-title"><span>性别</span></span></span>' +
        '<span class="muted small">' + (u.gender === 1 ? '男' : u.gender === 2 ? '女' : '未设置') + '</span><span class="list-item-arrow">' + SC.icon('arrow', 18) + '</span></button>' +
        '<button class="list-item no-avatar" type="button" id="pfSign"><span class="list-item-body"><span class="list-item-title"><span>个性签名</span></span></span>' +
        '<span class="muted small ellipsis" style="max-width:180px">' + SC.esc(u.signature || '未设置') + '</span><span class="list-item-arrow">' + SC.icon('arrow', 18) + '</span></button>' +
        '</div>' +
        '<div class="cell-group"><button class="list-item no-avatar" type="button" id="pfSecurity">' +
        '<span class="list-item-body"><span class="list-item-title"><span>账号与安全</span></span></span>' +
        '<span class="list-item-arrow">' + SC.icon('arrow', 18) + '</span></button></div>' +
        '</main>';

      SC.qs('#pfAvatar').addEventListener('click', uploadAvatar);
      SC.qs('#pfNick').addEventListener('click', function () { SC.navigate('/profile/edit-nickname'); });
      SC.qs('#pfSign').addEventListener('click', function () { SC.navigate('/profile/edit-signature'); });
      SC.qs('#pfSecurity').addEventListener('click', function () { SC.navigate('/profile/security'); });
      SC.qs('#pfId').addEventListener('click', function () {
        if (navigator.clipboard) { navigator.clipboard.writeText(u.public_id).then(function () { SC.toast('已复制'); }); }
      });
      SC.qs('#pfGender').addEventListener('click', function () {
        SC.actions([{ label: '不显示' }, { label: '男' }, { label: '女' }]).then(function (idx) {
          if (idx < 0) { return; }
          var g = [0, 1, 2][idx];
          SC.api('user/profile', { body: { gender: g } }).then(function (d) {
            SC.state.user = d.user;
            render();
            SC.toast('已保存');
          });
        });
      });
    }

    function uploadAvatar() {
      var input = document.createElement('input');
      input.type = 'file';
      input.accept = 'image/*';
      input.addEventListener('change', function () {
        var file = input.files && input.files[0];
        if (!file) { return; }
        if (file.size > 5 * 1048576) { SC.toast('图片超过 5 MB', 'error'); return; }
        var fd = new FormData();
        fd.append('avatar', file);
        SC.toast('正在上传…');
        SC.upload('user/avatar', fd).then(function (data) {
          SC.state.user = data.user;
          render();
          SC.toast('已更新', 'success');
        }).catch(function (e) { SC.toast(e.message || '上传失败', 'error'); });
      });
      input.click();
    }

    if (!SC.state.user) { SC.navigate('/login', true); return; }
    render();
  };

  /* --------------------------------------------------------- 编辑昵称/签名 */
  SC.pages.editNickname = function () {
    var app = SC.qs('#app');
    var u = SC.state.user;
    app.innerHTML = SC.ui.navbar({
      title: '修改昵称',
      right: '<button class="navbar-action primary" type="button" id="enSave">保存</button>'
    }) + '<main class="page page-full"><div class="p16" style="background:#fff">' +
      '<input class="input" id="enInput" maxlength="16" value="' + SC.esc(u.nickname) + '" placeholder="1–16 个字符">' +
      '<div class="input-counter" style="position:static;text-align:right;margin-top:6px" id="enCount">' + u.nickname.length + '/16</div></div></main>';

    var input = SC.qs('#enInput');
    input.addEventListener('input', function () {
      SC.qs('#enCount').textContent = input.value.length + '/16';
    });
    SC.qs('#enSave').addEventListener('click', function () {
      var v = input.value.trim();
      if (!v || v.length > 16) { SC.toast('昵称需为 1–16 个字符', 'error'); return; }
      SC.api('user/profile', { body: { nickname: v } }).then(function (d) {
        SC.state.user = d.user;
        SC.toast('已保存', 'success');
        SC.navigate('/profile', true);
      }).catch(function (e) { SC.toast(e.message, 'error'); });
    });
    setTimeout(function () { input.focus(); }, 80);
  };

  SC.pages.editSignature = function () {
    var app = SC.qs('#app');
    var u = SC.state.user;
    app.innerHTML = SC.ui.navbar({
      title: '个性签名',
      right: '<button class="navbar-action primary" type="button" id="esSave">保存</button>'
    }) + '<main class="page page-full"><div class="p16" style="background:#fff">' +
      '<textarea class="textarea" id="esInput" maxlength="60" placeholder="介绍一下自己">' + SC.esc(u.signature || '') + '</textarea>' +
      '<div style="text-align:right;margin-top:6px" class="tiny muted" id="esCount">' + (u.signature || '').length + '/60</div></div></main>';

    var input = SC.qs('#esInput');
    input.addEventListener('input', function () { SC.qs('#esCount').textContent = input.value.length + '/60'; });
    SC.qs('#esSave').addEventListener('click', function () {
      SC.api('user/profile', { body: { signature: input.value.trim() } }).then(function (d) {
        SC.state.user = d.user;
        SC.toast('已保存', 'success');
        SC.navigate('/profile', true);
      }).catch(function (e) { SC.toast(e.message, 'error'); });
    });
    setTimeout(function () { input.focus(); }, 80);
  };

  /* ------------------------------------------------------------ 账号安全 */
  SC.pages.security = function () {
    var app = SC.qs('#app');
    app.innerHTML = SC.ui.navbar({ title: '账号与安全' }) + '<main class="page page-full"><div id="secBody">' + SC.ui.skeleton(4) + '</div></main>';
    var body = SC.qs('#secBody');

    function render() {
      body.innerHTML = '';
      var list = SC.el('div', { class: 'cell-group' });
      list.appendChild(row('修改密码', function () {
        formDialog('修改密码', [
          { key: 'old', label: '当前密码', password: true },
          { key: 'new1', label: '新密码（至少 6 位）', password: true },
          { key: 'new2', label: '确认新密码', password: true }
        ]).then(function (v) {
          if (!v) { return; }
          if (v.new1.length < 6) { SC.toast('新密码至少 6 位', 'error'); return; }
          if (v.new1 !== v.new2) { SC.toast('两次密码不一致', 'error'); return; }
          SC.api('user/password', { body: { old_password: v.old, new_password: v.new1 } }).then(function () {
            SC.setToken('');
            SC.toast('密码已修改，请重新登录', 'success');
            setTimeout(function () { SC.navigate('/login', true); }, 800);
          }).catch(function (e) { SC.toast(e.message, 'error'); });
        });
      }));
      list.appendChild(row('安全问题', function () {
        formDialog('设置安全问题', [
          { key: 'q', label: '问题', placeholder: '例如：我的第一只宠物叫什么' },
          { key: 'a', label: '答案' }
        ]).then(function (v) {
          if (!v) { return; }
          if (!v.q || !v.a) { SC.toast('请填写完整', 'error'); return; }
          SC.api('user/security_question', { body: { question: v.q, answer: v.a } }).then(function () {
            SC.toast('已保存', 'success');
          }).catch(function (e) { SC.toast(e.message, 'error'); });
        });
      }));
      body.appendChild(list);

      var devTitle = SC.el('div', { class: 'list-group-title', text: '登录设备' });
      body.appendChild(devTitle);
      var devList = SC.el('div', { class: 'list' });
      SC.api('auth/devices').then(function (data) {
        (data.devices || []).forEach(function (d) {
          var item = SC.el('div', { class: 'list-item no-avatar' });
          var label = d.current ? '本机' : (d.user_agent || '未知设备');
          item.innerHTML = '<span class="list-item-body"><span class="list-item-title"><span>' + SC.esc(label.slice(0, 40)) + '</span></span>' +
            '<span class="list-item-desc">' + (d.current ? '当前在线' : '最近活跃 ' + SC.fmtDay(d.last_seen_at)) + '</span></span>';
          if (!d.current) {
            var kick = SC.el('button', { class: 'btn btn-secondary btn-sm', type: 'button', text: '下线' });
            kick.addEventListener('click', function () {
              SC.dialog({ title: '下线设备', content: '该设备需要重新登录。', confirmText: '下线', danger: true }).then(function (ok) {
                if (!ok) { return; }
                SC.api('auth/kick', { body: { device_id: d.device_id } }).then(function () {
                  item.parentNode.removeChild(item);
                  SC.toast('已下线');
                });
              });
            });
            item.appendChild(kick);
          }
          devList.appendChild(item);
        });
        body.appendChild(devList);
      });

      var danger = SC.el('div', { class: 'cell-group' });
      var out = SC.el('button', { type: 'button', class: 'list-item no-avatar danger' });
      out.innerHTML = '<span class="list-item-body"><span class="list-item-title"><span>注销账号</span></span></span>';
      out.addEventListener('click', deleteAccount);
      danger.appendChild(out);
      body.appendChild(danger);
    }

    function row(label, fn) {
      var b = SC.el('button', { type: 'button', class: 'list-item no-avatar' });
      b.innerHTML = '<span class="list-item-body"><span class="list-item-title"><span>' + label + '</span></span></span>' +
        '<span class="list-item-arrow">' + SC.icon('arrow', 18) + '</span>';
      b.addEventListener('click', fn);
      return b;
    }

    function deleteAccount() {
      SC.dialog({
        title: '注销账号',
        content: '注销后所有数据将被删除，且无法恢复。确定继续？',
        confirmText: '继续',
        danger: true
      }).then(function (ok) {
        if (!ok) { return; }
        formDialog('验证密码', [{ key: 'password', label: '输入密码以确认注销', password: true }], '确认注销').then(function (v) {
          if (!v) { return; }
          SC.dialog({ title: '最后确认', content: '确认注销账号？此操作不可撤销。', confirmText: '注销', danger: true }).then(function (final) {
            if (!final) { return; }
            SC.api('account/delete', { body: { password: v.password } }).then(function () {
              SC.setToken('');
              SC.toast('账号已注销');
              setTimeout(function () { SC.navigate('/login', true); }, 700);
            }).catch(function (e) { SC.toast(e.message, 'error'); });
          });
        });
      });
    }

    render();
  };

  /* ---------------------------------------------------------------- 设置 */
  SC.pages.settings = function () {
    var app = SC.qs('#app');
    app.innerHTML = SC.ui.navbar({ title: '设置' }) +
      '<main class="page page-full">' +
      '<div class="cell-group">' +
      '<button class="list-item no-avatar" type="button" id="stDevices"><span class="list-item-body"><span class="list-item-title"><span>登录设备</span></span></span><span class="list-item-arrow">' + SC.icon('arrow', 18) + '</span></button>' +
      '<button class="list-item no-avatar" type="button" id="stLegal"><span class="list-item-body"><span class="list-item-title"><span>隐私与法律</span></span></span><span class="list-item-arrow">' + SC.icon('arrow', 18) + '</span></button>' +
      '<button class="list-item no-avatar" type="button" id="stCache"><span class="list-item-body"><span class="list-item-title"><span>清空缓存</span></span></span><span class="list-item-arrow">' + SC.icon('arrow', 18) + '</span></button>' +
      '<button class="list-item no-avatar" type="button" id="stAbout"><span class="list-item-body"><span class="list-item-title"><span>关于</span></span></span><span class="muted small">' + SC.version + '</span><span class="list-item-arrow">' + SC.icon('arrow', 18) + '</span></button>' +
      '</div>' +
      '<div class="cell-group"><button class="list-item no-avatar danger" type="button" id="stLogout"><span class="list-item-body"><span class="list-item-title"><span>退出登录</span></span></span></button></div>' +
      '</main>';

    SC.qs('#stLegal').addEventListener('click', function () { SC.navigate('/settings/legal'); });
    SC.qs('#stDevices').addEventListener('click', function () { SC.navigate('/settings/devices'); });
    SC.qs('#stAbout').addEventListener('click', function () { SC.navigate('/settings/about'); });
    SC.qs('#stCache').addEventListener('click', function () {
      SC.dialog({ title: '清空缓存', content: '清空表情、头像与公钥缓存，不影响聊天记录和本机私钥。', confirmText: '清空' }).then(function (ok) {
        if (!ok) { return; }
        clearUserCaches();
        SC.toast('已清空', 'success');
      });
    });
    SC.qs('#stLogout').addEventListener('click', function () {
      SC.dialog({ title: '退出登录', content: '确定退出登录？', confirmText: '退出', danger: true }).then(function (ok) {
        if (!ok) { return; }
        SC.api('auth/logout').catch(function () {}).then(function () {
          SC.setToken('');
          SC.state.user = null;
          SC.navigate('/login', true);
        });
      });
    });
  };

  /* ---------------------------------------------------------------- 关于 */
  SC.pages.about = function () {
    var app = SC.qs('#app');
    app.innerHTML = SC.ui.navbar({ title: '关于' }) +
      '<main class="page page-full">' +
      '<div class="p16 text-center" style="background:#fff;padding-top:36px;padding-bottom:28px">' +
      '<svg viewBox="0 0 64 64" width="72" height="72" style="margin:0 auto 12px"><rect x="2" y="2" width="60" height="60" rx="16" fill="#07c160"/>' +
      '<path d="M18 22h28a6 6 0 0 1 6 6v12a6 6 0 0 1-6 6H32l-9 7v-7h-5a6 6 0 0 1-6-6V28a6 6 0 0 1 6-6z" fill="#fff"/>' +
      '<circle cx="26" cy="34" r="2.4" fill="#07c160"/><circle cx="34" cy="34" r="2.4" fill="#07c160"/><circle cx="42" cy="34" r="2.4" fill="#07c160"/></svg>' +
      '<div style="font-size:19px;font-weight:600">SilverChat</div>' +
      '<div class="muted small" style="margin-top:4px">版本 ' + SC.version + '</div>' +
      '</div>' +
      '<div class="cell-group">' +
      '<a class="list-item no-avatar" href="/legal.php?doc=terms"><span class="list-item-body"><span class="list-item-title"><span>用户协议</span></span></span><span class="list-item-arrow">' + SC.icon('arrow', 18) + '</span></a>' +
      '<a class="list-item no-avatar" href="/legal.php?doc=privacy"><span class="list-item-body"><span class="list-item-title"><span>隐私政策</span></span></span><span class="list-item-arrow">' + SC.icon('arrow', 18) + '</span></a>' +
      '<a class="list-item no-avatar" href="/legal.php?doc=cross-border"><span class="list-item-body"><span class="list-item-title"><span>跨境数据传输协议</span></span></span><span class="list-item-arrow">' + SC.icon('arrow', 18) + '</span></a>' +
      '</div>' +
      '<div class="p16 muted small" style="line-height:22px">' +
      '<p>消息端到端加密，密钥只保存在本机浏览器。服务器只转发密文，无法读取聊天内容。</p>' +
      '<p style="margin-top:8px">动态文字与图片、用户名与昵称等采用服务器端加密存储，用于满足业务查询与多端展示；这部分数据在数据库被单独拖走时仍是密文。</p>' +
      '</div></main>';
  };

  /* ----------------------------------------------------------- 隐私与法律 */
  SC.pages.legalList = function () {
    var app = SC.qs('#app');
    app.innerHTML = SC.ui.navbar({ title: '隐私与法律' }) + '<main class="page page-full"><div id="lgBody">' + SC.ui.skeleton(3) + '</div></main>';
    var body = SC.qs('#lgBody');

    Promise.all([
      SC.api('legal/versions', { auth: false }),
      SC.api('auth/me').catch(function () { return { consents: {} }; })
    ]).then(function (arr) {
      var versions = arr[0];
      var consents = arr[1].consents || {};
      body.innerHTML = '';

      var list = SC.el('div', { class: 'list' });
      versions.docs.forEach(function (d) {
        var a = SC.el('a', { class: 'list-item no-avatar', href: '/legal.php?doc=' + encodeURIComponent(d.type) });
        a.innerHTML = '<span class="list-item-body"><span class="list-item-title"><span>' + SC.esc(d.title) + '</span></span></span>' +
          '<span class="muted small">' + SC.esc(d.version) + '</span><span class="list-item-arrow">' + SC.icon('arrow', 18) + '</span>';
        list.appendChild(a);
      });
      body.appendChild(list);

      body.appendChild(SC.el('div', { class: 'list-group-title', text: '协议版本记录' }));
      var rec = SC.el('div', { class: 'list' });
      ['privacy', 'terms', 'cross-border'].forEach(function (type) {
        var c = consents[type];
        var item = SC.el('div', { class: 'list-item no-avatar' });
        item.innerHTML = '<span class="list-item-body"><span class="list-item-title"><span>' +
          (type === 'privacy' ? '隐私政策' : type === 'terms' ? '用户协议' : '跨境数据传输协议') + '</span></span></span>' +
          '<span class="muted small">' + (c ? SC.esc(c.version) + ' · ' + SC.fmtFullTime(c.agreed_at).slice(0, 10) : '未同意') + '</span>';
        rec.appendChild(item);
      });
      body.appendChild(rec);
    }).catch(function (e) {
      body.innerHTML = '';
      body.appendChild(SC.ui.error(e.message || '加载失败', function () { SC.render(); }));
    });
  };

  /* ------------------------------------------------------------ 登录设备 */
  function parseUA(ua) {
    ua = ua || '';
    var r = { browser: '未知浏览器', bver: '', engine: '', ever: '', os: '未知系统', type: '桌面设备' };
    if (/iPad|Tablet/i.test(ua)) { r.type = '平板'; }
    else if (/iPhone|Mobile|Android/i.test(ua)) { r.type = '手机'; }

    if (/Windows NT 10\.0/.test(ua)) { r.os = 'Windows 10/11'; }
    else if (/Windows NT 6\.3/.test(ua)) { r.os = 'Windows 8.1'; }
    else if (/Windows NT 6\.1/.test(ua)) { r.os = 'Windows 7'; }
    else if (/Windows/.test(ua)) { r.os = 'Windows'; }
    else if (/Android[ \/]?([\d.]+)/.test(ua)) { r.os = 'Android ' + RegExp.$1; }
    else if (/iPhone OS ([\d_]+)/.test(ua)) { r.os = 'iOS ' + RegExp.$1.replace(/_/g, '.'); }
    else if (/Mac OS X ([\d_]+)/.test(ua)) { r.os = 'macOS ' + RegExp.$1.replace(/_/g, '.'); }
    else if (/Linux/.test(ua)) { r.os = 'Linux'; }

    var m;
    if ((m = ua.match(/Edg\/([\d.]+)/))) {
      r.browser = 'Edge'; r.bver = m[1]; r.engine = 'Blink'; r.ever = m[1];
    } else if ((m = ua.match(/OPR\/([\d.]+)/))) {
      r.browser = 'Opera'; r.bver = m[1]; r.engine = 'Blink'; r.ever = m[1];
    } else if ((m = ua.match(/Firefox\/([\d.]+)/))) {
      r.browser = 'Firefox'; r.bver = m[1]; r.engine = 'Gecko';
      var g = ua.match(/rv:([\d.]+)/);
      r.ever = g ? g[1] : m[1];
    } else if ((m = ua.match(/Chrome\/([\d.]+)/))) {
      r.browser = 'Chrome'; r.bver = m[1]; r.engine = 'Blink'; r.ever = m[1];
    } else if ((m = ua.match(/Version\/([\d.]+).*Safari/))) {
      r.browser = 'Safari'; r.bver = m[1]; r.engine = 'WebKit';
      var w = ua.match(/AppleWebKit\/([\d.]+)/);
      r.ever = w ? w[1] : '';
    } else if ((m = ua.match(/AppleWebKit\/([\d.]+)/))) {
      r.browser = 'WebKit 浏览器'; r.engine = 'WebKit'; r.ever = m[1];
    }
    return r;
  }

  function deviceIcon(type) {
    if (type === '手机') {
      return '<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><rect x="6.5" y="2.5" width="11" height="19" rx="2.2" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M10.5 18.5h3" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>';
    }
    if (type === '平板') {
      return '<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><rect x="3.5" y="3" width="17" height="18" rx="2" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M10.5 18h3" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>';
    }
    return '<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><rect x="2.5" y="4" width="19" height="13" rx="2" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M8 20.5h8M12 17v3.5" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>';
  }

  SC.pages.devices = function () {
    var app = SC.qs('#app');
    app.innerHTML = SC.ui.navbar({ title: '登录设备' }) +
      '<main class="page page-full">' +
      '<div class="p16" style="background:#fff">' +
      '<button class="btn btn-secondary btn-block" type="button" id="devKickAll" disabled>退出其他所有设备</button>' +
      '<p class="tiny muted" style="margin-top:8px;line-height:18px">退出后，其他设备需要重新输入密码登录。当前设备不受影响。</p>' +
      '</div><div id="devBody">' + SC.ui.skeleton(3) + '</div></main>';

    var body = SC.qs('#devBody');
    var devices = [];
    var kickAll = SC.qs('#devKickAll');

    function render() {
      body.innerHTML = '';
      var list = SC.el('div', { class: 'list' });
      devices.forEach(function (d) {
        var ua = parseUA(d.user_agent);
        var item = SC.el('div', { class: 'list-item' });
        var right = '';
        if (d.current) {
          right = '<span class="badge-soft">当前设备</span>';
        }
        item.innerHTML =
          '<span class="avatar avatar" style="background:#f2f2f2;color:#555;border-radius:8px">' + deviceIcon(ua.type) + '</span>' +
          '<span class="list-item-body">' +
          '<span class="list-item-title"><span>' + SC.esc(ua.browser) + (ua.bver ? ' ' + SC.esc(ua.bver) : '') + '</span></span>' +
          '<span class="list-item-desc">内核 ' + SC.esc(ua.engine || '未知') + (ua.ever ? ' ' + SC.esc(ua.ever) : '') + ' · ' + SC.esc(ua.os) + '</span>' +
          '<span class="list-item-desc">' + SC.esc(ua.type) + ' · 最近活跃 ' + SC.fmtDay(d.last_seen_at) + '</span>' +
          '</span>' + right;
        if (!d.current) {
          var off = SC.el('button', { class: 'btn btn-secondary btn-sm', type: 'button', text: '下线' });
          off.addEventListener('click', function () {
            SC.dialog({ title: '下线设备', content: '该设备将需要重新登录。', confirmText: '下线', danger: true }).then(function (ok) {
              if (!ok) { return; }
              SC.api('auth/kick', { body: { device_id: d.device_id } }).then(function () {
                devices = devices.filter(function (x) { return x.device_id !== d.device_id; });
                render();
                SC.toast('已下线');
              }).catch(function (e) { SC.toast(e.message, 'error'); });
            });
          });
          item.appendChild(off);
        }
        list.appendChild(item);
      });
      body.appendChild(list);
      var others = devices.filter(function (d) { return !d.current; }).length;
      kickAll.disabled = others === 0;
      kickAll.textContent = others ? '退出其他所有设备(' + others + ')' : '退出其他所有设备';
    }

    function load() {
      SC.api('auth/devices').then(function (data) {
        devices = data.devices || [];
        render();
      }).catch(function (e) {
        body.innerHTML = '';
        body.appendChild(SC.ui.error(e.message || '加载失败', load));
      });
    }

    kickAll.addEventListener('click', function () {
      var others = devices.filter(function (d) { return !d.current; });
      if (!others.length) { return; }
      SC.dialog({
        title: '退出其他设备',
        content: '将退出 ' + others.length + ' 台设备，它们需要重新登录。',
        confirmText: '全部退出',
        danger: true
      }).then(function (ok) {
        if (!ok) { return; }
        Promise.all(others.map(function (d) {
          return SC.api('auth/kick', { body: { device_id: d.device_id } }).catch(function () { return null; });
        })).then(function () {
          SC.toast('已退出其他设备', 'success');
          load();
        });
      });
    });

    load();
  };
})();
