/* ============================================================
   world.js — maze generation, PBR surfaces, instanced walls,
   colliders, and grid/pathfinding helpers.
   ============================================================ */
(function (BR) {
  'use strict';
  var T = THREE, world = {};

  function cfg() { return BR.cfg; }

  // ---------- grid helpers ----------
  world.cellCenter = function (i, j) {
    var c = cfg(); return [(i + 0.5) * c.CELL - c.W / 2, (j + 0.5) * c.CELL - c.H / 2];
  };
  world.worldToCell = function (x, z) {
    var c = cfg(); return [Math.floor((x + c.W / 2) / c.CELL), Math.floor((z + c.H / 2) / c.CELL)];
  };
  world.inGrid = function (i, j) { var c = cfg(); return i >= 0 && i < c.COLS && j >= 0 && j < c.ROWS; };

  world.farthestCellFrom = function (ci, cj) {
    var c = cfg(), best = [0, 0], bestD = -1;
    for (var i = 0; i < c.COLS; i++) for (var j = 0; j < c.ROWS; j++) {
      var d = Math.abs(i - ci) + Math.abs(j - cj);
      if (d > bestD) { bestD = d; best = [i, j]; }
    }
    return best;
  };

  // ---------- maze ----------
  world.generateMaze = function () {
    var c = cfg(), COLS = c.COLS, ROWS = c.ROWS, BRAID = c.BRAID;
    var vWall = [], hWall = [], i, j;
    for (i = 0; i <= COLS; i++) { vWall[i] = []; for (j = 0; j < ROWS; j++) vWall[i][j] = true; }
    for (i = 0; i < COLS; i++) { hWall[i] = []; for (j = 0; j <= ROWS; j++) hWall[i][j] = true; }
    var visited = [];
    for (i = 0; i < COLS; i++) { visited[i] = []; for (j = 0; j < ROWS; j++) visited[i][j] = false; }

    var ci = (Math.random() * COLS) | 0, cj = (Math.random() * ROWS) | 0;
    visited[ci][cj] = true;
    var stack = [[ci, cj]];
    while (stack.length) {
      var top = stack[stack.length - 1], x = top[0], y = top[1], nb = [];
      if (x > 0 && !visited[x - 1][y]) nb.push([x - 1, y, 'L']);
      if (x < COLS - 1 && !visited[x + 1][y]) nb.push([x + 1, y, 'R']);
      if (y > 0 && !visited[x][y - 1]) nb.push([x, y - 1, 'D']);
      if (y < ROWS - 1 && !visited[x][y + 1]) nb.push([x, y + 1, 'U']);
      if (!nb.length) { stack.pop(); continue; }
      var pick = nb[(Math.random() * nb.length) | 0], nx = pick[0], ny = pick[1], dir = pick[2];
      if (dir === 'L') vWall[x][y] = false;
      else if (dir === 'R') vWall[x + 1][y] = false;
      else if (dir === 'D') hWall[x][y] = false;
      else hWall[x][y + 1] = false;
      visited[nx][ny] = true; stack.push([nx, ny]);
    }
    for (i = 1; i < COLS; i++) for (j = 0; j < ROWS; j++) if (vWall[i][j] && Math.random() < BRAID) vWall[i][j] = false;
    for (i = 0; i < COLS; i++) for (j = 1; j < ROWS; j++) if (hWall[i][j] && Math.random() < BRAID) hWall[i][j] = false;
    return { vWall: vWall, hWall: hWall };
  };

  // wall-aware connectivity for entity pathfinding
  world.canStep = function (i, j, di, dj) {
    var c = cfg(), m = BR.ctx.maze;
    if (di === -1) return i > 0 && !m.vWall[i][j];
    if (di === 1) return i < c.COLS - 1 && !m.vWall[i + 1][j];
    if (dj === -1) return j > 0 && !m.hWall[i][j];
    if (dj === 1) return j < c.ROWS - 1 && !m.hWall[i][j + 1];
    return false;
  };
  world.bfsPath = function (si, sj, ti, tj) {
    if (si === ti && sj === tj) return [];
    var c = cfg(), ROWS = c.ROWS;
    var key = function (i, j) { return i * ROWS + j; };
    var prev = {}, seen = {}, q = [[si, sj]]; seen[key(si, sj)] = true;
    var dirs = [[-1, 0], [1, 0], [0, -1], [0, 1]], found = false, head = 0;
    while (head < q.length) {
      var cur = q[head++], ci = cur[0], cj = cur[1];
      if (ci === ti && cj === tj) { found = true; break; }
      for (var d = 0; d < 4; d++) {
        var di = dirs[d][0], dj = dirs[d][1], ni = ci + di, nj = cj + dj;
        if (!world.inGrid(ni, nj) || seen[key(ni, nj)] || !world.canStep(ci, cj, di, dj)) continue;
        seen[key(ni, nj)] = true; prev[key(ni, nj)] = [ci, cj]; q.push([ni, nj]);
      }
    }
    if (!found) return [];
    var path = [], k = [ti, tj];
    while (!(k[0] === si && k[1] === sj)) { path.push(k); k = prev[key(k[0], k[1])]; if (!k) return []; }
    path.reverse();
    return path;
  };

  // ---------- materials + static geometry (once) ----------
  world.initMaterials = function () {
    var c = cfg(), ctx = BR.ctx, U = BR.util, tx = BR.tex, T2 = T;
    var W = c.W, H = c.H, CELL = c.CELL, WALL_H = c.WALL_H, WALL_T = c.WALL_T, COLS = c.COLS, ROWS = c.ROWS;

    var wallTex = tx.wallpaper(); wallTex.repeat.set(CELL / 2.4, WALL_H / 2.4);
    var wallNrm = U.canvasToNormal(wallTex.image, 1.4, true); wallNrm.repeat.copy(wallTex.repeat);
    var carpetTex = tx.carpet(); carpetTex.repeat.set(W / 2.9, H / 2.9);   // bigger tiles -> less obvious repeat
    var carpetNrm = U.canvasToNormal(carpetTex.image, 1.1, true); carpetNrm.repeat.copy(carpetTex.repeat);
    var ceilTex = tx.ceiling(); ceilTex.repeat.set(W / 2.4, H / 2.4);
    var ceilNrm = U.canvasToNormal(ceilTex.image, 1.0, true); ceilNrm.repeat.copy(ceilTex.repeat);

    var wallMat = new T2.MeshStandardMaterial({ map: wallTex, normalMap: wallNrm, normalScale: new T2.Vector2(0.6, 0.6), roughness: 0.92, metalness: 0.0 });
    var carpetMat = new T2.MeshStandardMaterial({ map: carpetTex, normalMap: carpetNrm, normalScale: new T2.Vector2(0.3, 0.3), roughness: 0.97, metalness: 0.0 });
    var ceilMat = new T2.MeshStandardMaterial({ map: ceilTex, normalMap: ceilNrm, normalScale: new T2.Vector2(0.4, 0.4), roughness: 0.86, metalness: 0.0 });
    ctx.mats.wall = wallMat; ctx.mats.carpet = carpetMat; ctx.mats.ceil = ceilMat;

    // floor + ceiling
    var floor = new T2.Mesh(new T2.PlaneGeometry(W, H), carpetMat);
    floor.rotation.x = -Math.PI / 2; floor.receiveShadow = true; ctx.scene.add(floor); ctx.floor = floor;
    var ceil = new T2.Mesh(new T2.PlaneGeometry(W, H), ceilMat);
    ceil.rotation.x = Math.PI / 2; ceil.position.y = WALL_H; ceil.receiveShadow = true; ctx.scene.add(ceil); ctx.ceil = ceil;

    // instanced walls
    var vWallGeo = new T2.BoxGeometry(WALL_T, WALL_H, CELL);
    var hWallGeo = new T2.BoxGeometry(CELL, WALL_H, WALL_T);
    var pillarGeo = new T2.BoxGeometry(0.5, WALL_H, 0.5);
    var maxV = (COLS + 1) * ROWS, maxH = COLS * (ROWS + 1);
    var vWallMesh = new T2.InstancedMesh(vWallGeo, wallMat, maxV);
    var hWallMesh = new T2.InstancedMesh(hWallGeo, wallMat, maxH);

    var pillarPos = [];
    for (var pi = 0; pi <= COLS; pi += 2) for (var pj = 0; pj <= ROWS; pj += 2) pillarPos.push([pi * CELL - W / 2, pj * CELL - H / 2]);
    var pillarMesh = new T2.InstancedMesh(pillarGeo, wallMat, pillarPos.length);

    var panelPos = [];
    for (var qi = 1; qi < COLS; qi += 2) for (var qj = 1; qj < ROWS; qj += 2) panelPos.push([(qi + 0.5) * CELL - W / 2, (qj + 0.5) * CELL - H / 2]);

    vWallMesh.castShadow = vWallMesh.receiveShadow = true;
    hWallMesh.castShadow = hWallMesh.receiveShadow = true;
    pillarMesh.castShadow = pillarMesh.receiveShadow = true;
    ctx.scene.add(vWallMesh, hWallMesh, pillarMesh);

    ctx.vWallMesh = vWallMesh; ctx.hWallMesh = hWallMesh; ctx.pillarMesh = pillarMesh;
    ctx.pillarPos = pillarPos; ctx.panelPos = panelPos;

    // place pillars once
    var dummy = new T2.Object3D();
    for (var k = 0; k < pillarPos.length; k++) {
      dummy.position.set(pillarPos[k][0], WALL_H / 2, pillarPos[k][1]);
      dummy.updateMatrix(); pillarMesh.setMatrixAt(k, dummy.matrix);
    }
    pillarMesh.instanceMatrix.needsUpdate = true;
    ctx.geo.dummy = dummy;
  };

  // ---------- (re)build maze layout ----------
  world.build = function () {
    var c = cfg(), ctx = BR.ctx, S = BR.S;
    var W = c.W, H = c.H, CELL = c.CELL, WALL_H = c.WALL_H, WALL_T = c.WALL_T, COLS = c.COLS, ROWS = c.ROWS;
    var dummy = ctx.geo.dummy, m = world.generateMaze();
    ctx.maze = m;
    ctx.colliders.length = 0;
    var i, j, n, x, z;

    n = 0;
    for (i = 0; i <= COLS; i++) for (j = 0; j < ROWS; j++) {
      if (!m.vWall[i][j]) continue;
      x = i * CELL - W / 2; z = (j + 0.5) * CELL - H / 2;
      dummy.position.set(x, WALL_H / 2, z); dummy.rotation.set(0, 0, 0); dummy.scale.set(1, 1, 1);
      dummy.updateMatrix(); ctx.vWallMesh.setMatrixAt(n++, dummy.matrix);
      ctx.colliders.push({ minX: x - WALL_T / 2 - 0.02, maxX: x + WALL_T / 2 + 0.02, minZ: z - CELL / 2, maxZ: z + CELL / 2 });
    }
    ctx.vWallMesh.count = n; ctx.vWallMesh.instanceMatrix.needsUpdate = true;

    n = 0;
    for (i = 0; i < COLS; i++) for (j = 0; j <= ROWS; j++) {
      if (!m.hWall[i][j]) continue;
      x = (i + 0.5) * CELL - W / 2; z = j * CELL - H / 2;
      dummy.position.set(x, WALL_H / 2, z); dummy.rotation.set(0, 0, 0); dummy.scale.set(1, 1, 1);
      dummy.updateMatrix(); ctx.hWallMesh.setMatrixAt(n++, dummy.matrix);
      ctx.colliders.push({ minX: x - CELL / 2, maxX: x + CELL / 2, minZ: z - WALL_T / 2 - 0.02, maxZ: z + WALL_T / 2 + 0.02 });
    }
    ctx.hWallMesh.count = n; ctx.hWallMesh.instanceMatrix.needsUpdate = true;

    for (i = 0; i < ctx.pillarPos.length; i++) {
      x = ctx.pillarPos[i][0]; z = ctx.pillarPos[i][1];
      ctx.colliders.push({ minX: x - 0.25, maxX: x + 0.25, minZ: z - 0.25, maxZ: z + 0.25 });
    }

    // spawn near the middle
    S.spawnCell = [Math.floor(COLS / 2), Math.floor(ROWS / 2)];
    var sc = world.cellCenter(S.spawnCell[0], S.spawnCell[1]);
    S.pos.x = sc[0]; S.pos.z = sc[1];
    S.yaw = Math.random() * Math.PI * 2; S.pitch = 0;
  };

  // ---------- collision ----------
  world.hitsBox = function (x, z, b) {
    var r = cfg().PLAYER_R;
    var cx = Math.max(b.minX, Math.min(x, b.maxX));
    var cz = Math.max(b.minZ, Math.min(z, b.maxZ));
    var dx = x - cx, dz = z - cz;
    return (dx * dx + dz * dz) < r * r;
  };
  world.blocked = function (x, z) {
    var col = BR.ctx.colliders;
    for (var i = 0; i < col.length; i++) if (world.hitsBox(x, z, col[i])) return true;
    return false;
  };
  world.pointBlocked = function (x, z) {
    var col = BR.ctx.colliders;
    for (var i = 0; i < col.length; i++) {
      var b = col[i];
      if (x >= b.minX && x <= b.maxX && z >= b.minZ && z <= b.maxZ) return true;
    }
    return false;
  };
  world.segmentClear = function (x1, z1, x2, z2) {
    var d = Math.hypot(x2 - x1, z2 - z1), steps = Math.max(1, Math.ceil(d / 0.34));
    for (var s = 1; s < steps; s++) {
      var t = s / steps;
      if (world.pointBlocked(x1 + (x2 - x1) * t, z1 + (z2 - z1) * t)) return false;
    }
    return true;
  };

  BR.world = world;
})(window.BR);
