/* ============================================================
   audio.js — WebAudio fluorescent hum + procedural SFX
   (footsteps, heartbeat, whispers, the Hunter's growl, blips).
   ============================================================ */
(function (BR) {
  'use strict';
  var A = {};
  var audioCtx = null, humGain = null;
  A.humOn = true;

  A.start = function () {
    if (audioCtx) { if (audioCtx.state === 'suspended') audioCtx.resume(); return; }
    try {
      audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      humGain = audioCtx.createGain(); humGain.gain.value = A.humOn ? 0.034 : 0;
      var lp = audioCtx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 340;
      var o1 = audioCtx.createOscillator(); o1.type = 'sawtooth'; o1.frequency.value = 60;
      var o2 = audioCtx.createOscillator(); o2.type = 'sine'; o2.frequency.value = 120;
      o1.connect(lp); o2.connect(lp); lp.connect(humGain); humGain.connect(audioCtx.destination);
      o1.start(); o2.start();
    } catch (e) { audioCtx = null; }
  };

  A.blip = function (freq, dur, type, vol) {
    if (!audioCtx || !A.humOn) return;
    try {
      var o = audioCtx.createOscillator(), g = audioCtx.createGain();
      o.type = type || 'sine'; o.frequency.value = freq;
      o.connect(g); g.connect(audioCtx.destination);
      var t = audioCtx.currentTime;
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(vol || 0.06, t + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.start(t); o.stop(t + dur + 0.02);
    } catch (e) { }
  };

  A.footstep = function () { if (Math.random() < 0.5) A.blip(60 + Math.random() * 30, 0.07, 'triangle', 0.03); else A.blip(48, 0.08, 'sine', 0.025); };
  A.heartbeat = function () { A.blip(58, 0.13, 'sine', 0.09); setTimeout(function () { A.blip(48, 0.16, 'sine', 0.07); }, 150); };
  A.whisper = function () { A.blip(180 + Math.random() * 500, 0.18, 'sawtooth', 0.02); };
  A.growl = function () { A.blip(80, 0.5, 'sawtooth', 0.07); A.blip(120, 0.4, 'square', 0.03); };

  // ---------- noise-based body sounds (breath/effort/impact) ----------
  var noiseBuf = null;
  function noise() {
    if (noiseBuf) return noiseBuf;
    var len = Math.floor(audioCtx.sampleRate * 1.0);
    noiseBuf = audioCtx.createBuffer(1, len, audioCtx.sampleRate);
    var d = noiseBuf.getChannelData(0);
    for (var i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    return noiseBuf;
  }
  // filtered noise burst with a gentle envelope; optional sweep of the filter
  function breathNoise(dur, type, f0, f1, q, vol, atk) {
    if (!audioCtx || !A.humOn) return;
    try {
      var src = audioCtx.createBufferSource(); src.buffer = noise();
      var filt = audioCtx.createBiquadFilter(); filt.type = type; filt.Q.value = q;
      var g = audioCtx.createGain();
      src.connect(filt); filt.connect(g); g.connect(audioCtx.destination);
      var t = audioCtx.currentTime;
      filt.frequency.setValueAtTime(f0, t);
      filt.frequency.linearRampToValueAtTime(f1, t + dur);
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(vol, t + (atk || 0.02));
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      src.start(t); src.stop(t + dur + 0.02);
    } catch (e) { }
  }

  A.jump = function () { breathNoise(0.26, 'bandpass', 520, 360, 0.7, 0.05, 0.01); A.blip(165, 0.12, 'sine', 0.035); };  // exhale + effort
  A.land = function () { breathNoise(0.20, 'lowpass', 320, 150, 0.8, 0.07, 0.004); A.blip(72, 0.13, 'sine', 0.05); };    // thud
  A.breath = function (intensity) { var v = 0.028 * (intensity || 1); breathNoise(0.5, 'bandpass', 360, 620, 0.6, v, 0.09); }; // tired inhale
  A.hurt = function () { breathNoise(0.28, 'bandpass', 300, 220, 0.6, 0.07, 0.004); A.blip(92, 0.2, 'sawtooth', 0.06); };  // pained grunt

  A.setHum = function (on) {
    A.humOn = on;
    if (audioCtx && humGain) { humGain.gain.value = on ? 0.034 : 0; if (on && audioCtx.state === 'suspended') audioCtx.resume(); }
  };

  // gentle hum modulation
  A.update = function (dt) {
    if (!audioCtx || !humGain || !A.humOn) return;
    BR.S.humLfo += dt;
    var base = 0.034 + Math.sin(BR.S.humLfo * 8.0) * 0.004 + (Math.random() < 0.02 ? -0.018 : 0);
    humGain.gain.setTargetAtTime(Math.max(0, base), audioCtx.currentTime, 0.05);
  };

  BR.audio = A;
})(window.BR);
