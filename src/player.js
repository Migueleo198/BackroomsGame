/* ============================================================
   player.js — movement + head-bob, stamina, vitals (health,
   sanity, battery), and the sanity / damage post-FX. Dark zones
   (no working lamp nearby) drain sanity fast -> use the lantern.
   ============================================================ */
(function (BR) {
  'use strict';
  var P = {};

  // ---------------- movement (walk / run / crouch / jump) ----------------
  P.move = function (dt) {
    var S = BR.S, c = BR.cfg, W = BR.world, cam = BR.ctx.camera;
    var sinY = Math.sin(S.yaw), cosY = Math.cos(S.yaw);
    var fwdX = -sinY, fwdZ = -cosY, rgtX = cosY, rgtZ = -sinY;

    // crouch (smoothed 0..1)
    S.crouch += ((S.keys.crouch ? 1 : 0) - S.crouch) * Math.min(1, dt * 10);
    var crouching = S.crouch > 0.5;
    var airborne = !S.grounded;

    var mf = (S.keys.w ? 1 : 0) - (S.keys.s ? 1 : 0);
    var ms = (S.keys.d ? 1 : 0) - (S.keys.a ? 1 : 0);
    var vx = fwdX * mf + rgtX * ms, vz = fwdZ * mf + rgtZ * ms;
    var len = Math.hypot(vx, vz), moving = len > 0.0001;

    var wantRun = S.keys.shift && !S.exhausted && S.stamina > 1 && !crouching, running = false;
    if (moving) {
      vx /= len; vz /= len;
      running = wantRun;
      var base = running ? c.RUN : c.WALK;
      var sp = base * (crouching ? c.CROUCH_SPEED : 1) * (airborne ? 0.7 : 1) * dt;
      vx *= sp; vz *= sp;
      if (!W.blocked(S.pos.x + vx, S.pos.z)) S.pos.x += vx;
      if (!W.blocked(S.pos.x, S.pos.z + vz)) S.pos.z += vz;
      if (!airborne) {
        S.bob += dt * (running ? 13 : (crouching ? 6 : 8.5));
        S.stepTimer -= dt * (running ? 1.5 : (crouching ? 0.6 : 1));
        if (S.stepTimer <= 0 && !crouching) { BR.audio.footstep(); S.stepTimer = running ? 0.32 : 0.5; }
        else if (S.stepTimer <= 0) { S.stepTimer = 0.7; }   // crouch-walk: near-silent
      }
    } else if (!airborne) S.bob += dt * 4;
    S.playerRunning = running && moving && !airborne;        // entity hears running, not crouch

    if (running && moving) { S.stamina = Math.max(0, S.stamina - 17 * dt); if (S.stamina <= 0) S.exhausted = true; }
    else { S.stamina = Math.min(100, S.stamina + 11 * dt); if (S.exhausted && S.stamina > 22) S.exhausted = false; }

    // jump + gravity
    if (S.keys.jump && S.grounded && !crouching) { S.velY = c.JUMP_V; S.grounded = false; BR.audio.jump(); }
    S.velY -= c.GRAVITY * dt;
    S.posY += S.velY * dt;
    if (S.posY <= 0) { S.posY = 0; S.velY = 0; if (!S.grounded) { S.grounded = true; BR.audio.land(); } }

    var bobY = airborne ? 0 : (moving ? Math.sin(S.bob) * 0.05 : Math.sin(S.bob) * 0.006);
    var eyeY = c.EYE - S.crouch * c.CROUCH_DROP + S.posY + bobY;
    var shx = (Math.random() * 2 - 1) * S.shake, shy = (Math.random() * 2 - 1) * S.shake;
    cam.position.set(S.pos.x + shx, eyeY + shy, S.pos.z);
    cam.rotation.set(S.pitch, S.yaw, 0);
  };

  // ---------------- vitals ----------------
  P.vitals = function (dt) {
    var S = BR.S;
    S.attackBlipT -= dt;

    var cfg = BR.cfg;
    var lit = BR.lights.litAt(S.pos.x, S.pos.z);     // 0..1 (lantern or working lamp)
    var drain = cfg.SANITY_BASE + (1 - lit) * cfg.SANITY_DARK;   // darkness erodes you (slowly now)
    var ed = BR.entity.distToPlayer();
    if (ed < 11) drain += (1 - ed / 11) * cfg.SANITY_FEAR;       // the Hunter terrifies
    S.sanity = Math.max(0, S.sanity - drain * dt);

    if (S.sanity > 55 && ed > 12) S.health = Math.min(100, S.health + 1.2 * dt);

    // tired breathing when winded
    if ((S.exhausted || S.stamina < 26) && S.grounded) {
      S.breathTimer -= dt;
      if (S.breathTimer <= 0) { BR.audio.breath(S.exhausted ? 1 : 0.6); S.breathTimer = S.exhausted ? 1.0 : 1.7; }
    } else S.breathTimer = 0.3;

    if (S.sanity <= 0) {
      S.health = Math.max(0, S.health - 4 * dt);
      if (Math.random() < 0.4 * dt) BR.audio.whisper();
      if (S.health <= 0) BR.game.die('faded');
    } else if (S.sanity < 28) {
      if (Math.random() < (0.12 * (1 - S.sanity / 28)) * dt * 10) BR.audio.whisper();
    }

    S.shake = Math.max(0, S.shake - dt * 0.12);
  };

  // ---------------- sanity / damage post-FX ----------------
  P.fx = function (dt) {
    var S = BR.S, fxEl = BR.ctx.fxEl, canvas = BR.ctx.canvas, scene = BR.ctx.scene;

    // white no-clip transition flash (takes over the FX layer briefly)
    if (S.whiteFlash > 0) {
      S.whiteFlash = Math.max(0, S.whiteFlash - dt * 1.6);
      if (fxEl) {
        fxEl.style.background = 'radial-gradient(120% 110% at 50% 50%, rgba(255,255,255,0.95), rgba(245,240,210,0.8))';
        fxEl.style.opacity = Math.min(1, S.whiteFlash).toFixed(3);
      }
      return;
    } else if (S.whiteWasOn) {
      S.whiteWasOn = false;
      if (fxEl) fxEl.style.background = 'radial-gradient(120% 110% at 50% 50%, transparent 30%, rgba(40,0,0,0.55) 100%)';
    }

    S.damageFlash = Math.max(0, S.damageFlash - dt * 2.5);
    var lowSan = 1 - S.sanity / 100;
    var ed = BR.entity.distToPlayer();
    var prox = Math.max(0, 1 - ed / 12);
    var op = lowSan * 0.45 + prox * 0.35 + S.damageFlash * 0.6;
    if (fxEl) fxEl.style.opacity = Math.min(0.9, op).toFixed(3);
    if (canvas) {
      var sat = (1 - lowSan * 0.6).toFixed(2), bri = (1 - S.damageFlash * 0.15).toFixed(2);
      canvas.style.filter = 'saturate(' + sat + ') brightness(' + bri + ')';
    }
    scene.fog.density = S.baseFog + lowSan * 0.03;
  };

  BR.player = P;
})(window.BR);
