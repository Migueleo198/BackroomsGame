/* ============================================================
   furniture.js — desks with three sliding drawers, the small
   item meshes that live inside them, and the exit door. The
   items module fills the drawers and handles raycast picking.
   ============================================================ */
(function (BR) {
  'use strict';
  var T = THREE, F = {};
  var woodMat = null, faceMat = null, metalMat = null;

  function mats() {
    if (woodMat) return;
    var wood = BR.tex.wood();
    wood.wrapS = wood.wrapT = T.RepeatWrapping; wood.repeat.set(1, 1);
    woodMat = new T.MeshStandardMaterial({ map: wood, roughness: 0.72, metalness: 0.05, color: 0xb9905f });
    faceMat = new T.MeshStandardMaterial({ map: wood, roughness: 0.66, metalness: 0.05, color: 0x9c764a });
    metalMat = new T.MeshStandardMaterial({ color: 0x6a6a6a, roughness: 0.4, metalness: 0.8 });
  }

  // ---------------- item meshes (small; no per-item lights) ----------------
  F.makeItemMesh = function (type) {
    var g = new T.Group();
    if (type === 'almond') {
      var box = new T.Mesh(new T.BoxGeometry(0.12, 0.2, 0.12), new T.MeshStandardMaterial({ color: 0xf1ead8, roughness: 0.6, emissive: 0x2a2a20, emissiveIntensity: 0.25 }));
      box.position.y = 0.1; box.castShadow = true; g.add(box);
      var cap = new T.Mesh(new T.CylinderGeometry(0.028, 0.028, 0.035, 8), new T.MeshStandardMaterial({ color: 0x7fb0e0, roughness: 0.4, emissive: 0x16304a, emissiveIntensity: 0.5 })); cap.position.y = 0.215; g.add(cap);
    } else if (type === 'battery') {
      var bd = new T.Mesh(new T.CylinderGeometry(0.05, 0.05, 0.17, 12), new T.MeshStandardMaterial({ color: 0x2c6f4d, roughness: 0.45, metalness: 0.35, emissive: 0x0c2418, emissiveIntensity: 0.4 }));
      bd.position.y = 0.085; bd.castShadow = true; g.add(bd);
      var tip = new T.Mesh(new T.CylinderGeometry(0.02, 0.02, 0.03, 8), new T.MeshStandardMaterial({ color: 0xb8b8b8, roughness: 0.3, metalness: 0.8 })); tip.position.y = 0.185; g.add(tip);
    } else if (type === 'flashlight') {
      var body = new T.Mesh(new T.CylinderGeometry(0.045, 0.06, 0.26, 14), new T.MeshStandardMaterial({ color: 0x202020, roughness: 0.4, metalness: 0.6 }));
      body.rotation.z = Math.PI / 2; body.position.y = 0.06; body.castShadow = true; g.add(body);
      var head = new T.Mesh(new T.CylinderGeometry(0.08, 0.06, 0.08, 14), new T.MeshStandardMaterial({ color: 0xfff2c0, roughness: 0.3, emissive: 0x6a5f30, emissiveIntensity: 0.6 })); head.rotation.z = Math.PI / 2; head.position.set(0.16, 0.06, 0); g.add(head);
    } else if (type === 'key') {
      var km = new T.MeshStandardMaterial({ color: 0xe9c659, roughness: 0.3, metalness: 0.85, emissive: 0x3a2e08, emissiveIntensity: 0.5 });
      var ring = new T.Mesh(new T.TorusGeometry(0.05, 0.016, 8, 16), km); ring.position.y = 0.13; ring.rotation.x = Math.PI / 2; g.add(ring);
      var shaft = new T.Mesh(new T.BoxGeometry(0.02, 0.12, 0.02), km); shaft.position.y = 0.06; g.add(shaft);
      var tooth = new T.Mesh(new T.BoxGeometry(0.04, 0.02, 0.02), km); tooth.position.set(0.03, 0.02, 0); g.add(tooth);
    } else if (type === 'note') {
      var paper = new T.Mesh(new T.PlaneGeometry(0.16, 0.2), new T.MeshStandardMaterial({ color: 0xe8dcae, roughness: 0.9, side: T.DoubleSide, emissive: 0x222018, emissiveIntensity: 0.25 }));
      paper.rotation.x = -Math.PI / 2.2; paper.position.y = 0.02; g.add(paper);
    }
    return g;
  };

  // ---------------- a desk with three drawers ----------------
  // returns { group, drawers:[ { group, faceMesh, baseZ, open, slide, items:[] } ] }
  F.makeTable = function (yaw) {
    mats();
    var g = new T.Group();
    g.rotation.y = yaw || 0;

    // tabletop
    var top = new T.Mesh(new T.BoxGeometry(1.42, 0.08, 0.82), woodMat);
    top.position.y = 1.0; top.castShadow = top.receiveShadow = true; g.add(top);

    // drawer pedestal (left) + two legs (right)
    var ped = new T.Mesh(new T.BoxGeometry(0.64, 0.92, 0.8), woodMat);
    ped.position.set(-0.34, 0.46, 0); ped.castShadow = ped.receiveShadow = true; g.add(ped);
    [-0.3, 0.3].forEach(function (zz) {
      var leg = new T.Mesh(new T.BoxGeometry(0.08, 0.96, 0.08), woodMat);
      leg.position.set(0.56, 0.48, zz); leg.castShadow = true; g.add(leg);
    });

    var drawers = [];
    var yc = [0.20, 0.48, 0.76];
    for (var d = 0; d < 3; d++) {
      var dg = new T.Group(); dg.position.set(-0.34, yc[d], 0); g.add(dg);
      // visible face — kept short so the items inside poke above it and stay easy to point at
      var face = new T.Mesh(new T.BoxGeometry(0.56, 0.16, 0.03), faceMat);
      face.position.set(0, -0.04, 0.405); face.castShadow = true; dg.add(face);
      var handle = new T.Mesh(new T.BoxGeometry(0.18, 0.025, 0.03), metalMat);
      handle.position.set(0, -0.04, 0.43); dg.add(handle);
      // tray (bottom + back + sides) so items have somewhere to rest
      var bottom = new T.Mesh(new T.BoxGeometry(0.52, 0.025, 0.46), faceMat);
      bottom.position.set(0, -0.11, 0.18); bottom.castShadow = bottom.receiveShadow = true; dg.add(bottom);
      var back = new T.Mesh(new T.BoxGeometry(0.52, 0.14, 0.02), faceMat); back.position.set(0, -0.05, -0.04); dg.add(back);
      [-0.26, 0.26].forEach(function (xx) { var sw = new T.Mesh(new T.BoxGeometry(0.02, 0.14, 0.46), faceMat); sw.position.set(xx, -0.05, 0.18); dg.add(sw); });

      var rec = { group: dg, faceMesh: face, baseZ: 0, open: false, slide: 0, items: [] };
      face.userData.kind = 'drawer';     // raycast target -> open/close
      face.userData.ref = rec;
      drawers.push(rec);
    }
    return { group: g, drawers: drawers };
  };

  // ---------------- exit door ----------------
  F.makeExitDoor = function () {
    var g = new T.Group();
    var frame = new T.Mesh(new T.BoxGeometry(1.6, 2.6, 0.26), new T.MeshStandardMaterial({ color: 0x1a1714, roughness: 0.7 }));
    frame.position.y = 1.3; frame.castShadow = true; frame.userData.kind = 'door'; g.add(frame);
    var portal = new T.Mesh(new T.PlaneGeometry(1.1, 2.1), new T.MeshBasicMaterial({ color: 0x000000 }));
    portal.position.set(0, 1.15, 0.14); g.add(portal);
    var sign = new T.Mesh(new T.PlaneGeometry(0.9, 0.34), new T.MeshBasicMaterial({ map: BR.tex.exitSign() }));
    sign.position.set(0, 2.45, 0.15); g.add(sign);
    g.add(new T.PointLight(0x6fff9a, 0.8, 4, 2));
    return g;
  };

  BR.furniture = F;
})(window.BR);
