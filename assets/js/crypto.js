/* SilverChat 端到端加密：X25519（优先）/ P-256 回退 + HKDF + AES-256-GCM
 * 私钥只保存在本机 IndexedDB，永不发送到服务器。
 */
(function () {
  'use strict';

  var SC = window.SC = window.SC || {};
  var E = new TextEncoder();
  var D = new TextDecoder();

  function b64(buf) {
    var bytes = new Uint8Array(buf);
    var s = '';
    for (var i = 0; i < bytes.length; i++) { s += String.fromCharCode(bytes[i]); }
    return btoa(s);
  }

  function unb64(str) {
    var bin = atob(str);
    var out = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) { out[i] = bin.charCodeAt(i); }
    return out;
  }

  function hex(buf) {
    return Array.prototype.map.call(new Uint8Array(buf), function (b) {
      return ('0' + b.toString(16)).slice(-2);
    }).join('');
  }

  function concat(a, b) {
    var out = new Uint8Array(a.length + b.length);
    out.set(a, 0);
    out.set(b, a.length);
    return out;
  }

  SC.crypto = SC.crypto || {};

  /* ----------------------------------------------------------- IndexedDB */
  var DB_NAME = 'silverchat';
  var STORE = 'identity';

  function openDB() {
    return new Promise(function (resolve, reject) {
      var req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = function () {
        var db = req.result;
        if (!db.objectStoreNames.contains(STORE)) { db.createObjectStore(STORE); }
      };
      req.onsuccess = function () { resolve(req.result); };
      req.onerror = function () { reject(req.error); };
    });
  }

  function idbGet(key) {
    return openDB().then(function (db) {
      return new Promise(function (resolve, reject) {
        var tx = db.transaction(STORE, 'readonly');
        var req = tx.objectStore(STORE).get(key);
        req.onsuccess = function () { resolve(req.result || null); };
        req.onerror = function () { reject(req.error); };
      });
    });
  }

  function idbSet(key, val) {
    return openDB().then(function (db) {
      return new Promise(function (resolve, reject) {
        var tx = db.transaction(STORE, 'readwrite');
        tx.objectStore(STORE).put(val, key);
        tx.oncomplete = function () { resolve(true); };
        tx.onerror = function () { reject(tx.error); };
      });
    });
  }

  SC.crypto.idbGet = idbGet;
  SC.crypto.idbSet = idbSet;

  /* --------------------------------------------------------------- 工具 */
  SC.crypto.available = !!(window.crypto && crypto.subtle && crypto.getRandomValues);

  function importAes(raw) {
    return crypto.subtle.importKey('raw', raw, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt']);
  }

  function hkdf(shared, info) {
    return crypto.subtle.importKey('raw', shared, 'HKDF', false, ['deriveBits']).then(function (key) {
      return crypto.subtle.deriveBits(
        { name: 'HKDF', hash: 'SHA-256', salt: new Uint8Array(0), info: E.encode(info) },
        key, 256
      );
    });
  }

  /* ------------------------------------------------------------ 身份密钥 */
  /** 探测算法支持；优先 X25519，回退 P-256。 */
  SC.crypto.detectAlg = function () {
    if (!SC.crypto.available) { return Promise.resolve(''); }
    return crypto.subtle.generateKey({ name: 'X25519' }, true, ['deriveBits']).then(function () {
      return 'x25519';
    }, function () {
      return 'p256';
    });
  };

  function genKeyPair(alg) {
    var params = alg === 'x25519'
      ? { name: 'X25519' }
      : { name: 'ECDH', namedCurve: 'P-256' };
    return crypto.subtle.generateKey(params, true, ['deriveBits']).then(function (pair) {
      return Promise.all([
        crypto.subtle.exportKey('raw', pair.publicKey),
        crypto.subtle.exportKey('pkcs8', pair.privateKey)
      ]).then(function (out) {
        return {
          alg: alg,
          publicKey: pair.publicKey,
          privateKey: pair.privateKey,
          publicB64: b64(out[0]),
          privatePkcs8: out[1]
        };
      });
    });
  }

  /**
   * 生成本机身份密钥（X25519 与 P-256 双份，便于跨浏览器协商）。
   * 返回 {publicKey: string(JSON), identity: {...}}
   */
  SC.crypto.generateIdentity = function () {
    if (!SC.crypto.available) {
      return Promise.reject(new Error('当前浏览器不支持安全通信，请更换浏览器'));
    }
    return genKeyPair('x25519').then(function (x) {
      return genKeyPair('p256').then(function (p) {
        return { x25519: x, p256: p };
      }, function () {
        return { x25519: x, p256: null };
      });
    }, function () {
      return genKeyPair('p256').then(function (p) {
        return { x25519: null, p256: p };
      });
    }).then(function (keys) {
      var pub = {};
      if (keys.x25519) { pub.x25519 = keys.x25519.publicB64; }
      if (keys.p256) { pub.p256 = keys.p256.publicB64; }
      return { keys: keys, publicKey: JSON.stringify(pub) };
    });
  };

  SC.crypto.saveIdentity = function (identity) {
    var stored = { version: 1, createdAt: Date.now(), keys: {} };
    ['x25519', 'p256'].forEach(function (alg) {
      var k = identity.keys[alg];
      if (!k) { return; }
      stored.keys[alg] = {
        publicB64: k.publicB64,
        privatePkcs8: Array.prototype.slice.call(new Uint8Array(k.privatePkcs8))
      };
    });
    stored.publicKey = identity.publicKey;
    return idbSet('identity', stored);
  };

  /** 从 IndexedDB 载入身份密钥并重新 import（CryptoKey 无法跨浏览器持久化）。 */
  SC.crypto.loadIdentity = function () {
    return idbGet('identity').then(function (stored) {
      if (!stored || !stored.keys) { return null; }
      var jobs = Object.keys(stored.keys).map(function (alg) {
        var raw = new Uint8Array(stored.keys[alg].privatePkcs8).buffer;
        var params = alg === 'x25519' ? { name: 'X25519' } : { name: 'ECDH', namedCurve: 'P-256' };
        return crypto.subtle.importKey('pkcs8', raw, params, true, ['deriveBits']).then(function (priv) {
          return crypto.subtle.importKey('raw', unb64(stored.keys[alg].publicB64), params, true, []).then(function (pub) {
            return {
              alg: alg,
              privateKey: priv,
              publicKey: pub,
              publicB64: stored.keys[alg].publicB64,
              privatePkcs8: raw
            };
          });
        });
      });
      return Promise.all(jobs).then(function (list) {
        var keys = {};
        list.forEach(function (k) { keys[k.alg] = k; });
        return { keys: keys, publicKey: stored.publicKey, createdAt: stored.createdAt };
      });
    });
  };

  SC.crypto.hasIdentity = function () {
    return idbGet('identity').then(function (v) { return !!v; });
  };

  /* ---------------------------------------------------------- 公钥协商 */
  /** 解析服务器返回的公钥（JSON 或 "alg:b64"）。 */
  SC.crypto.parsePublicKey = function (str) {
    if (!str) { return null; }
    var s = String(str).trim();
    if (s.charAt(0) === '{') {
      try {
        var obj = JSON.parse(s);
        var out = {};
        Object.keys(obj).forEach(function (k) {
          if ((k === 'x25519' || k === 'p256') && typeof obj[k] === 'string') {
            try { out[k] = unb64(obj[k]); } catch (e) {}
          }
        });
        return Object.keys(out).length ? out : null;
      } catch (e) { return null; }
    }
    var m = s.match(/^(x25519|p256):([A-Za-z0-9+/=]+)$/);
    if (m) {
      var one = {};
      try { one[m[1]] = unb64(m[2]); } catch (e) { return null; }
      return one;
    }
    return null;
  };

  /** 选择双方都支持的算法，优先 X25519。 */
  SC.crypto.negotiate = function (mine, theirs) {
    var order = ['x25519', 'p256'];
    for (var i = 0; i < order.length; i++) {
      if (mine.keys[order[i]] && theirs[order[i]]) { return order[i]; }
    }
    return '';
  };

  var keyCache = {};

  /** 由我的私钥与对端公钥派生 AES 会话密钥。 */
  SC.crypto.sessionKey = function (identity, peerPublicKey, alg, purpose) {
    var peer = SC.crypto.parsePublicKey(peerPublicKey);
    if (!peer) { return Promise.reject(new Error('对方公钥无效')); }
    var useAlg = alg || SC.crypto.negotiate(identity, peer);
    if (!useAlg) { return Promise.reject(new Error('双方加密算法不兼容')); }
    var mine = identity.keys[useAlg];
    if (!mine) { return Promise.reject(new Error('本机缺少该算法的密钥')); }
    var cacheKey = useAlg + ':' + (purpose || 'message-key') + ':' + hex(peer[useAlg]) + ':' + mine.publicB64;
    if (keyCache[cacheKey]) { return Promise.resolve(keyCache[cacheKey]); }

    var params = useAlg === 'x25519'
      ? { name: 'X25519', public: mine.publicKey }
      : { name: 'ECDH', public: mine.publicKey };

    return crypto.subtle.importKey('raw', peer[useAlg], params, false, []).then(function (peerKey) {
      var deriveParams = useAlg === 'x25519'
        ? { name: 'X25519', public: peerKey }
        : { name: 'ECDH', public: peerKey };
      return crypto.subtle.deriveBits(deriveParams, mine.privateKey, 256);
    }).then(function (shared) {
      return hkdf(shared, purpose || 'message-key');
    }).then(function (bits) {
      return importAes(bits);
    }).then(function (key) {
      keyCache[cacheKey] = key;
      return key;
    });
  };

  /* ------------------------------------------------------------ 消息加解密 */
  function aadFor(convId) { return E.encode('conv:' + convId); }

  /** 加密消息并附带发送方公钥指纹，便于对方检测密钥变化。 */
  SC.crypto.encrypt = function (identity, peerPublicKey, convId, plaintext) {
    return SC.crypto.sessionKey(identity, peerPublicKey).then(function (key) {
      var iv = crypto.getRandomValues(new Uint8Array(12));
      return crypto.subtle.encrypt({ name: 'AES-GCM', iv: iv, additionalData: aadFor(convId) }, key, E.encode(plaintext))
        .then(function (ct) {
          return SC.crypto.fingerprint(identity).then(function (kf) {
            return JSON.stringify({ c: b64(ct), n: b64(iv), kf: kf });
          });
        });
    });
  };

  SC.crypto.decrypt = function (identity, peerPublicKey, convId, payload) {
    var obj;
    try { obj = typeof payload === 'string' ? JSON.parse(payload) : payload; } catch (e) { return Promise.reject(new Error('消息格式无效')); }
    if (!obj || !obj.c || !obj.n) { return Promise.reject(new Error('消息格式无效')); }
    return SC.crypto.sessionKey(identity, peerPublicKey).then(function (key) {
      return crypto.subtle.decrypt(
        { name: 'AES-GCM', iv: unb64(obj.n), additionalData: aadFor(convId) },
        key, unb64(obj.c)
      );
    }).then(function (buf) { return D.decode(buf); });
  };

  /* -------------------------------------------------------------- 群密钥 */
  SC.crypto.generateGroupKey = function () {
    return crypto.getRandomValues(new Uint8Array(32));
  };

  /** 用我的私钥 + 成员公钥封装群密钥；附带我的公钥，供对方解封时派生同一共享密钥。 */
  SC.crypto.wrapGroupKey = function (identity, memberPublicKey, gk) {
    return SC.crypto.sessionKey(identity, memberPublicKey, null, 'group-key-wrap').then(function (key) {
      var iv = crypto.getRandomValues(new Uint8Array(12));
      return crypto.subtle.encrypt({ name: 'AES-GCM', iv: iv }, key, gk).then(function (ct) {
        return JSON.stringify({ n: b64(iv), c: b64(ct), from: identity.publicKey });
      });
    });
  };

  /**
   * 解封：用「我的私钥 + 封装者公钥」派生，与封装方的「封装者私钥 + 我的公钥」对称。
   * 新数据以 wrapped.from 为准，peerPublicKey 仅作旧数据回退。
   */
  SC.crypto.unwrapGroupKey = function (identity, peerPublicKey, wrapped) {
    var obj;
    try { obj = typeof wrapped === 'string' ? JSON.parse(wrapped) : wrapped; } catch (e) { return Promise.reject(new Error('群密钥格式无效')); }
    var from = obj.from || peerPublicKey;
    if (!from) { return Promise.reject(new Error('群密钥缺少封装者公钥，请让邀请人重新邀请')); }
    return SC.crypto.sessionKey(identity, from, null, 'group-key-wrap').then(function (key) {
      return crypto.subtle.decrypt({ name: 'AES-GCM', iv: unb64(obj.n) }, key, unb64(obj.c));
    }).then(function (buf) { return new Uint8Array(buf); });
  };

  SC.crypto.importGroupKey = function (raw) {
    return importAes(raw);
  };

  SC.crypto.encryptWithKey = function (key, convId, plaintext) {
    var iv = crypto.getRandomValues(new Uint8Array(12));
    return crypto.subtle.encrypt({ name: 'AES-GCM', iv: iv, additionalData: aadFor(convId) }, key, E.encode(plaintext))
      .then(function (ct) { return JSON.stringify({ c: b64(ct), n: b64(iv), t: 'g' }); });
  };

  SC.crypto.decryptWithKey = function (key, convId, payload) {
    var obj;
    try { obj = typeof payload === 'string' ? JSON.parse(payload) : payload; } catch (e) { return Promise.reject(new Error('消息格式无效')); }
    return crypto.subtle.decrypt({ name: 'AES-GCM', iv: unb64(obj.n), additionalData: aadFor(convId) }, key, unb64(obj.c))
      .then(function (buf) { return D.decode(buf); });
  };

  /* ------------------------------------------------------------ 文件加解密 */
  SC.crypto.encryptBytes = function (key, buf) {
    var iv = crypto.getRandomValues(new Uint8Array(12));
    return crypto.subtle.encrypt({ name: 'AES-GCM', iv: iv }, key, buf).then(function (ct) {
      var out = new Uint8Array(12 + ct.byteLength);
      out.set(iv, 0);
      out.set(new Uint8Array(ct), 12);
      return out.buffer;
    });
  };

  SC.crypto.decryptBytes = function (key, buf) {
    var bytes = new Uint8Array(buf);
    if (bytes.length < 13) { return Promise.reject(new Error('文件已损坏')); }
    var iv = bytes.slice(0, 12);
    var ct = bytes.slice(12);
    return crypto.subtle.decrypt({ name: 'AES-GCM', iv: iv }, key, ct);
  };

  /* ------------------------------------------------------------ 指纹/安全码 */
  SC.crypto.fingerprint = function (identity) {
    var alg = identity.keys.x25519 ? 'x25519' : 'p256';
    var pub = unb64(identity.keys[alg].publicB64);
    return crypto.subtle.digest('SHA-256', pub).then(function (h) {
      return hex(h).slice(0, 8);
    });
  };

  /** 安全码：SHA-256(min(A,B)||max(A,B)) 前 30 字节，12 组 × 5 位。 */
  SC.crypto.safetyCode = function (identity, peerPublicKey) {
    var peer = SC.crypto.parsePublicKey(peerPublicKey);
    if (!peer) { return Promise.reject(new Error('对方公钥无效')); }
    var alg = SC.crypto.negotiate(identity, peer);
    if (!alg) { return Promise.reject(new Error('算法不兼容')); }
    var mineRaw = unb64(identity.keys[alg].publicB64);
    var peerRaw = peer[alg];
    var a = hex(mineRaw), b = hex(peerRaw);
    var data = a < b ? concat(mineRaw, peerRaw) : concat(peerRaw, mineRaw);
    return crypto.subtle.digest('SHA-256', data).then(function (h) {
      var s = hex(h).slice(0, 60).toUpperCase();
      var groups = [];
      for (var i = 0; i < 12; i++) { groups.push(s.substr(i * 5, 5)); }
      return groups;
    });
  };

  SC.crypto.peerKeyHash = function (peerPublicKey) {
    return crypto.subtle.digest('SHA-256', E.encode(String(peerPublicKey))).then(function (h) {
      return hex(h).slice(0, 16);
    });
  };

  /* -------------------------------------------------------- 公钥获取/缓存 */
  var PK_PREFIX = 'sc_pk_';
  var PK_TTL = 30 * 86400000;

  SC.crypto.peerPublicKey = function (publicId) {
    var cached = null;
    try { cached = JSON.parse(localStorage.getItem(PK_PREFIX + publicId) || 'null'); } catch (e) {}
    if (cached && cached.k && Date.now() - cached.t < PK_TTL) {
      return Promise.resolve(cached.k);
    }
    return SC.api('user/info?public_id=' + encodeURIComponent(publicId)).then(function (data) {
      var key = data.user && data.user.public_key ? data.user.public_key : '';
      if (key) {
        try { localStorage.setItem(PK_PREFIX + publicId, JSON.stringify({ k: key, t: Date.now() })); } catch (e) {}
      }
      return key;
    });
  };

  SC.crypto.clearPeerKey = function (publicId) {
    try { localStorage.removeItem(PK_PREFIX + publicId); } catch (e) {}
  };
})();
