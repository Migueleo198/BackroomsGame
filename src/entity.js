/* ============================================================
   entity.js — "The Hunter": an articulated, custom-shaded
   humanoid with procedural PBR skin (albedo+normal+roughness),
   a fresnel rim / pulsing-subdermal shader, BFS pathfinding,
   line-of-sight + sound detection, and per-frame rig animation.
   ============================================================ */
(function (BR) {
  'use strict';
  var T = THREE, E = {};
  var skinMat = null, woundMat = null;

  function buildSkinMaterial() {
    if (skinMat) return skinMat;
    var tx = BR.tex;
    var skinAlb = tx.skinAlbedo();
    var skinNrm = BR.util.canvasToNormal(tx.skinHeightCanvas(), 3.4, false);
    var skinRgh = tx.skinRough();
    skinMat = new T.MeshStandardMaterial({
      map: skinAlb, normalMap: skinNrm, normalScale: new T.Vector2(1.1, 1.1),
      roughnessMap: skinRgh, roughness: 0.82, metalness: 0.0,
      color: 0xb9b2a6, emissive: 0x0e0606, emissiveIntensity: 0.5
    });
    skinMat.onBeforeCompile = function (sh) {
      sh.uniforms.uTime = { value: 0 };
      sh.uniforms.uChase = { value: 0 };
      BR.S.monsterUniforms = sh.uniforms;
      sh.fragmentShader = sh.fragmentShader
        .replace('#include <common>', '#include <common>\nuniform float uTime;\nuniform float uChase;')
        .replace('#include <tonemapping_fragment>',
          '{ float _f = pow(1.0 - clamp(dot(normalize(normal), normalize(vViewPosition)),0.0,1.0), 3.0);\n' +
          '  vec3 _rim = mix(vec3(0.18,0.20,0.26), vec3(0.85,0.30,0.18), uChase);\n' +
          '  gl_FragColor.rgb += _rim * _f * (0.40 + 0.85*uChase);\n' +
          '  float _pulse = 0.5 + 0.5*sin(uTime*3.0 + vViewPosition.y*0.4);\n' +
          '  gl_FragColor.rgb += vec3(0.10,0.02,0.02) * _pulse * (0.10 + 0.40*uChase); }\n' +
          '#include <tonemapping_fragment>');
    };
    return skinMat;
  }
  function buildWoundMaterial() {
    if (woundMat) return woundMat;
    woundMat = new T.MeshStandardMaterial({
      map: BR.tex.wound(), color: 0xffffff, roughness: 0.32, metalness: 0.0,
      emissive: 0x3a0807, emissiveIntensity: 0.9
    });
    return woundMat;
  }

  function limbMesh(len, rTop, rBot) {
    var m = new T.Mesh(new T.CylinderGeometry(rBot, rTop, len, 10), skinMat);
    m.position.y = -len / 2; m.castShadow = true; return m;
  }
  function makeArm(side) {
    var shoulder = new T.Group(); shoulder.position.set(0.34 * side, 1.78, 0.0);
    shoulder.add(limbMesh(0.66, 0.10, 0.075));                       // thick upper arm
    var elbow = new T.Group(); elbow.position.y = -0.66; shoulder.add(elbow);
    elbow.add(limbMesh(0.62, 0.072, 0.05));                          // forearm
    var hand = new T.Group(); hand.position.y = -0.62; elbow.add(hand);
    var palm = new T.Mesh(new T.BoxGeometry(0.13, 0.06, 0.16), skinMat);
    palm.position.y = -0.05; palm.castShadow = true; hand.add(palm);
    for (var f = 0; f < 4; f++) {
      var fg = new T.Mesh(new T.CylinderGeometry(0.018, 0.006, 0.24, 6), skinMat);
      fg.position.set((f - 1.5) * 0.034, -0.16, 0.04); fg.rotation.x = 0.45; fg.castShadow = true; hand.add(fg);
    }
    var thumb = new T.Mesh(new T.CylinderGeometry(0.02, 0.008, 0.18, 6), skinMat);
    thumb.position.set(0.07 * side, -0.10, 0.02); thumb.rotation.z = 0.7 * side; thumb.castShadow = true; hand.add(thumb);
    return { shoulder: shoulder, elbow: elbow };
  }
  function makeLeg(side) {
    var hip = new T.Group(); hip.position.set(0.17 * side, 0.98, 0);  // knee ends at the floor
    hip.add(limbMesh(0.5, 0.13, 0.09));                              // thick thigh
    var knee = new T.Group(); knee.position.y = -0.5; hip.add(knee);
    knee.add(limbMesh(0.48, 0.085, 0.055));                          // shin (ends near y=0)
    var foot = new T.Mesh(new T.BoxGeometry(0.14, 0.07, 0.34), skinMat);
    foot.position.set(0, -0.46, 0.09); foot.castShadow = true; knee.add(foot);
    return { hip: hip, knee: knee };
  }

  function makeMesh() {
    buildSkinMaterial(); buildWoundMaterial();
    var g = new T.Group();
    var root = new T.Group(); g.add(root);

    // ---- bulky, hunched torso ----
    var pelvis = new T.Mesh(new T.SphereGeometry(0.28, 16, 12), skinMat);
    pelvis.scale.set(1.15, 0.85, 0.95); pelvis.position.set(0, 0.92, 0); pelvis.castShadow = true; root.add(pelvis);

    var spine = new T.Group(); spine.position.set(0, 0.98, 0); spine.rotation.x = 0.24; root.add(spine);
    var torso = new T.Mesh(new T.CylinderGeometry(0.27, 0.30, 0.62, 14), skinMat);
    torso.position.y = 0.38; torso.castShadow = true; spine.add(torso);
    var chest = new T.Mesh(new T.SphereGeometry(0.36, 18, 14), skinMat);   // broad pectoral mass
    chest.scale.set(1.05, 0.78, 0.85); chest.position.y = 0.72; chest.castShadow = true; spine.add(chest);
    // trapezius / shoulder hump
    var traps = new T.Mesh(new T.SphereGeometry(0.30, 14, 12), skinMat);
    traps.scale.set(1.3, 0.5, 0.7); traps.position.set(0, 0.92, -0.05); traps.castShadow = true; spine.add(traps);

    // ---- vertical chest wound: split flesh + beaded spine ----
    var woundStrip = new T.Mesh(new T.BoxGeometry(0.10, 0.95, 0.06), woundMat);
    woundStrip.position.set(0, 0.55, 0.30); spine.add(woundStrip);
    for (var w = 0; w < 7; w++) {
      var bead = new T.Mesh(new T.SphereGeometry(0.045, 10, 10), woundMat);
      bead.position.set(0, 0.18 + w * 0.13, 0.345); bead.castShadow = true; spine.add(bead);
    }
    // parted skin flaps on either side of the wound
    [-1, 1].forEach(function (sd) {
      var flap = new T.Mesh(new T.SphereGeometry(0.12, 12, 10), skinMat);
      flap.scale.set(0.6, 1.6, 0.5); flap.position.set(0.10 * sd, 0.55, 0.30); flap.castShadow = true; spine.add(flap);
    });

    // ---- neck + head (jutting forward, hunched) ----
    var neck = new T.Mesh(new T.CylinderGeometry(0.10, 0.13, 0.20, 10), skinMat);
    neck.position.set(0, 0.98, 0.06); neck.rotation.x = 0.5; neck.castShadow = true; spine.add(neck);
    var head = new T.Group(); head.position.set(0, 1.08, 0.16); spine.add(head);
    var skull = new T.Mesh(new T.SphereGeometry(0.21, 18, 18), skinMat);
    skull.scale.set(0.95, 1.05, 1.08); skull.castShadow = true; head.add(skull);
    var brow = new T.Mesh(new T.BoxGeometry(0.34, 0.08, 0.12), skinMat);   // heavy brow ridge
    brow.position.set(0, 0.06, 0.16); brow.castShadow = true; head.add(brow);
    var face = new T.Mesh(new T.SphereGeometry(0.18, 16, 14), skinMat);
    face.scale.set(0.85, 0.66, 0.95); face.position.set(0, -0.05, 0.12); face.castShadow = true; head.add(face);
    var jaw = new T.Group(); jaw.position.set(0, -0.10, 0.04); head.add(jaw);
    var jawMesh = new T.Mesh(new T.SphereGeometry(0.16, 14, 12), skinMat);
    jawMesh.scale.set(0.82, 0.46, 0.95); jawMesh.position.set(0, -0.05, 0.09); jawMesh.castShadow = true; jaw.add(jawMesh);

    var teethMat = new T.MeshStandardMaterial({ color: 0xc9bda0, roughness: 0.6, metalness: 0.0 });
    for (var ti = 0; ti < 10; ti++) {
      var ang = -0.9 + 1.8 * (ti / 9);
      var up = new T.Mesh(new T.ConeGeometry(0.016, 0.08, 5), teethMat);
      up.position.set(Math.sin(ang) * 0.12, -0.02, 0.11 + Math.cos(ang) * 0.02); up.rotation.x = Math.PI; head.add(up);
      var lo = new T.Mesh(new T.ConeGeometry(0.016, 0.07, 5), teethMat);
      lo.position.set(Math.sin(ang) * 0.11, -0.02, 0.13 + Math.cos(ang) * 0.02); jaw.add(lo);
    }

    // deep-set glowing white eyes
    var sockMat = new T.MeshStandardMaterial({ color: 0x05060a, roughness: 1.0, metalness: 0.0 });
    [-1, 1].forEach(function (sd) {
      var sock = new T.Mesh(new T.SphereGeometry(0.055, 10, 10), sockMat);
      sock.position.set(0.082 * sd, 0.0, 0.15); head.add(sock);
    });
    var eyeMat = new T.SpriteMaterial({ map: BR.tex.eyeGlow(), color: 0xeaf2ff, transparent: true, opacity: 0.85, depthWrite: false, blending: T.AdditiveBlending, fog: false });
    var eyeL = new T.Sprite(eyeMat.clone()); eyeL.position.set(-0.082, 0.0, 0.18); eyeL.scale.setScalar(0.11); head.add(eyeL);
    var eyeR = new T.Sprite(eyeMat.clone()); eyeR.position.set(0.082, 0.0, 0.18); eyeR.scale.setScalar(0.11); head.add(eyeR);

    var armL = makeArm(-1), armR = makeArm(1); root.add(armL.shoulder, armR.shoulder);
    var legL = makeLeg(-1), legR = makeLeg(1); root.add(legL.hip, legR.hip);

    var pl = new T.PointLight(0xbcd4ff, 0.0, 5.5, 2); pl.position.set(0, 1.5, 0.15); root.add(pl);

    g.userData = {
      root: root, spine: spine, torso: torso, head: head, jaw: jaw,
      armL: armL, armR: armR, legL: legL, legR: legR,
      eyeL: eyeL, eyeR: eyeR, light: pl, t: 0
    };
    BR.ctx.scene.add(g);

    // optional: replace the procedural rig with a loaded glTF model
    if (BR.cfg.HUNTER_MODEL && T.GLTFLoader) loadModel(g, BR.cfg.HUNTER_MODEL);
    return g;
  }

  // Load a rigged .glb in place of the procedural monster (cfg.HUNTER_MODEL).
  // The AI still drives g.position / g.rotation.y; the model's own animation
  // clip (if any) plays via an AnimationMixer. Falls back silently on failure.
  function loadModel(g, path) {
    try {
      var loader = new T.GLTFLoader();
      loader.load(path, function (gltf) {
        var model = gltf.scene;
        model.traverse(function (o) { if (o.isMesh) o.castShadow = true; });
        model.scale.setScalar(BR.cfg.HUNTER_MODEL_SCALE || 1);
        g.add(model);
        if (g.userData.root) g.userData.root.visible = false;   // hide procedural rig
        g.userData.model = model;
        if (gltf.animations && gltf.animations.length) {
          var mixer = new T.AnimationMixer(model);
          mixer.clipAction(gltf.animations[0]).play();
          g.userData.mixer = mixer;
        }
        console.info('[hunter] glTF model loaded:', path);
      }, undefined, function (err) { console.warn('[hunter] model failed, keeping procedural:', err); });
    } catch (e) { console.warn('[hunter] GLTFLoader error:', e); }
  }

  // ---------- lifecycle ----------
  E.reset = function () {
    var ctx = BR.ctx, S = BR.S, c = BR.cfg, W = BR.world;
    if (!ctx.entity) {
      ctx.entity = {
        group: makeMesh(), x: 0, z: 0, state: 'wander', path: [], pathIdx: 0,
        repath: 0, wanderT: 0, lastSeen: -99, speed: 2.2, hbTimer: 0, chaseAmt: 0
      };
    }
    var ent = ctx.entity;
    var cell = W.farthestCellFrom(S.spawnCell[0], S.spawnCell[1]);
    for (var tries = 0; tries < 40; tries++) {
      var tcell = [(Math.random() * c.COLS) | 0, (Math.random() * c.ROWS) | 0];
      if (Math.abs(tcell[0] - S.spawnCell[0]) + Math.abs(tcell[1] - S.spawnCell[1]) >= Math.floor((c.COLS + c.ROWS) * 0.4)) { cell = tcell; break; }
    }
    var cc = W.cellCenter(cell[0], cell[1]);
    ent.x = cc[0]; ent.z = cc[1]; ent.group.position.set(cc[0], 0, cc[1]);
    ent.state = 'wander'; ent.path = []; ent.pathIdx = 0;
    ent.repath = 0; ent.wanderT = 0; ent.lastSeen = -99; ent.chaseAmt = 0;
    ent.speed = 2.05 + S.level * 0.22;
    S.timeAlive = 0;
  };

  function pickWanderTarget(ent) {
    var W = BR.world, c = BR.cfg;
    var cur = W.worldToCell(ent.x, ent.z);
    for (var tries = 0; tries < 30; tries++) {
      var tcell = [(Math.random() * c.COLS) | 0, (Math.random() * c.ROWS) | 0];
      var p = W.bfsPath(cur[0], cur[1], tcell[0], tcell[1]);
      if (p.length > 3) { ent.path = p; ent.pathIdx = 0; return; }
    }
    ent.path = []; ent.pathIdx = 0;
  }

  // ---------- per-frame update (AI + animation) ----------
  E.update = function (dt) {
    var ctx = BR.ctx, S = BR.S, W = BR.world, ent = ctx.entity;
    if (!ent) return;
    S.timeAlive += dt;
    var ex = ent.x, ez = ent.z;
    var dx = S.pos.x - ex, dz = S.pos.z - ez, dist = Math.hypot(dx, dz);

    // ---- detection ----
    var detect = 8.5 + S.level * 0.6;
    if (S.playerRunning) detect += 5;                 // running is loud
    if (S.crouch > 0.5) detect -= 3.2;                // crouching is quiet
    var clear = W.segmentClear(ex, ez, S.pos.x, S.pos.z);
    if (S.flashOn) {                                  // shining the lantern on it
      var fx = -Math.sin(S.yaw), fz = -Math.cos(S.yaw), nlen = Math.max(0.001, dist);
      if ((fx * dx + fz * dz) / nlen > 0.8 && dist < 12) detect += 8;
    }
    var seen = (dist < detect) && clear;
    if (seen) {
      ent.lastSeen = S.timeAlive;
      if (ent.state !== 'chase') { ent.state = 'chase'; ent.repath = 0; BR.audio.growl(); }
    }

    if (ent.state === 'chase') {
      if (S.timeAlive - ent.lastSeen > 5 && dist > detect * 1.3) { ent.state = 'wander'; ent.path = []; }
      ent.repath -= dt;
      if (ent.repath <= 0) {
        var ec = W.worldToCell(ex, ez), pc = W.worldToCell(S.pos.x, S.pos.z);
        ent.path = W.bfsPath(ec[0], ec[1], pc[0], pc[1]); ent.pathIdx = 0; ent.repath = 0.4;
      }
    } else {
      ent.wanderT -= dt;
      if (ent.wanderT <= 0 || ent.pathIdx >= ent.path.length) { pickWanderTarget(ent); ent.wanderT = 3 + Math.random() * 3; }
    }

    // ---- move along path ----
    var spd = (ent.state === 'chase' ? ent.speed : ent.speed * 0.55) * dt;
    if (ent.pathIdx < ent.path.length) {
      var cell = ent.path[ent.pathIdx], cc = W.cellCenter(cell[0], cell[1]);
      var tx = cc[0] - ex, tz = cc[1] - ez, td = Math.hypot(tx, tz);
      if (td < 0.18) ent.pathIdx++;
      else { ent.x += (tx / td) * Math.min(spd, td); ent.z += (tz / td) * Math.min(spd, td); }
    } else if (ent.state === 'chase') {
      if (dist > 0.001 && W.segmentClear(ex, ez, S.pos.x, S.pos.z)) { ent.x += (dx / dist) * spd; ent.z += (dz / dist) * spd; }
    }

    ent.group.position.set(ent.x, 0, ent.z);
    ent.group.rotation.y = (dist < 14) ? Math.atan2(S.pos.x - ent.x, S.pos.z - ent.z) : ent.group.rotation.y;

    var prox = Math.max(0, 1 - dist / 14);
    ent.group.userData.light.intensity = prox * 1.6 + (ent.state === 'chase' ? 0.4 : 0);

    var targetChase = (ent.state === 'chase') ? 1 : 0;
    ent.chaseAmt += (targetChase - ent.chaseAmt) * Math.min(1, dt * 2.5);
    if (ent.group.userData.mixer) ent.group.userData.mixer.update(dt);  // loaded glTF
    else animateRig(ent.group, dt, ent.chaseAmt, prox);                 // procedural rig

    // ---- heartbeat ----
    ent.hbTimer -= dt;
    if (prox > 0.12 && ent.hbTimer <= 0) { BR.audio.heartbeat(); ent.hbTimer = 0.4 + (1 - prox) * 1.1; }

    // ---- attack ----
    if (dist < 1.15) {
      S.health = Math.max(0, S.health - 26 * dt);
      S.sanity = Math.max(0, S.sanity - 34 * dt);
      S.shake = Math.min(0.08, S.shake + 6 * dt);
      S.damageFlash = 1;
      if (S.attackBlipT <= 0) { BR.audio.hurt(); BR.audio.blip(70, 0.16, 'sawtooth', 0.10); S.attackBlipT = 0.5; }
      if (S.health <= 0) BR.game.die('caught');
    }
  };

  function animateRig(g, dt, chase, prox) {
    var u = g.userData; u.t += dt; var t = u.t, fast = chase > 0.05;
    u.torso.scale.set(1, 1 + Math.sin(t * 2.3) * 0.035, 1);
    u.root.position.y = Math.abs(Math.sin(t * (fast ? 8 : 3.2))) * 0.04;
    u.root.rotation.z = Math.sin(t * 1.2) * 0.02;
    u.spine.rotation.x = 0.18 + chase * 0.18;
    u.head.rotation.z = Math.sin(t * 0.7) * 0.13;
    u.head.rotation.x = -0.04 + Math.sin(t * 0.9) * 0.05;
    u.jaw.rotation.x = 0.10 + chase * 0.6 + prox * 0.25 + Math.abs(Math.sin(t * 10)) * 0.06 * chase;
    var sw = Math.sin(t * (fast ? 9 : 2.2)), reach = chase * 1.15;
    u.armL.shoulder.rotation.x = -reach + sw * (0.22 + chase * 0.3);
    u.armR.shoulder.rotation.x = -reach - sw * (0.22 + chase * 0.3);
    u.armL.shoulder.rotation.z = 0.16 - chase * 0.12;
    u.armR.shoulder.rotation.z = -0.16 + chase * 0.12;
    u.armL.elbow.rotation.x = -0.55 - chase * 0.55;
    u.armR.elbow.rotation.x = -0.55 - chase * 0.55;
    var stride = Math.sin(t * (fast ? 9 : 4)) * (0.34 + chase * 0.22);
    u.legL.hip.rotation.x = stride; u.legR.hip.rotation.x = -stride;
    u.legL.knee.rotation.x = Math.max(0, -stride) * 0.9 + 0.08;
    u.legR.knee.rotation.x = Math.max(0, stride) * 0.9 + 0.08;
    var eg = 0.55 + chase * 1.5 + Math.sin(t * 12) * 0.06 * chase;
    u.eyeL.scale.setScalar(0.11 * (0.85 + eg * 0.4)); u.eyeR.scale.setScalar(0.11 * (0.85 + eg * 0.4));
    u.eyeL.material.opacity = u.eyeR.material.opacity = Math.min(1, 0.45 + eg * 0.45);
    // cold white glow at rest, flushing warm-red as it closes for the kill
    u.light.color.setRGB(0.55 + chase * 0.45, 0.68 - chase * 0.2, 0.95 - chase * 0.55);
    if (BR.S.monsterUniforms) { BR.S.monsterUniforms.uTime.value = t; BR.S.monsterUniforms.uChase.value = chase; }
  }

  // distance from player to entity (used by vitals/FX)
  E.distToPlayer = function () {
    var ent = BR.ctx.entity, S = BR.S;
    if (!ent) return 999;
    return Math.hypot(ent.x - S.pos.x, ent.z - S.pos.z);
  };

  BR.entity = E;
})(window.BR);
