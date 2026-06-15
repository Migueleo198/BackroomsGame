/* ============================================================
   ui.js — HUD bars, objective text, toasts, note + journal +
   death overlays. Pure DOM; reads BR.S.
   ============================================================ */
(function (BR) {
  'use strict';
  var UI = {};
  var el = {};

  UI.init = function () {
    ['hpFill', 'sanFill', 'stamFill', 'battBar', 'battFill', 'lvlText', 'goalText', 'countText',
     'toast', 'noteOverlay', 'noteTitle', 'noteBody', 'journalOverlay', 'journalNotes', 'journalCounts',
     'deathOverlay', 'deathTitle', 'deathText'].forEach(function (id) { el[id] = document.getElementById(id); });
  };

  // ---------------- toasts ----------------
  UI.toast = function (msg) {
    if (!el.toast) return;
    var d = document.createElement('div'); d.className = 'toast-item'; d.textContent = msg;
    el.toast.appendChild(d);
    setTimeout(function () { d.style.transition = 'opacity .5s'; d.style.opacity = '0'; }, 2600);
    setTimeout(function () { if (d.parentNode) d.parentNode.removeChild(d); }, 3200);
  };

  // ---------------- HUD ----------------
  UI.updateHud = function () {
    var S = BR.S;
    if (el.hpFill) el.hpFill.style.width = S.health + '%';
    if (el.sanFill) el.sanFill.style.width = S.sanity + '%';
    if (el.stamFill) el.stamFill.style.width = S.stamina + '%';
    if (el.battBar) {
      if (S.hasFlashlight) { el.battBar.style.display = 'grid'; if (el.battFill) el.battFill.style.width = S.battery + '%'; }
      else el.battBar.style.display = 'none';
    }
  };

  UI.updateObjective = function () {
    var S = BR.S;
    if (el.lvlText) el.lvlText.textContent = 'Level ' + S.level;
    var goal;
    if (!S.hasFlashlight && BR.items.flashlightAvailable()) goal = 'Search the drawers for the lantern.';
    else if (!S.hasKey) goal = 'Search the drawers for the Exit Key.';
    else goal = 'Reach the EXIT door and no-clip deeper.';
    if (el.goalText) el.goalText.textContent = goal;
    if (el.countText) el.countText.textContent =
      'Almond Water ×' + (S.inv['almond'] || 0) + '   ·   Batteries ×' + (S.inv['battery'] || 0) + '   ·   Notes ' + S.journal.length;
  };

  // ---------------- note overlay ----------------
  UI.showNote = function (note) {
    if (el.noteTitle) el.noteTitle.textContent = note.title;
    if (el.noteBody) el.noteBody.textContent = note.text;
    if (el.noteOverlay) el.noteOverlay.style.display = 'flex';
    BR.S.uiOpen = true;
  };
  UI.closeNote = function () { if (el.noteOverlay) el.noteOverlay.style.display = 'none'; BR.S.uiOpen = false; };
  UI.noteOpen = function () { return el.noteOverlay && el.noteOverlay.style.display === 'flex'; };

  // ---------------- journal ----------------
  UI.toggleJournal = function () {
    var S = BR.S;
    if (!el.journalOverlay) return;
    if (el.journalOverlay.style.display === 'flex') { el.journalOverlay.style.display = 'none'; S.uiOpen = false; return; }
    if (el.journalNotes) {
      el.journalNotes.innerHTML = S.journal.length ? '' : '<div class="entry" style="opacity:.6">No notes recovered yet.</div>';
      for (var i = 0; i < S.journal.length; i++) {
        var e = document.createElement('div'); e.className = 'entry';
        e.innerHTML = '<b style="color:#d8c45a">' + S.journal[i].title + '</b><br>' + S.journal[i].text;
        el.journalNotes.appendChild(e);
      }
    }
    if (el.journalCounts) el.journalCounts.textContent =
      'Level ' + S.level + '  ·  Almond Water ×' + (S.inv['almond'] || 0) + '  ·  Batteries ×' + (S.inv['battery'] || 0) +
      '  ·  Almonds drunk: ' + S.almondsDrunk;
    el.journalOverlay.style.display = 'flex'; S.uiOpen = true;
  };

  // ---------------- death ----------------
  UI.showDeath = function (how) {
    if (el.deathTitle) el.deathTitle.textContent = how === 'caught' ? 'It found you' : 'You faded';
    if (el.deathText) el.deathText.textContent = how === 'caught'
      ? 'The Hunter was the last thing the yellow rooms let you see. You reached Level ' + BR.S.level + '.'
      : 'Your mind gave out before the rooms did. You reached Level ' + BR.S.level + '.';
    if (el.deathOverlay) el.deathOverlay.style.display = 'flex';
  };
  UI.hideOverlays = function () {
    if (el.noteOverlay) el.noteOverlay.style.display = 'none';
    if (el.journalOverlay) el.journalOverlay.style.display = 'none';
    if (el.deathOverlay) el.deathOverlay.style.display = 'none';
    BR.S.uiOpen = false;
  };

  BR.ui = UI;
})(window.BR);
