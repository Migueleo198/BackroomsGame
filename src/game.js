/* ============================================================
   game.js — bootstrap, input wiring, lifecycle (new game /
   descend / death), and the main render loop. Loaded last;
   calls BR.game.start() once the DOM is ready.
   ============================================================ */
(function (BR) {
  'use strict';
  var T = THREE, game = {};
  var menu, crosshair, hud, vignette;

  // ---------------- bootstrap ----------------
  game.start = function () {
    if (!window.THREE) { var e = document.getElementById('err'); if (e) e.style.display = 'block'; return; }
    var c = BR.cfg, ctx = BR.ctx, S = BR.S;

    var canvas = document.getElementById('c');
    ctx.canvas = canvas;
    ctx.fxEl = document.getElementById('fx');
    menu = document.getElementById('menu');
    crosshair = document.getElementById('crosshair');
    hud = document.getElementById('hud');
    vignette = document.getElementById('vignette');

    var renderer = new T.WebGLRenderer({ canvas: canvas, antialias: true, powerPreference: 'high-performance' });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.outputEncoding = T.sRGBEncoding;
    renderer.toneMapping = T.ACESFilmicToneMapping;
    renderer.toneMappingExposure = c.EXPOSURE;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = T.PCFSoftShadowMap;
    ctx.renderer = renderer;

    var scene = new T.Scene();
    var fogCol = new T.Color(0x8f8350);
    scene.background = fogCol.clone();
    scene.fog = new T.FogExp2(fogCol.getHex(), 0.045);
    ctx.scene = scene; ctx.fogCol = fogCol;

    var camera = new T.PerspectiveCamera(78, window.innerWidth / window.innerHeight, 0.05, 220);
    camera.rotation.order = 'YXZ';
    ctx.camera = camera;
    ctx.clock = new T.Clock();

    // procedural PMREM environment -> believable reflections on metal/plastic
    if (c.ENVMAP && T.PMREMGenerator) {
      try {
        var pmrem = new T.PMREMGenerator(renderer);
        var envTex = BR.tex.env();
        var rt = pmrem.fromEquirectangular(envTex);
        scene.environment = rt.texture;
        envTex.dispose(); pmrem.dispose();
      } catch (e) { console.warn('[env] PMREM init failed:', e); }
    }

    // build subsystems
    BR.world.initMaterials();
    BR.lights.init();
    BR.items.init();
    BR.ui.init();

    ctx.composer = setupPostFX();   // bloom via Three.js postprocessing modules (optional)

    wireMenu();
    wireInput();
    window.addEventListener('resize', onResize);

    game.newGame();
    loop();
  };

  function onResize() {
    var ctx = BR.ctx;
    ctx.camera.aspect = window.innerWidth / window.innerHeight;
    ctx.camera.updateProjectionMatrix();
    ctx.renderer.setSize(window.innerWidth, window.innerHeight);
    if (ctx.composer) ctx.composer.setSize(window.innerWidth, window.innerHeight);
  }

  // ---- Three.js postprocessing (EffectComposer + UnrealBloomPass + gamma) ----
  // Degrades gracefully: if the addon scripts didn't load, returns null and we
  // render the scene directly.
  function setupPostFX() {
    var ctx = BR.ctx, c = BR.cfg, w = window.innerWidth, h = window.innerHeight;
    // we need the composer core + a way to draw the scene + the gamma fix
    var coreOk = THREE.EffectComposer && THREE.ShaderPass && THREE.CopyShader && THREE.GammaCorrectionShader;
    var canDrawScene = THREE.RenderPass || THREE.SSAOPass;
    if (!coreOk || !canDrawScene) {
      console.info('[postfx] postprocessing modules not present — rendering directly.');
      return null;
    }
    try {
      var composer = new THREE.EffectComposer(ctx.renderer);

      // scene pass: SSAO (contact shadows in corners) if available + enabled, else plain
      if (c.SSAO && THREE.SSAOPass) {
        var ssao = new THREE.SSAOPass(ctx.scene, ctx.camera, w, h);
        ssao.kernelRadius = 10;
        ssao.minDistance = 0.0012;
        ssao.maxDistance = 0.12;
        composer.addPass(ssao);
        ctx.ssao = ssao;
      } else if (THREE.RenderPass) {
        composer.addPass(new THREE.RenderPass(ctx.scene, ctx.camera));
      } else {
        return null;
      }

      // bloom
      if (c.BLOOM && THREE.UnrealBloomPass) {
        var bloom = new THREE.UnrealBloomPass(new THREE.Vector2(w, h), c.BLOOM_STRENGTH, c.BLOOM_RADIUS, c.BLOOM_THRESHOLD);
        composer.addPass(bloom);
        ctx.bloom = bloom;
      }

      composer.addPass(new THREE.ShaderPass(THREE.GammaCorrectionShader)); // linear -> sRGB at the end
      return composer;
    } catch (e) {
      console.warn('[postfx] init failed, falling back to direct render:', e);
      return null;
    }
  }

  // ---------------- lifecycle ----------------
  game.newGame = function () {
    var S = BR.S, ctx = BR.ctx, c = BR.cfg;
    S.dead = false; S.uiOpen = false;
    BR.ui.hideOverlays();
    S.health = 100; S.sanity = 100; S.stamina = 100; S.battery = 100;
    S.exhausted = false; S.flashOn = false; S.hasFlashlight = false; S.hasKey = false;
    S.level = 1; S.almondsDrunk = 0;
    S.inv = {}; S.order = []; S.active = 0; S.journal = [];
    S.damageFlash = 0; S.shake = 0;
    S.velY = 0; S.posY = 0; S.crouch = 0; S.grounded = true; S.keys = {};

    BR.world.build();
    BR.lights.placeLamps();
    BR.items.place();
    BR.entity.reset();
    ctx.camera.position.set(S.pos.x, c.EYE, S.pos.z);
    ctx.camera.rotation.set(0, S.yaw, 0);
    BR.lights.update(0.016);   // seed light positions for the scene behind the menu
    BR.items.renderHotbar(); BR.ui.updateObjective(); BR.ui.updateHud();
    BR.ui.toast('Walk. Keep your lantern and your head.');
  };

  game.tryDescend = function () {
    var S = BR.S, ctx = BR.ctx, c = BR.cfg;
    if (!S.hasKey) { BR.ui.toast('The door won’t budge. Find the key.'); BR.audio.blip(140, 0.12, 'sawtooth', 0.06); return; }
    BR.items.removeKey(); S.hasKey = false;
    S.level++; S.sanity = Math.min(100, S.sanity + 18); S.damageFlash = 0;
    S.whiteFlash = 1; S.whiteWasOn = true;   // player.fx renders + decays the flash
    setTimeout(function () {
      BR.world.build(); BR.lights.placeLamps(); BR.items.place(); BR.entity.reset();
      ctx.camera.position.set(S.pos.x, c.EYE, S.pos.z); ctx.camera.rotation.set(0, S.yaw, 0);
      BR.lights.update(0.016);
      BR.ui.toast('You noclip deeper… Level ' + S.level + '.');
      BR.ui.updateObjective();
    }, 260);
    BR.audio.blip(330, 0.2, 'sine', 0.08); BR.audio.blip(220, 0.3, 'sine', 0.06);
  };

  game.die = function (how) {
    var S = BR.S;
    if (S.dead) return;
    S.dead = true; S.flashOn = false;
    if (document.pointerLockElement === BR.ctx.canvas) document.exitPointerLock();
    BR.ui.showDeath(how);
    BR.audio.blip(90, 0.6, 'sawtooth', 0.1);
  };

  // ---------------- input ----------------
  function requestLock() { var cv = BR.ctx.canvas; if (cv.requestPointerLock) cv.requestPointerLock(); }

  function code2key(code) {
    switch (code) {
      case 'KeyW': case 'ArrowUp': return 'w';
      case 'KeyS': case 'ArrowDown': return 's';
      case 'KeyA': case 'ArrowLeft': return 'a';
      case 'KeyD': case 'ArrowRight': return 'd';
      case 'ShiftLeft': case 'ShiftRight': return 'shift';
      case 'Space': return 'jump';
      case 'ControlLeft': case 'ControlRight': case 'KeyC': return 'crouch';
    }
    return null;
  }

  function wireInput() {
    var S = BR.S, canvas = BR.ctx.canvas;

    document.addEventListener('pointerlockchange', function () {
      S.playing = (document.pointerLockElement === canvas);
      if (crosshair) crosshair.style.display = S.playing ? 'block' : 'none';
      if (hud) hud.style.display = S.playing ? 'block' : 'none';
      if (S.playing) { if (menu) menu.style.display = 'none'; }
      else if (!S.dead && menu) menu.style.display = 'flex';
    });

    document.addEventListener('mousemove', function (e) {
      if (!S.playing || S.uiOpen || S.dead) return;
      S.yaw -= e.movementX * S.sens;
      S.pitch -= e.movementY * S.sens;
      var lim = Math.PI / 2 - 0.02;
      if (S.pitch > lim) S.pitch = lim;
      if (S.pitch < -lim) S.pitch = -lim;
    });

    canvas.addEventListener('click', function () {
      if (!S.playing && !S.dead) { BR.audio.start(); requestLock(); }
      else if (S.playing && !S.uiOpen && !S.dead) BR.items.useActive();
    });

    window.addEventListener('keydown', function (e) {
      var k = code2key(e.code);
      if (k) { S.keys[k] = true; if (S.playing && (e.code.indexOf('Arrow') === 0 || e.code === 'Space')) e.preventDefault(); }
      if (!S.playing) return;

      if (BR.ui.noteOpen()) {
        if (e.code === 'KeyE' || e.code === 'Space' || e.code === 'Escape' || e.code === 'Enter') { e.preventDefault(); BR.ui.closeNote(); }
        return;
      }
      if (e.code === 'Tab') { e.preventDefault(); BR.ui.toggleJournal(); return; }
      if (S.uiOpen) return;

      if (e.code === 'KeyE') { e.preventDefault(); BR.items.doInteract(); }
      else if (e.code === 'KeyF') BR.lights.toggleFlash();
      else if (e.code === 'KeyQ') BR.items.useActive();
      else if (e.code.indexOf('Digit') === 0) { var n = parseInt(e.code.slice(5), 10); if (n >= 1 && n <= 6) BR.items.selectSlot(n - 1); }
    });
    window.addEventListener('keyup', function (e) { var k = code2key(e.code); if (k) S.keys[k] = false; });
    window.addEventListener('wheel', function (e) { if (S.playing && !S.uiOpen && !S.dead) BR.items.cycleSlot(e.deltaY > 0 ? 1 : -1); }, { passive: true });

    // overlay click-to-close
    var noteOv = document.getElementById('noteOverlay');
    var jrnOv = document.getElementById('journalOverlay');
    if (noteOv) noteOv.addEventListener('click', BR.ui.closeNote);
    if (jrnOv) jrnOv.addEventListener('click', function (e) { if (e.target === jrnOv) BR.ui.toggleJournal(); });
  }

  function wireMenu() {
    var ctx = BR.ctx, S = BR.S, cam = ctx.camera, scene = ctx.scene;
    var fov = document.getElementById('fov'), fovOut = document.getElementById('fovOut');
    var sensEl = document.getElementById('sens'), sensOut = document.getElementById('sensOut');
    var vis = document.getElementById('vis'), visOut = document.getElementById('visOut');
    var soundBtn = document.getElementById('sound');

    function applyFov() { cam.fov = +fov.value; cam.updateProjectionMatrix(); fovOut.textContent = fov.value + '°'; }
    function applySens() { S.sens = (+sensEl.value) * 0.0024; sensOut.textContent = (+sensEl.value).toFixed(1) + '×'; }
    function applyVis() { var v = +vis.value; S.baseFog = 0.075 - (v / 100) * 0.057; scene.fog.density = S.baseFog; visOut.textContent = v + '%'; }
    if (fov) fov.addEventListener('input', applyFov);
    if (sensEl) sensEl.addEventListener('input', applySens);
    if (vis) vis.addEventListener('input', applyVis);
    if (fov) applyFov(); if (sensEl) applySens(); if (vis) applyVis();

    var play = document.getElementById('play'), regen = document.getElementById('regen'), respawn = document.getElementById('respawn');
    if (play) play.addEventListener('click', function () { BR.audio.start(); requestLock(); });
    if (regen) regen.addEventListener('click', function () { game.newGame(); requestLock(); });
    if (respawn) respawn.addEventListener('click', function () { BR.ui.hideOverlays(); game.newGame(); BR.audio.start(); requestLock(); });
    if (soundBtn) soundBtn.addEventListener('click', function () {
      BR.audio.setHum(!BR.audio.humOn);
      soundBtn.textContent = 'Sound: ' + (BR.audio.humOn ? 'on' : 'off');
    });
  }

  // ---------------- main loop ----------------
  var hudTick = 0;
  function loop() {
    requestAnimationFrame(loop);
    var ctx = BR.ctx, S = BR.S;
    var dt = Math.min(ctx.clock.getDelta(), 0.05);
    var active = S.playing && !S.uiOpen && !S.dead;

    if (active) {
      BR.player.move(dt);
      BR.player.vitals(dt);
      BR.entity.update(dt);
      BR.lights.update(dt);
      BR.items.updateInteraction();
    } else {
      ctx.camera.rotation.set(S.pitch, S.yaw, 0);
      BR.lights.updateFlashlight(dt);
    }

    BR.audio.update(dt);
    BR.items.animate(dt);
    BR.player.fx(dt);

    hudTick += dt;
    if (hudTick > 0.1) { hudTick = 0; if (active) { BR.ui.updateHud(); BR.ui.updateObjective(); } }

    if (ctx.composer) ctx.composer.render();
    else ctx.renderer.render(ctx.scene, ctx.camera);
  }

  BR.game = game;

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', game.start);
  else game.start();
})(window.BR);
