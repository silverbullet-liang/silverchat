/* 语音 / 视频通话：WebRTC P2P，服务器只转发信令与保存记录 */
(function () {
  'use strict';

  var SC = window.SC = window.SC || {};
  SC.call = SC.call || {};

  var DEFAULT_ICE = [{ urls: 'stun:stun.miwifi.com:3478' }];
  var current = null;
  var incoming = null;
  var layer = null;
  var ticker = 0;

  function supported() {
    return !!(window.RTCPeerConnection && navigator.mediaDevices && navigator.mediaDevices.getUserMedia);
  }

  function fmtTime(sec) {
    sec = Math.max(0, Math.floor(sec));
    var m = Math.floor(sec / 60);
    var s = sec % 60;
    return (m < 10 ? '0' + m : m) + ':' + (s < 10 ? '0' + s : s);
  }

  function iceConfig(servers) {
    return { iceServers: (servers && servers.length ? servers : DEFAULT_ICE) };
  }

  function setStatus(text) {
    var el = SC.qs('#callStatus');
    if (el) { el.textContent = text; }
  }

  function setDuration(ts) {
    var el = SC.qs('#callTimer');
    if (el && ts) { el.textContent = fmtTime(Date.now() / 1000 - ts); }
  }

  function removeLayer() {
    if (ticker) { clearInterval(ticker); ticker = 0; }
    if (layer && layer.parentNode) { layer.parentNode.removeChild(layer); }
    layer = null;
  }

  function closePeer() {
    if (!current) { return; }
    if (current.poll) { clearInterval(current.poll); }
    if (current.pc) {
      try { current.pc.close(); } catch (e) {}
    }
    if (current.stream) {
      current.stream.getTracks().forEach(function (t) { t.stop(); });
    }
    current = null;
  }

  /* -------------------------------------------------------------- 通话层 */
  function buildLayer(peer, mediaType, mode) {
    removeLayer();
    var name = (peer && peer.nickname) || '对方';
    var avatar = peer && peer.public_id ? SC.ui.avatar(peer.public_id, name, 'avatar-xxl', !!peer.avatar) : '';
    var isVideo = mediaType === 2;
    layer = SC.el('div', { class: 'call-layer' });
    layer.innerHTML =
      '<div class="call-stage">' +
        '<video id="callRemote" class="call-remote' + (isVideo ? '' : ' hidden') + '" autoplay playsinline></video>' +
        '<div class="call-audio' + (isVideo ? ' hidden' : '') + '">' + avatar +
          '<div class="call-audio-name">' + SC.esc(name) + '</div></div>' +
        '<video id="callLocal" class="call-local' + (isVideo ? '' : ' hidden') + '" autoplay playsinline muted></video>' +
        '<div class="call-head"><div class="call-name">' + SC.esc(name) + '</div>' +
          '<div class="call-status" id="callStatus"></div>' +
          '<div class="call-timer" id="callTimer"></div></div>' +
        '<div class="call-actions" id="callActions"></div>' +
      '</div>';
    document.body.appendChild(layer);

    var actions = SC.qs('#callActions');
    var hang = SC.el('button', { class: 'call-btn hang', type: 'button', 'aria-label': '挂断' });
    hang.innerHTML = '<svg viewBox="0 0 24 24" width="26" height="26"><path d="M3.5 14.6c4.8-4.3 12.2-4.3 17 0l1.2 1.1-2.6 3-3.1-1.6c-.3-.2-.5-.5-.5-.9v-1.6a12.5 12.5 0 0 0-6.9 0v1.6c0 .4-.2.7-.5.9l-3.1 1.6-2.6-3z" fill="currentColor"/></svg>';

    if (mode === 'incoming') {
      var reject = SC.el('button', { class: 'call-btn hang', type: 'button', 'aria-label': '拒绝' });
      reject.innerHTML = '<svg viewBox="0 0 24 24" width="26" height="26"><path d="M3.5 14.6c4.8-4.3 12.2-4.3 17 0l1.2 1.1-2.6 3-3.1-1.6c-.3-.2-.5-.5-.5-.9v-1.6a12.5 12.5 0 0 0-6.9 0v1.6c0 .4-.2.7-.5.9l-3.1 1.6-2.6-3z" fill="currentColor"/></svg>';
      var accept = SC.el('button', { class: 'call-btn accept', type: 'button', 'aria-label': '接听' });
      accept.innerHTML = '<svg viewBox="0 0 24 24" width="26" height="26"><path d="M6.6 10.8c2.8 5.5 7 9.7 12.5 12.5l2.1-2.1c.5-.5.6-1.2.2-1.8-1-1.4-2.1-2.7-3.4-3.9-.5-.4-1.2-.4-1.7 0l-1.1 1.1a15.5 15.5 0 0 1-5.9-5.9l1.1-1.1c.4-.5.4-1.2 0-1.7A25.6 25.6 0 0 0 6.5 4c-.6-.4-1.3-.3-1.8.2L2.6 6.3c.6 1.6 1.4 3.1 2.3 4.5z" fill="currentColor" transform="rotate(-45 12 12)"/></svg>';
      reject.addEventListener('click', function () { SC.call.reject(); });
      accept.addEventListener('click', function () { SC.call.accept(); });
      actions.appendChild(reject);
      actions.appendChild(accept);
      setStatus(isVideo ? '邀请你视频通话…' : '邀请你语音通话…');
    } else {
      if (mode === 'active') {
        var mute = SC.el('button', { class: 'call-btn', type: 'button', 'aria-label': '静音', id: 'callMute' });
        mute.innerHTML = SC.icon('mic', 24);
        mute.addEventListener('click', function () { SC.call.toggleMute(mute); });
        actions.appendChild(mute);
        if (isVideo) {
          var cam = SC.el('button', { class: 'call-btn', type: 'button', 'aria-label': '摄像头', id: 'callCam' });
          cam.innerHTML = SC.icon('camera', 24);
          cam.addEventListener('click', function () { SC.call.toggleCamera(cam); });
          actions.appendChild(cam);
        }
        hang.addEventListener('click', function () { SC.call.hangup(); });
        actions.appendChild(hang);
      } else {
        hang.addEventListener('click', function () { SC.call.hangup(); });
        actions.appendChild(hang);
        setStatus('正在呼叫…');
      }
    }
  }

  /* ------------------------------------------------------------ 信令轮询 */
  function flushIce() {
    if (!current || !current.pc) { return; }
    var queue = current.pendingIce || [];
    current.pendingIce = [];
    queue.forEach(function (c) {
      current.pc.addIceCandidate(c).catch(function () {});
    });
  }

  function handleSignal(sig) {
    if (!current || !current.pc) { return; }
    if (sig.kind === 'offer') {
      var desc = JSON.parse(sig.payload).sdp;
      current.pc.setRemoteDescription(desc).then(function () {
        flushIce();
        return current.pc.createAnswer();
      }).then(function (ans) {
        return current.pc.setLocalDescription(ans);
      }).then(function () {
        return SC.api('call/signal', {
          body: { call_id: current.id, kind: 'answer', payload: JSON.stringify({ sdp: current.pc.localDescription }) }
        });
      }).catch(function () {});
    } else if (sig.kind === 'answer') {
      current.pc.setRemoteDescription(JSON.parse(sig.payload).sdp).then(flushIce).catch(function () {});
    } else if (sig.kind === 'ice') {
      var cand = JSON.parse(sig.payload);
      // 远端描述尚未设置时先缓冲，避免 addIceCandidate 失败丢候选
      if (current.pc.remoteDescription && current.pc.remoteDescription.type) {
        current.pc.addIceCandidate(cand).catch(function () {});
      } else {
        current.pendingIce.push(cand);
      }
    }
  }

  function startPoll() {
    if (!current) { return; }
    current.poll = setInterval(function () {
      if (!current || current.busy) { return; }
      current.busy = true;
      SC.api('call/poll?call_id=' + current.id + '&after_id=' + current.after).then(function (data) {
        if (!current) { return; }
        current.busy = false;
        (data.signals || []).forEach(function (s) {
          current.after = Math.max(current.after, s.id);
          handleSignal(s);
        });
        if (data.call) {
          if (data.call.status === 1 && !current.startedAt) {
            current.startedAt = data.call.started_at || Math.floor(Date.now() / 1000);
            setStatus('通话中');
            buildLayer(current.peer, current.mediaType, 'active');
            bindStreams();
            ticker = setInterval(function () { setDuration(current && current.startedAt); }, 1000);
          }
          if (data.call.status >= 2) {
            setStatus(data.call.status === 3 ? '对方无应答' : (data.call.status === 4 ? '对方已拒绝' : '通话已结束'));
            setTimeout(function () { closePeer(); removeLayer(); }, 900);
          }
        }
      }).catch(function () { if (current) { current.busy = false; } });
    }, 1000);
  }

  function bindStreams() {
    if (!current) { return; }
    var remote = SC.qs('#callRemote');
    var local = SC.qs('#callLocal');
    if (remote && current.remoteStream) {
      remote.srcObject = current.remoteStream;
      // 浏览器自动播放被拦截时，点击画面兜底播放
      if (!remote.dataset.playBound) {
        remote.dataset.playBound = '1';
        remote.addEventListener('click', function () { remote.play().catch(function () {}); });
      }
    }
    if (local && current.stream) { local.srcObject = current.stream; }
  }

  function preparePeer(iceServers) {
    var pc = new RTCPeerConnection(iceConfig(iceServers));
    current.pc = pc;
    current.remoteStream = new MediaStream();
    pc.ontrack = function (e) {
      if (current && current.remoteStream) {
        e.streams[0].getTracks().forEach(function (t) { current.remoteStream.addTrack(t); });
        bindStreams();
      }
    };
    pc.onicecandidate = function (e) {
      if (e.candidate && current) {
        SC.api('call/signal', {
          body: { call_id: current.id, kind: 'ice', payload: JSON.stringify(e.candidate) }
        }).catch(function () {});
      }
    };
    return pc;
  }

  function getMedia(mediaType) {
    return navigator.mediaDevices.getUserMedia({
      audio: true,
      video: mediaType === 2 ? { width: { ideal: 1280 }, height: { ideal: 720 } } : false
    });
  }

  /* -------------------------------------------------------------- 对外 API */
  SC.call.start = function (convId, mediaType) {
    if (!supported()) { SC.toast('当前浏览器不支持通话', 'error'); return; }
    if (current || incoming) { SC.toast('正在通话中'); return; }
    SC.api('call/start', { body: { conv_id: convId, media_type: mediaType } }).then(function (data) {
      current = {
        id: data.call.id,
        peer: data.call.peer,
        mediaType: mediaType,
        after: 0,
        busy: false,
        startedAt: 0,
        stream: null,
        remoteStream: null,
        pendingIce: [],
        pc: null
      };
      buildLayer(data.call.peer, mediaType, 'outgoing');
      preparePeer(data.ice_servers);
      return getMedia(mediaType).then(function (stream) {
        current.stream = stream;
        stream.getTracks().forEach(function (t) { current.pc.addTrack(t, stream); });
        bindStreams();
        return current.pc.createOffer();
      }).then(function (offer) {
        return current.pc.setLocalDescription(offer);
      }).then(function () {
        return SC.api('call/signal', {
          body: { call_id: current.id, kind: 'offer', payload: JSON.stringify({ sdp: current.pc.localDescription }) }
        });
      }).then(startPoll);
    }).catch(function (e) {
      closePeer();
      removeLayer();
      SC.toast(e.message || '无法发起通话', 'error');
    });
  };

  SC.call.accept = function () {
    if (!incoming) { return; }
    var call = incoming;
    incoming = null;
    SC.api('call/answer', { body: { call_id: call.id, accept: 1 } }).then(function (data) {
      current = {
        id: call.id,
        peer: call.caller,
        mediaType: call.media_type,
        after: 0,
        busy: false,
        startedAt: Math.floor(Date.now() / 1000),
        stream: null,
        remoteStream: null,
        pendingIce: [],
        pc: null
      };
      buildLayer(call.caller, call.media_type, 'active');
      setStatus('连接中…');
      preparePeer(data.ice_servers);
      return getMedia(call.media_type).then(function (stream) {
        current.stream = stream;
        stream.getTracks().forEach(function (t) { current.pc.addTrack(t, stream); });
        bindStreams();
        startPoll();
        ticker = setInterval(function () { setDuration(current && current.startedAt); }, 1000);
      });
    }).catch(function (e) {
      closePeer();
      removeLayer();
      SC.toast(e.message || '接听失败', 'error');
    });
  };

  SC.call.reject = function () {
    if (!incoming) { return; }
    var call = incoming;
    incoming = null;
    removeLayer();
    SC.api('call/answer', { body: { call_id: call.id, accept: 0 } }).catch(function () {});
  };

  SC.call.hangup = function () {
    if (!current) { removeLayer(); return; }
    var id = current.id;
    closePeer();
    removeLayer();
    SC.api('call/end', { body: { call_id: id } }).catch(function () {});
  };

  SC.call.toggleMute = function (btn) {
    if (!current || !current.stream) { return; }
    var track = current.stream.getAudioTracks()[0];
    if (!track) { return; }
    track.enabled = !track.enabled;
    btn.classList.toggle('off', !track.enabled);
  };

  SC.call.toggleCamera = function (btn) {
    if (!current || !current.stream) { return; }
    var track = current.stream.getVideoTracks()[0];
    if (!track) { return; }
    track.enabled = !track.enabled;
    btn.classList.toggle('off', !track.enabled);
    var local = SC.qs('#callLocal');
    if (local) { local.classList.toggle('hidden', !track.enabled); }
  };

  /* -------------------------------------------------------------- 来电入口 */
  function showIncoming(call) {
    if (current || incoming) { return; }
    incoming = call;
    buildLayer(call.caller, call.media_type, 'incoming');
    setStatus(call.media_type === 2 ? '邀请你视频通话…' : '邀请你语音通话…');
    // 60 秒未处理自动关闭（服务端同时会置为未接）
    setTimeout(function () {
      if (incoming && incoming.id === call.id) {
        incoming = null;
        removeLayer();
      }
    }, 60000);
  }

  SC.on('poll:call', function (call) {
    if (!call || !call.id) { return; }
    if (SC.state.user && SC.state.user.is_staff) { return; }
    showIncoming(call);
  });

  SC.call.supported = supported;
})();
