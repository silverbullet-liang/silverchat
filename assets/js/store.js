/* SilverChat 状态、轮询与本地缓存 */
(function () {
  'use strict';

  var SC = window.SC = window.SC || {};

  /* -------------------------------------------------------------- 事件总线 */
  var listeners = {};
  SC.on = function (name, fn) {
    (listeners[name] = listeners[name] || []).push(fn);
    return function () {
      listeners[name] = (listeners[name] || []).filter(function (f) { return f !== fn; });
    };
  };
  SC.emit = function (name, data) {
    (listeners[name] || []).slice().forEach(function (fn) {
      try { fn(data); } catch (e) { if (window.console) { console.error(e); } }
    });
  };

  /* ---------------------------------------------------------------- 身份 */
  SC.store = SC.store || {};

  SC.store.identity = null;

  SC.store.ensureIdentity = function (forceNew) {
    if (SC.store.identity && !forceNew) { return Promise.resolve(SC.store.identity); }
    var load = forceNew ? Promise.resolve(null) : SC.crypto.loadIdentity();
    return load.then(function (id) {
      if (id) { SC.store.identity = id; return id; }
      return SC.crypto.generateIdentity().then(function (fresh) {
        return SC.crypto.saveIdentity(fresh).then(function () {
          SC.store.identity = fresh;
          return fresh;
        });
      });
    });
  };

  SC.store.publicKeyForServer = function (identity) {
    return identity.publicKey;
  };

  /* --------------------------------------------------------------- 启动 */
  SC.store.boot = function () {
    var token = SC.getToken();
    if (!token) { return Promise.resolve(false); }
    return SC.api('auth/me').then(function (data) {
      SC.state.user = data.user;
      SC.state.unread = data.unread || 0;
      SC.state.pendingRequests = data.pending_requests || 0;
      SC.state.serverTime = data.server_time || 0;
      SC.state.booted = true;
      return SC.store.ensureIdentity().then(function (identity) {
        // 本机身份与服务端记录不一致（换设备或清过本地存储）：把本机公钥同步上去，
        // 否则对方仍用旧公钥加密，本机解不开新消息。
        if (data.user.public_key !== identity.publicKey) {
          return SC.api('user/public_key', { body: { public_key: SC.store.publicKeyForServer(identity) } })
            .then(function (res) {
              if (res && res.user) { SC.state.user = res.user; }
              return null;
            })
            .catch(function () { return null; });
        }
        return null;
      }).then(function () {
        return SC.store.loadEmoji();
      }).then(function () {
        return data;
      });
    }, function (err) {
      if (err && err.code === 1002) { return false; }
      throw err;
    });
  };

  /** 更新服务器公钥（登录后调用，保证 session 使用本机密钥） */
  SC.store.syncPublicKey = function () {
    return SC.store.ensureIdentity().then(function (identity) {
      return SC.api('auth/login', { body: {} }).catch(function () { return null; });
    });
  };

  /* --------------------------------------------------------------- 表情 */
  SC.store.loadEmoji = function () {
    var cached = null;
    try { cached = JSON.parse(localStorage.getItem('sc_emoji') || 'null'); } catch (e) {}
    if (cached && Date.now() - cached.t < 86400000) {
      SC.state.emojiPackages = cached.p || [];
      return Promise.resolve(SC.state.emojiPackages);
    }
    return SC.api('emoji/packages').then(function (data) {
      SC.state.emojiPackages = data.packages || [];
      try {
        localStorage.setItem('sc_emoji', JSON.stringify({ t: Date.now(), p: SC.state.emojiPackages }));
      } catch (e) {}
      return SC.state.emojiPackages;
    }).catch(function () { return []; });
  };

  SC.store.emojiMap = function () {
    var map = {};
    (SC.state.emojiPackages || []).forEach(function (p) {
      (p.items || []).forEach(function (it) { map[it.code] = it; });
    });
    return map;
  };

  /* ------------------------------------------------------------- 会话列表 */
  SC.store.refreshConversations = function () {
    return SC.api('conversations').then(function (data) {
      SC.state.conversations = data.conversations || [];
      SC.state.unread = SC.state.conversations.reduce(function (n, c) {
        return n + (c.muted ? 0 : (c.unread || 0));
      }, 0);
      return SC.state.conversations;
    });
  };

  SC.store.refreshFriends = function () {
    return SC.api('friend/list').then(function (data) {
      SC.state.friends = data.friends || [];
      return SC.state.friends;
    });
  };

  SC.store.getConversation = function (convId) {
    return (SC.state.conversations || []).filter(function (c) { return c.conv_id === convId; })[0] || null;
  };

  /* ----------------------------------------------------------- 摘要解密 */
  var summaryCache = {};

  SC.store.summary = function (conv) {
    if (!conv || !conv.last) { return Promise.resolve(''); }
    var last = conv.last;
    if (last.type === 99) { return Promise.resolve(last.content || ''); }
    if (last.status === 2) { return Promise.resolve('消息已撤回'); }
    if (last.content === 'expired') { return Promise.resolve('[内容已过期]'); }
    if (last.type !== 1 && last.type !== 6) {
      var labels = { 2: '[图片]', 3: '[语音]', 4: '[视频]', 5: '[文件]', 7: '[位置]' };
      return Promise.resolve(labels[last.type] || '[消息]');
    }
    var key = 'c' + conv.conv_id + '_m' + last.id;
    if (summaryCache[key] !== undefined) { return Promise.resolve(summaryCache[key]); }

    var identity = SC.store.identity;
    if (!identity) { return Promise.resolve('[加密消息]'); }
    var plainPromise;
    if (conv.type === 2) {
      plainPromise = SC.store.groupKey(conv.public_id).then(function (gk) {
        if (!gk) { return '[加密消息]'; }
        return SC.crypto.decryptWithKey(gk, conv.conv_id, last.content);
      });
    } else {
      plainPromise = SC.crypto.peerPublicKey(conv.public_id).then(function (pk) {
        return SC.crypto.decrypt(identity, pk, conv.conv_id, last.content);
      });
    }
    return plainPromise.then(function (text) {
      if (last.type === 6) {
        text = '[表情]';
      }
      text = String(text || '').replace(/\s+/g, ' ');
      if (text.length > 30) { text = text.slice(0, 30) + '…'; }
      summaryCache[key] = text;
      return text;
    }).catch(function () { return '[加密消息]'; });
  };

  /* -------------------------------------------------------------- 群密钥 */
  var groupKeyCache = {};

  SC.store.groupKey = function (groupPublicId) {
    if (!groupPublicId) { return Promise.resolve(null); }
    if (groupKeyCache[groupPublicId]) { return Promise.resolve(groupKeyCache[groupPublicId]); }
    var identity = SC.store.identity;
    if (!identity) { return Promise.resolve(null); }

    return SC.crypto.idbGet('sc_gk_raw_' + groupPublicId).then(function (raw) {
      if (raw) {
        return SC.crypto.importGroupKey(new Uint8Array(raw)).then(function (key) {
          groupKeyCache[groupPublicId] = key;
          return key;
        });
      }
      return SC.api('group/key?public_id=' + encodeURIComponent(groupPublicId)).then(function (data) {
        if (!data || !data.wrapped) { return null; }
        // 解封者用「自己的私钥 + 封装者公钥」派生；封装者公钥记录在 wrapped.from 中
        return SC.crypto.unwrapGroupKey(identity, null, data.wrapped).then(function (bytes) {
          return SC.crypto.idbSet('sc_gk_raw_' + groupPublicId, Array.prototype.slice.call(bytes)).then(function () {
            return SC.crypto.importGroupKey(bytes);
          });
        }).then(function (key) {
          groupKeyCache[groupPublicId] = key;
          return key;
        }).catch(function () { return null; });
      }).catch(function () { return null; });
    });
  };

  SC.store.setGroupKey = function (groupPublicId, rawBytes) {
    return SC.crypto.idbSet('sc_gk_raw_' + groupPublicId, Array.prototype.slice.call(new Uint8Array(rawBytes)))
      .then(function () { return SC.crypto.importGroupKey(new Uint8Array(rawBytes)); })
      .then(function (key) {
        groupKeyCache[groupPublicId] = key;
        return key;
      });
  };

  SC.store.groupKeyRaw = function (groupPublicId) {
    return SC.store.groupKey(groupPublicId).then(function () {
      return SC.crypto.idbGet('sc_gk_raw_' + groupPublicId).then(function (raw) {
        return raw ? new Uint8Array(raw) : null;
      });
    });
  };

  /* ---------------------------------------------------------------- 轮询 */
  SC.poll = (function () {
    var timer = 0;
    var running = false;
    var fails = 0;
    var cursor = 0;
    var sinceTime = 0;
    var busy = false;

    function interval() {
      var base = document.hidden ? 15000 : 4000;
      if (fails > 0) {
        base = Math.min(30000, 4000 * Math.pow(2, fails));
      }
      return base;
    }

    function schedule(ms) {
      clearTimeout(timer);
      timer = setTimeout(tick, ms);
    }

    function tick() {
      if (!running || busy) { return; }
      if (!SC.getToken()) { return; }
      busy = true;
      SC.api('poll.php?cursor=' + cursor + '&since_time=' + sinceTime, { timeout: 20000 }).then(function (data) {
        fails = 0;
        busy = false;
        if (typeof data.cursor === 'number' && data.cursor > cursor) { cursor = data.cursor; }
        if (data.server_time) { sinceTime = data.server_time; }
        if (data.messages && data.messages.length) {
          SC.emit('poll:messages', data.messages);
        }
        if (data.conversations) {
          var total = data.conversations.reduce(function (n, c) { return n + (c.muted ? 0 : c.unread); }, 0);
          if (total !== SC.state.unread) {
            SC.state.unread = total;
            SC.emit('poll:unread', total);
          }
          SC.state.pollConversations = data.conversations;
        }
        if (data.friend_requests && data.friend_requests.length) {
          SC.state.pendingRequests = Math.max(SC.state.pendingRequests, data.friend_requests.length);
          SC.emit('poll:friend_requests', data.friend_requests);
        }
        if (data.moment_notices && data.moment_notices.length) {
          SC.emit('poll:notices', data.moment_notices);
        }
        if (data.read_map) {
          SC.emit('poll:read', data.read_map);
        }
        if (data.incoming_call && data.incoming_call.id) {
          SC.emit('poll:call', data.incoming_call);
        }
        schedule(interval());
      }, function () {
        busy = false;
        fails = Math.min(fails + 1, 4);
        schedule(interval());
      });
    }

    return {
      start: function () {
        if (running) { return; }
        running = true;
        fails = 0;
        sinceTime = Math.floor(Date.now() / 1000);
        schedule(800);
      },
      stop: function () {
        running = false;
        clearTimeout(timer);
      },
      kick: function () {
        if (running) { schedule(50); }
      },
      resetCursor: function (id) {
        cursor = Math.max(cursor, id || 0);
      }
    };
  })();

  document.addEventListener('visibilitychange', function () {
    if (!document.hidden) { SC.poll.kick(); }
  });
})();
