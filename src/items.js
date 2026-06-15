/* ============================================================
   items.js — fills drawers with items, the hotbar inventory,
   and a raycast crosshair-interaction system: open a drawer,
   then point at the exact item you want and take it.
   ============================================================ */
(function (BR) {
  'use strict';
  var T = THREE, I = {};

  var ITEMS = {
    almond:    { name: 'Almond Water', icon: '🥛', usable: true },
    battery:   { name: 'Battery',      icon: '🔋', usable: true },
    flashlight:{ name: 'Lantern',      icon: '🔦', usable: true },
    key:       { name: 'Exit Key',     icon: '🗝️', usable: false }
  };
  I.ITEMS = ITEMS;
  var MAXSLOTS = 6;

  var NOTES = [
    { title: 'Scrawled on the wall', text: '"Almond Water keeps your head straight. Drink when the walls start to breathe. Don’t ration it like I did."' },
    { title: 'Torn page', text: '"It came out of the dark with its chest open. Don’t look at the eyes. Kill your lantern, hold still, and let it pass."' },
    { title: 'Maintenance log', text: '"Check the desk drawers — the crews left supplies in them. Half are empty now. Bring a light; the cabinets are black inside."' },
    { title: 'Damp note', text: '"Every level has a way down. A door that shouldn’t open. Find the key in the drawers, find the door, and noclip before your mind goes."' },
    { title: 'Child’s handwriting', text: '"I counted 738 yellow rooms today. Tomorrow I will count more. There is always more. There is always more."' },
    { title: 'Bloodstained card', text: '"Running makes noise. Noise brings it. Walk. Always walk. I’m sorry I ran."' }
  ];

  var ray = new T.Raycaster();
  var CENTER = new T.Vector2(0, 0);

  I.init = function () {
    BR.ctx.pickupHolder = new T.Group();
    BR.ctx.scene.add(BR.ctx.pickupHolder);
  };

  function clearWorld() {
    var ctx = BR.ctx;
    for (var i = 0; i < ctx.tables.length; i++) ctx.pickupHolder.remove(ctx.tables[i].group);
    ctx.tables.length = 0;
    if (ctx.exitDoor) { ctx.pickupHolder.remove(ctx.exitDoor.group); ctx.exitDoor = null; }
  }

  // lay the items in a drawer out along its width
  function layoutDrawer(drawer) {
    var n = drawer.items.length;
    for (var i = 0; i < n; i++) {
      var x = (n === 1) ? 0 : (-0.17 + 0.34 * (i / (n - 1)));
      drawer.items[i].mesh.position.set(x, -0.09, 0.15);
    }
  }

  // ---------------- per-level placement ----------------
  I.place = function () {
    var ctx = BR.ctx, S = BR.S, W = BR.world, c = BR.cfg, Fn = BR.furniture;
    clearWorld();

    // exit door at the far corner
    var doorCell = W.farthestCellFrom(S.spawnCell[0], S.spawnCell[1]);
    ctx.exitDoor = { group: Fn.makeExitDoor(), cell: doorCell };
    var dc = W.cellCenter(doorCell[0], doorCell[1]);
    ctx.exitDoor.group.position.set(dc[0], 0, dc[1]);
    ctx.pickupHolder.add(ctx.exitDoor.group);

    // pick table cells (distinct, not spawn, not door); remember the one nearest spawn
    var used = {}, key = function (cell) { return cell[0] + '_' + cell[1]; };
    used[key(S.spawnCell)] = true; used[key(doorCell)] = true;
    var spawnW = W.cellCenter(S.spawnCell[0], S.spawnCell[1]);
    var cells = [], nearestIdx = 0, nearestD = 1e9;
    for (var ti = 0; ti < c.TABLES; ti++) {
      var cell = null;
      for (var tries = 0; tries < 200; tries++) {
        var cc = [(Math.random() * c.COLS) | 0, (Math.random() * c.ROWS) | 0];
        if (used[key(cc)]) continue; used[key(cc)] = true; cell = cc; break;
      }
      if (!cell) break;
      var wc = W.cellCenter(cell[0], cell[1]);
      var tbl = Fn.makeTable(Math.random() * Math.PI * 2);
      tbl.group.position.set(wc[0], 0, wc[1]);
      ctx.pickupHolder.add(tbl.group);
      ctx.tables.push(tbl);
      var ds = Math.hypot(wc[0] - spawnW[0], wc[1] - spawnW[1]);
      if (ds < nearestD) { nearestD = ds; nearestIdx = ctx.tables.length - 1; }
    }
    if (!ctx.tables.length) return;

    // build the item list for this level
    var spec = [];
    if (!S.hasFlashlight) spec.push({ type: 'flashlight' });
    var almondN = Math.max(3, 5 - Math.floor(S.level / 2));
    var battN = 2 + Math.floor(S.level / 2);
    var i;
    for (i = 0; i < almondN; i++) spec.push({ type: 'almond' });
    for (i = 0; i < battN; i++) spec.push({ type: 'battery' });
    for (i = 0; i < 2; i++) spec.push({ type: 'note', note: NOTES[(Math.random() * NOTES.length) | 0] });
    spec.push({ type: 'key' });

    // all drawers across all tables
    var drawers = [];
    for (i = 0; i < ctx.tables.length; i++) for (var d = 0; d < ctx.tables[i].drawers.length; d++) drawers.push(ctx.tables[i].drawers[d]);

    function dropInto(drawer, item) {
      var mesh = Fn.makeItemMesh(item.type);
      mesh.userData.kind = 'item';
      var rec = { type: item.type, note: item.note || null, mesh: mesh, drawer: drawer };
      mesh.userData.ref = rec;
      drawer.group.add(mesh);
      drawer.items.push(rec);
      layoutDrawer(drawer);
    }

    // flashlight (level 1) goes in a drawer of the nearest table so you find a light fast
    var startIdx = 0;
    if (spec.length && spec[0].type === 'flashlight') {
      var nd = ctx.tables[nearestIdx].drawers;
      dropInto(nd[(Math.random() * nd.length) | 0], spec[0]); startIdx = 1;
    }
    // scatter the rest into random drawers (several may share a drawer, max 4)
    for (i = startIdx; i < spec.length; i++) {
      var pick = null;
      for (var a = 0; a < 40; a++) { var dr = drawers[(Math.random() * drawers.length) | 0]; if (dr.items.length < 4) { pick = dr; break; } }
      dropInto(pick || drawers[(Math.random() * drawers.length) | 0], spec[i]);
    }
  };

  // slide drawers in/out (runs every frame)
  I.animate = function (dt) {
    var tables = BR.ctx.tables;
    for (var i = 0; i < tables.length; i++) {
      var dr = tables[i].drawers;
      for (var d = 0; d < dr.length; d++) {
        var target = dr[d].open ? 0.34 : 0;
        dr[d].slide += (target - dr[d].slide) * Math.min(1, dt * 8);
        dr[d].group.position.z = dr[d].baseZ + dr[d].slide;
      }
    }
  };

  // ---------------- inventory ----------------
  I.addItem = function (type) {
    var S = BR.S;
    if (S.inv[type] === undefined) { if (S.order.length < MAXSLOTS) S.order.push(type); S.inv[type] = 0; }
    S.inv[type]++;
    if (type === 'flashlight') S.hasFlashlight = true;
    if (type === 'key') S.hasKey = true;
    I.renderHotbar();
  };
  function removeOne(type) {
    var S = BR.S;
    if (!S.inv[type]) return;
    S.inv[type]--;
    if (S.inv[type] <= 0) {
      delete S.inv[type];
      var idx = S.order.indexOf(type); if (idx >= 0) S.order.splice(idx, 1);
      if (S.active >= S.order.length) S.active = Math.max(0, S.order.length - 1);
    }
    I.renderHotbar();
  }
  I.selectSlot = function (i) { var S = BR.S; if (i < 0 || i >= S.order.length) return; S.active = i; I.renderHotbar(); BR.audio.blip(500, 0.03, 'square', 0.04); };
  I.cycleSlot = function (dir) { var S = BR.S; if (!S.order.length) return; S.active = (S.active + dir + S.order.length) % S.order.length; I.renderHotbar(); BR.audio.blip(500, 0.03, 'square', 0.04); };

  I.useActive = function () {
    var S = BR.S, type = S.order[S.active];
    if (!type) return;
    if (type === 'almond') {
      S.sanity = Math.min(100, S.sanity + 42); S.health = Math.min(100, S.health + 10); S.almondsDrunk++;
      BR.ui.toast('Almond Water — the taste of being okay.');
      BR.audio.blip(440, 0.12, 'sine', 0.07); BR.audio.blip(660, 0.1, 'sine', 0.05);
      removeOne('almond');
    } else if (type === 'battery') {
      if (!S.hasFlashlight) { BR.ui.toast('No lantern to power.'); return; }
      if (S.battery >= 99) { BR.ui.toast('Lantern is already charged.'); return; }
      S.battery = Math.min(100, S.battery + 70);
      BR.ui.toast('Battery swapped. Light restored.'); BR.audio.blip(700, 0.08, 'square', 0.06);
      removeOne('battery');
    } else if (type === 'flashlight') {
      BR.lights.toggleFlash();
    } else if (type === 'key') {
      BR.ui.toast('Use the key at the exit door.');
    }
  };

  I.renderHotbar = function () {
    var S = BR.S, hb = document.getElementById('hotbar');
    if (!hb) return;
    hb.innerHTML = '';
    for (var i = 0; i < MAXSLOTS; i++) {
      var type = S.order[i];
      var div = document.createElement('div');
      div.className = 'slot' + (i === S.active ? ' active' : '') + (type ? '' : ' empty');
      var num = '<span class="num">' + (i + 1) + '</span>';
      if (type) {
        var on = (type === 'flashlight' && S.flashOn) ? '<span class="on">on</span>' : '';
        var cnt = (S.inv[type] > 1) ? '<span class="cnt">' + S.inv[type] + '</span>' : '';
        div.innerHTML = num + ITEMS[type].icon + cnt + on;
      } else div.innerHTML = num;
      hb.appendChild(div);
    }
  };

  // is there still an un-taken lantern out in the world? (objective text)
  I.flashlightAvailable = function () {
    var tables = BR.ctx.tables;
    for (var i = 0; i < tables.length; i++) for (var d = 0; d < tables[i].drawers.length; d++) {
      var items = tables[i].drawers[d].items;
      for (var k = 0; k < items.length; k++) if (items[k].type === 'flashlight') return true;
    }
    return false;
  };

  // ---------------- raycast crosshair interaction ----------------
  function climb(obj) { while (obj) { if (obj.userData && obj.userData.kind) return obj.userData; obj = obj.parent; } return null; }

  function gather() {
    var ctx = BR.ctx, list = [];
    for (var i = 0; i < ctx.tables.length; i++) {
      var dr = ctx.tables[i].drawers;
      for (var d = 0; d < dr.length; d++) {
        list.push(dr[d].faceMesh);
        if (dr[d].open) for (var k = 0; k < dr[d].items.length; k++) list.push(dr[d].items[k].mesh);
      }
    }
    if (ctx.exitDoor) list.push(ctx.exitDoor.group);
    return list;
  }

  var hovered = null;
  I.updateInteraction = function () {
    var ctx = BR.ctx, S = BR.S, promptEl = document.getElementById('prompt');
    ray.setFromCamera(CENTER, ctx.camera);
    ray.far = 2.9;
    var hits = ray.intersectObjects(gather(), true);
    hovered = null;
    for (var h = 0; h < hits.length; h++) {
      var info = climb(hits[h].object);
      if (info) { hovered = info; break; }
    }
    if (!promptEl) return;
    if (hovered) {
      var label;
      if (hovered.kind === 'door') label = S.hasKey ? '<b>[E]</b> No-clip deeper' : '<b>[E]</b> Locked — find the key';
      else if (hovered.kind === 'drawer') label = '<b>[E]</b> ' + (hovered.ref.open ? 'Close drawer' : 'Open drawer');
      else if (hovered.kind === 'item') label = hovered.ref.type === 'note' ? '<b>[E]</b> Read note' : '<b>[E]</b> Take ' + ITEMS[hovered.ref.type].name;
      promptEl.innerHTML = label; promptEl.style.display = 'block';
    } else promptEl.style.display = 'none';
  };

  I.doInteract = function () {
    if (!hovered) return;
    if (hovered.kind === 'door') { BR.game.tryDescend(); return; }
    if (hovered.kind === 'drawer') {
      var drawer = hovered.ref; drawer.open = !drawer.open;
      BR.audio.blip(drawer.open ? 240 : 180, 0.12, 'sine', 0.05);
      return;
    }
    if (hovered.kind === 'item') {
      var rec = hovered.ref, S = BR.S;
      if (rec.type === 'note') { BR.ui.showNote(rec.note); S.journal.push(rec.note); BR.audio.blip(520, 0.06, 'triangle', 0.05); }
      else {
        I.addItem(rec.type);
        if (rec.type === 'flashlight') BR.ui.toast('Lantern acquired. Press F.');
        else if (rec.type === 'key') BR.ui.toast('You found the Exit Key.');
        else BR.ui.toast('Picked up ' + ITEMS[rec.type].name + '.');
        BR.audio.blip(660, 0.05, 'sine', 0.05); BR.audio.blip(880, 0.05, 'sine', 0.04);
      }
      // remove from its drawer
      var dr = rec.drawer; dr.group.remove(rec.mesh);
      var idx = dr.items.indexOf(rec); if (idx >= 0) dr.items.splice(idx, 1);
      layoutDrawer(dr);
      hovered = null;
      var p = document.getElementById('prompt'); if (p) p.style.display = 'none';
    }
  };

  I.removeKey = function () { removeOne('key'); };

  BR.items = I;
})(window.BR);
