/* SilverChat 核心：API、路由、DOM、弹窗、格式化 */
(function () {
  'use strict';

  var SC = window.SC = window.SC || {};

  /* ---------------------------------------------------------------- 基础状态 */
  SC.version = '1.0.0';
  SC.state = {
    user: null,
    conversations: [],
    friends: [],
    groups: [],
    emojiPackages: [],
    unread: 0,
    pendingRequests: 0,
    serverTime: 0,
    booted: false
  };
  SC.cache = {};          // 内存缓存：解密后的会话摘要等
  SC.hooks = [];          // 路由切换时清理
  SC.onRouteCleanup = function (fn) { SC.hooks.push(fn); };

  var TOKEN_KEY = 'sc_token';
  var DEVICE_KEY = 'sc_device';

  SC.getToken = function () {
    try { return localStorage.getItem(TOKEN_KEY) || ''; } catch (e) { return ''; }
  };
  SC.setToken = function (t) {
    try { t ? localStorage.setItem(TOKEN_KEY, t) : localStorage.removeItem(TOKEN_KEY); } catch (e) {}
  };

  SC.deviceId = function () {
    var id = '';
    try { id = localStorage.getItem(DEVICE_KEY) || ''; } catch (e) {}
    if (!/^[A-Za-z0-9_-]{8,64}$/.test(id)) {
      var bytes = new Uint8Array(16);
      if (window.crypto && crypto.getRandomValues) { crypto.getRandomValues(bytes); }
      else { for (var i = 0; i < 16; i++) { bytes[i] = Math.floor(Math.random() * 256); } }
      id = 'd' + Array.prototype.map.call(bytes, function (b) {
        return ('0' + b.toString(16)).slice(-2);
      }).join('');
      try { localStorage.setItem(DEVICE_KEY, id); } catch (e) {}
    }
    return id;
  };

  /* ------------------------------------------------------------------ 工具 */
  SC.esc = function (s) {
    return String(s === null || s === undefined ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  };

  SC.el = function (tag, attrs, children) {
    var node = document.createElement(tag);
    if (attrs) {
      Object.keys(attrs).forEach(function (k) {
        if (k === 'class') { node.className = attrs[k]; }
        else if (k === 'text') { node.textContent = attrs[k]; }
        else if (k === 'html') { node.innerHTML = attrs[k]; }
        else if (k.indexOf('on') === 0 && typeof attrs[k] === 'function') { node.addEventListener(k.slice(2), attrs[k]); }
        else if (attrs[k] !== null && attrs[k] !== undefined) { node.setAttribute(k, attrs[k]); }
      });
    }
    (children || []).forEach(function (c) {
      if (c === null || c === undefined) { return; }
      node.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
    });
    return node;
  };

  SC.qs = function (sel, root) { return (root || document).querySelector(sel); };
  SC.qsa = function (sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); };

  SC.debounce = function (fn, ms) {
    var t = 0;
    return function () {
      var args = arguments, self = this;
      clearTimeout(t);
      t = setTimeout(function () { fn.apply(self, args); }, ms);
    };
  };

  /* ------------------------------------------------------------------- 图标 */
  var ICONS = {
    chat: '<path d="M4 5.5h16a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2h-9l-5 4v-4H4a2 2 0 0 1-2-2v-9a2 2 0 0 1 2-2z" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/>',
    chatFill: '<path d="M4 5h16a2.5 2.5 0 0 1 2.5 2.5v8A2.5 2.5 0 0 1 20 18h-8.4L6 21.4V18H4a2.5 2.5 0 0 1-2.5-2.5v-8A2.5 2.5 0 0 1 4 5z" fill="currentColor"/>',
    contacts: '<circle cx="12" cy="8" r="4" fill="none" stroke="currentColor" stroke-width="1.7"/><path d="M4.5 20.5c0-3.8 3.4-6.5 7.5-6.5s7.5 2.7 7.5 6.5" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/>',
    contactsFill: '<circle cx="12" cy="8" r="4.2" fill="currentColor"/><path d="M3.6 20.6c0-4 3.8-6.9 8.4-6.9s8.4 2.9 8.4 6.9z" fill="currentColor"/>',
    discover: '<circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" stroke-width="1.7"/><path d="M15.6 8.4l-2.3 5-5 2.3 2.3-5z" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/>',
    discoverFill: '<circle cx="12" cy="12" r="9.4" fill="currentColor"/><path d="M15.9 8.1l-2.4 5.4-5.4 2.4 2.4-5.4z" fill="#fff"/>',
    me: '<circle cx="12" cy="8" r="4" fill="none" stroke="currentColor" stroke-width="1.7"/><path d="M4.5 20.5c0-3.8 3.4-6.5 7.5-6.5s7.5 2.7 7.5 6.5" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/>',
    meFill: '<circle cx="12" cy="8" r="4.2" fill="currentColor"/><path d="M3.6 20.6c0-4 3.8-6.9 8.4-6.9s8.4 2.9 8.4 6.9z" fill="currentColor"/>',
    back: '<path d="M15 4 7 12l8 8" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>',
    more: '<circle cx="5" cy="12" r="1.7" fill="currentColor"/><circle cx="12" cy="12" r="1.7" fill="currentColor"/><circle cx="19" cy="12" r="1.7" fill="currentColor"/>',
    search: '<circle cx="10.5" cy="10.5" r="6.5" fill="none" stroke="currentColor" stroke-width="1.7"/><path d="M15.5 15.5 21 21" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/>',
    plus: '<path d="M12 5v14M5 12h14" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>',
    close: '<path d="M6 6l12 12M18 6 6 18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>',
    check: '<path d="M5 12.5 10 17.5 19 7" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>',
    arrow: '<path d="M9 5l7 7-7 7" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/>',
    mic: '<rect x="9" y="3" width="6" height="11" rx="3" fill="none" stroke="currentColor" stroke-width="1.7"/><path d="M5.5 11.5a6.5 6.5 0 0 0 13 0M12 18v3" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/>',
    keyboard: '<rect x="2.5" y="6" width="19" height="12" rx="2" fill="none" stroke="currentColor" stroke-width="1.7"/><path d="M6 10h.01M9.5 10h.01M13 10h.01M16.5 10h.01M6 13.5h.01M17.5 13.5h.01M9 14h6" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>',
    smile: '<circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" stroke-width="1.7"/><circle cx="9" cy="10" r="1.1" fill="currentColor"/><circle cx="15" cy="10" r="1.1" fill="currentColor"/><path d="M8 14.5c1 1.4 2.4 2.1 4 2.1s3-.7 4-2.1" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/>',
    add: '<circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" stroke-width="1.7"/><path d="M12 8v8M8 12h8" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/>',
    image: '<rect x="3" y="4.5" width="18" height="15" rx="2" fill="none" stroke="currentColor" stroke-width="1.7"/><circle cx="8.5" cy="10" r="1.6" fill="currentColor"/><path d="M4 17l5-5 4 4 2.5-2.5L20 18" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/>',
    camera: '<path d="M4 8h3l1.5-2h7L17 8h3a1.5 1.5 0 0 1 1.5 1.5v8A1.5 1.5 0 0 1 20 19H4a1.5 1.5 0 0 1-1.5-1.5v-8A1.5 1.5 0 0 1 4 8z" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/><circle cx="12" cy="13" r="3.2" fill="none" stroke="currentColor" stroke-width="1.7"/>',
    file: '<path d="M6 3h8l4 4v14H6z" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/><path d="M14 3v5h5" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/>',
    location: '<path d="M12 21s7-6.2 7-11a7 7 0 1 0-14 0c0 4.8 7 11 7 11z" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/><circle cx="12" cy="10" r="2.6" fill="none" stroke="currentColor" stroke-width="1.7"/>',
    lock: '<rect x="4.5" y="10" width="15" height="10.5" rx="2" fill="none" stroke="currentColor" stroke-width="1.7"/><path d="M8 10V7.5a4 4 0 0 1 8 0V10" fill="none" stroke="currentColor" stroke-width="1.7"/>',
    shield: '<path d="M12 3l7 3v6c0 4.5-3 7.6-7 9-4-1.4-7-4.5-7-9V6z" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/><path d="M8.8 12.2l2.2 2.2 4.2-4.4" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/>',
    star: '<path d="M12 3.8l2.5 5.1 5.6.8-4 4 1 5.6-5.1-2.7-5.1 2.7 1-5.6-4-4 5.6-.8z" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/>',
    block: '<circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" stroke-width="1.7"/><path d="M5.8 5.8l12.4 12.4" fill="none" stroke="currentColor" stroke-width="1.7"/>',
    trash: '<path d="M4 7h16M9.5 7V4.8h5V7M6.5 7l1 13h9l1-13" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/>',
    info: '<circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" stroke-width="1.7"/><path d="M12 11v6" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/><circle cx="12" cy="7.8" r="1.1" fill="currentColor"/>',
    settings: '<circle cx="12" cy="12" r="3.2" fill="none" stroke="currentColor" stroke-width="1.7"/><path d="M12 2.8l1.4 2.3 2.7-.4 1 2.6 2.3 1.4-.6 2.7 1.6 2.2-1.9 1.9.1 2.7-2.7.8-1.2 2.4-2.6-.9-2.5 1.1-1.4-2.3-2.7.3-1-2.6L3 14.7l.7-2.6L2 9.8l2-1.9-.1-2.7 2.7-.8L7.9 2z" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linejoin="round"/>',
    bell: '<path d="M6 9a6 6 0 1 1 12 0c0 4 1.5 5.5 2 6H4c.5-.5 2-2 2-6z" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/><path d="M10 19a2 2 0 0 0 4 0" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/>',
    pin: '<path d="M9 3h6l-1 6 4 3v2H6v-2l4-3z" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/><path d="M12 14v7" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>',
    logout: '<path d="M14 4h4.5A1.5 1.5 0 0 1 20 5.5v13a1.5 1.5 0 0 1-1.5 1.5H14" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/><path d="M10 8l-4 4 4 4M6 12h9" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/>',
    doc: '<path d="M6 3h8l4 4v14H6z" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/><path d="M9 12h6M9 16h6" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>',
    users: '<circle cx="9" cy="8" r="3.4" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M3 19c0-3.2 2.7-5.4 6-5.4s6 2.2 6 5.4" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/><path d="M16 5.2a3.4 3.4 0 0 1 0 6.6M17.5 14.2c2.1.6 3.5 2.3 3.5 4.8" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>',
    key: '<circle cx="8" cy="12" r="4" fill="none" stroke="currentColor" stroke-width="1.7"/><path d="M12 12h8M17 12v3M20 12v2" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/>',
    refresh: '<path d="M20 12a8 8 0 1 1-2.4-5.7M20 4v4h-4" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/>',
    eye: '<path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z" fill="none" stroke="currentColor" stroke-width="1.6"/><circle cx="12" cy="12" r="3" fill="none" stroke="currentColor" stroke-width="1.6"/>',
    eyeOff: '<path d="M4 4l16 16" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/><path d="M9.5 5.9A9.6 9.6 0 0 1 12 5.5c6 0 9.5 6.5 9.5 6.5a17 17 0 0 1-3.2 3.9M6.1 8.1A17.6 17.6 0 0 0 2.5 12S6 18.5 12 18.5c1.2 0 2.3-.2 3.3-.7" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>',
    play: '<path d="M8 5.5l10 6.5-10 6.5z" fill="currentColor"/>',
    pause: '<path d="M8 5h3v14H8zM13 5h3v14h-3z" fill="currentColor"/>',
    clock: '<circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" stroke-width="1.7"/><path d="M12 7v5l3.5 2" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/>'
  };

  SC.icon = function (name, size) {
    var path = ICONS[name] || ICONS.info;
    var s = size || 22;
    return '<svg viewBox="0 0 24 24" width="' + s + '" height="' + s + '" aria-hidden="true">' + path + '</svg>';
  };

  /* ------------------------------------------------------------------ 时间 */
  function pad(n) { return n < 10 ? '0' + n : String(n); }

  SC.fmtTime = function (ts) {
    var d = new Date(ts * 1000);
    return pad(d.getHours()) + ':' + pad(d.getMinutes());
  };

  SC.fmtDay = function (ts) {
    var d = new Date(ts * 1000), now = new Date();
    var sameDay = d.toDateString() === now.toDateString();
    if (sameDay) { return SC.fmtTime(ts); }
    var y = new Date(now.getTime() - 86400000);
    if (d.toDateString() === y.toDateString()) { return '昨天'; }
    if (now.getTime() - d.getTime() < 7 * 86400000) {
      return ['周日', '周一', '周二', '周三', '周四', '周五', '周六'][d.getDay()];
    }
    if (d.getFullYear() === now.getFullYear()) {
      return pad(d.getMonth() + 1) + '-' + pad(d.getDate());
    }
    return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
  };

  SC.fmtFullTime = function (ts) {
    var d = new Date(ts * 1000);
    return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()) + ' ' + pad(d.getHours()) + ':' + pad(d.getMinutes());
  };

  SC.fmtSize = function (bytes) {
    if (bytes < 1024) { return bytes + ' B'; }
    if (bytes < 1048576) { return (bytes / 1024).toFixed(1) + ' KB'; }
    return (bytes / 1048576).toFixed(1) + ' MB';
  };

  /* ------------------------------------------------------------------- API */
  SC.ApiError = function (code, msg, status) {
    this.code = code;
    this.message = msg;
    this.status = status || 0;
  };

  SC.api = function (path, opts) {
    opts = opts || {};
    var token = SC.getToken();
    var headers = {};
    if (opts.body !== undefined) {
      headers['Content-Type'] = 'application/json';
    }
    if (token && opts.auth !== false) {
      headers['Authorization'] = 'Bearer ' + token;
    }
    var controller = null;
    var timer = 0;
    if (window.AbortController) {
      controller = new AbortController();
      timer = setTimeout(function () { controller.abort(); }, opts.timeout || 15000);
    }
    return fetch('/api/' + path, {
      method: opts.method || (opts.body !== undefined ? 'POST' : 'GET'),
      headers: headers,
      body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
      signal: controller ? controller.signal : undefined,
      credentials: 'same-origin'
    }).then(function (res) {
      if (timer) { clearTimeout(timer); }
      return res.text().then(function (text) {
        var json = null;
        try { json = JSON.parse(text); } catch (e) {}
        if (!json) {
          throw new SC.ApiError(-1, '网络异常，请稍后重试', res.status);
        }
        if (json.code !== 0) {
          var err = new SC.ApiError(json.code, json.msg || '操作失败', res.status);
          if (json.code === 1002 && opts.auth !== false) {
            SC.setToken('');
            if (location.pathname !== '/login') {
              SC.toast('登录已过期，请重新登录');
              SC.navigate('/login', true);
            }
          }
          throw err;
        }
        return json.data;
      });
    }, function (err) {
      if (timer) { clearTimeout(timer); }
      throw new SC.ApiError(-1, '网络异常，请检查网络后重试', 0);
    });
  };

  /** 上传（multipart） */
  SC.upload = function (path, formData, opts) {
    opts = opts || {};
    var headers = {};
    if (SC.getToken()) { headers['Authorization'] = 'Bearer ' + SC.getToken(); }
    return fetch('/api/' + path, { method: 'POST', headers: headers, body: formData, credentials: 'same-origin' })
      .then(function (res) {
        return res.text().then(function (text) {
          var json = null;
          try { json = JSON.parse(text); } catch (e) {}
          if (!json) { throw new SC.ApiError(-1, '上传失败，请重试', res.status); }
          if (json.code !== 0) { throw new SC.ApiError(json.code, json.msg || '上传失败', res.status); }
          return json.data;
        });
      });
  };

  /* ----------------------------------------------------------------- Toast */
  var toastWrap = null;
  SC.toast = function (msg, type) {
    if (!toastWrap) {
      toastWrap = SC.el('div', { class: 'toast-wrap' });
      document.body.appendChild(toastWrap);
    }
    var node = SC.el('div', { class: 'toast' + (type ? ' toast-' + type : ''), text: msg });
    toastWrap.appendChild(node);
    setTimeout(function () {
      node.style.transition = 'opacity .2s';
      node.style.opacity = '0';
      setTimeout(function () { if (node.parentNode) { node.parentNode.removeChild(node); } }, 220);
    }, 2000);
  };

  /* ------------------------------------------------------------ 对话框工具 */
  function closeMask(mask) {
    if (mask && mask.parentNode) { mask.parentNode.removeChild(mask); }
  }

  /**
   * 通用确认/输入对话框。
   * opts: {title, content, confirmText, cancelText, danger, input:false, placeholder, value, maxlength}
   * resolve: 确认返回 true（或输入字符串），取消返回 null
   */
  SC.dialog = function (opts) {
    opts = opts || {};
    return new Promise(function (resolve) {
      var mask = SC.el('div', { class: 'mask' });
      var inputEl = null;
      var contentNode = SC.el('div', { class: 'dialog-content' });
      if (opts.content) {
        var p = SC.el('p', { text: opts.content });
        contentNode.appendChild(p);
      }
      if (opts.input) {
        if (opts.textarea) {
          inputEl = SC.el('textarea', { class: 'textarea', placeholder: opts.placeholder || '', maxlength: opts.maxlength || 200 });
          inputEl.value = opts.value || '';
        } else {
          inputEl = SC.el('input', { class: 'input', placeholder: opts.placeholder || '', maxlength: opts.maxlength || 100 });
          inputEl.value = opts.value || '';
        }
        contentNode.appendChild(inputEl);
      }
      var cancelBtn = SC.el('button', { type: 'button', text: opts.cancelText || '取消' });
      var okBtn = SC.el('button', {
        type: 'button',
        class: (opts.danger ? 'danger' : 'primary') + ' dialog-ok',
        text: opts.confirmText || '确定'
      });
      var dialog = SC.el('div', { class: 'dialog' }, [
        SC.el('div', { class: 'dialog-title', text: opts.title || '' }),
        contentNode,
        SC.el('div', { class: 'dialog-actions' }, [cancelBtn, okBtn])
      ]);
      mask.appendChild(dialog);
      document.body.appendChild(mask);

      function done(val) { closeMask(mask); resolve(val); }
      cancelBtn.addEventListener('click', function () { done(null); });
      okBtn.addEventListener('click', function () {
        if (!opts.input) { done(true); return; }
        var v = inputEl.value.trim();
        if (opts.required !== false && v === '') { inputEl.focus(); return; }
        done(v);
      });
      mask.addEventListener('click', function (e) { if (e.target === mask) { done(null); } });
      if (inputEl) { setTimeout(function () { inputEl.focus(); }, 50); }
    });
  };

  /** 底部动作面板 */
  SC.actions = function (items, title) {
    return new Promise(function (resolve) {
      var mask = SC.el('div', { class: 'mask bottom' });
      var sheet = SC.el('div', { class: 'action-sheet' });
      if (title) { sheet.appendChild(SC.el('div', { class: 'action-sheet-title', text: title })); }
      items.forEach(function (it, idx) {
        var btn = SC.el('button', {
          type: 'button',
          class: 'action-sheet-item' + (it.danger ? ' danger' : ''),
          text: it.label
        });
        btn.addEventListener('click', function () { closeMask(mask); resolve(idx); });
        sheet.appendChild(btn);
      });
      var cancel = SC.el('button', { type: 'button', class: 'action-sheet-item action-sheet-cancel', text: '取消' });
      cancel.addEventListener('click', function () { closeMask(mask); resolve(-1); });
      sheet.appendChild(cancel);
      mask.appendChild(sheet);
      document.body.appendChild(mask);
      mask.addEventListener('click', function (e) { if (e.target === mask) { closeMask(mask); resolve(-1); } });
    });
  };

  /** 图片全屏预览 */
  SC.imageViewer = function (src) {
    var mask = SC.el('div', { class: 'mask', style: 'background:rgba(0,0,0,.92);padding:0' });
    var img = SC.el('img', { src: src, style: 'max-width:100%;max-height:100vh;object-fit:contain' });
    img.draggable = false;
    mask.appendChild(img);
    document.body.appendChild(mask);
    mask.addEventListener('click', function () { closeMask(mask); });
  };

  /* ------------------------------------------------------------------ 路由 */
  SC.routes = [];
  SC.currentPath = '';

  SC.route = function (pattern, handler) {
    var keys = [];
    var re = new RegExp('^' + pattern.replace(/\/:([a-zA-Z_]+)/g, function (_, k) {
      keys.push(k);
      return '/([^/]+)';
    }).replace(/\//g, '\\/') + '$');
    SC.routes.push({ re: re, keys: keys, handler: handler });
  };

  SC.parseRoute = function (path) {
    for (var i = 0; i < SC.routes.length; i++) {
      var r = SC.routes[i];
      var m = path.match(r.re);
      if (m) {
        var params = {};
        r.keys.forEach(function (k, idx) { params[k] = decodeURIComponent(m[idx + 1]); });
        return { handler: r.handler, params: params };
      }
    }
    return null;
  };

  SC.render = function () {
    var path = location.pathname.replace(/\/+$/, '') || '/';
    SC.currentPath = path;
    // 清理上一页的定时器与监听
    SC.hooks.forEach(function (fn) { try { fn(); } catch (e) {} });
    SC.hooks = [];
    if (SC.poll && SC.poll.stop) { SC.poll.stop(); }

    var matched = SC.parseRoute(path);
    var app = SC.qs('#app');
    if (!matched) {
      if (app) {
        app.innerHTML = '';
        app.appendChild(SC.ui.empty({
          title: '页面不存在',
          desc: '你访问的页面不存在或已被移除',
          action: { label: '回到消息', onClick: function () { SC.navigate('/'); } }
        }));
      }
      return;
    }
    if (app) { app.innerHTML = ''; }
    try {
      matched.handler(matched.params);
    } catch (e) {
      if (window.console) { console.error(e); }
      if (app) {
        app.innerHTML = '';
        app.appendChild(SC.ui.error('页面加载失败', function () { SC.render(); }));
      }
    }
  };

  SC.navigate = function (path, replace) {
    if (path === SC.currentPath && !replace) { return; }
    if (replace) { history.replaceState(null, '', path); }
    else { history.pushState(null, '', path); }
    SC.render();
  };

  SC.start = function () {
    window.addEventListener('popstate', function () { SC.render(); });
    SC.render();
  };

  /* -------------------------------------------------------------- 在线状态 */
  SC.online = navigator.onLine !== false;
  window.addEventListener('online', function () {
    SC.online = true;
    if (SC.poll && SC.poll.kick) { SC.poll.kick(); }
  });
  window.addEventListener('offline', function () { SC.online = false; });
})();
