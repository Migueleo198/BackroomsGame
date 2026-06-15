# The Backrooms

A single-player Backrooms survival-horror, rendered with Three.js. Procedural
yellow-room maze, a hunting entity with custom-shaded PBR skin, an inventory,
desks whose **drawers** you search for supplies, detailed fluorescent fixtures
with flicker and dark zones, and a lantern you actually need. Runs in a browser
**or** as an Electron desktop app.

## Play

### In a browser (zero setup)
Just open **`backrooms.html`** (double-click works — no server needed). It loads
Three.js from a local `vendor/` copy if present, otherwise from a CDN, so first
load needs internet unless you've fetched Three locally.

### As a desktop app (Electron)
There is **no prebuilt `.exe` in this folder** — you generate it (or just run the
app directly). All of this needs **Node.js** installed once (https://nodejs.org).

In this folder:

```bash
npm install      # installs Electron + downloads Three.js + bloom addons into vendor/
npm start        # runs the game in a desktop window (no .exe needed)
```

To produce an actual installer / `.exe`:

```bash
npm run dist     # builds with electron-builder
```

That writes the build to **`dist/`**:
- **Windows:** `dist/The Backrooms Setup x.y.z.exe` (NSIS installer). Run it to
  install, then launch "The Backrooms" from the Start menu. An unpacked,
  double-click-to-run build is also left in `dist/win-unpacked/The Backrooms.exe`.
- **macOS:** `dist/The Backrooms-x.y.z.dmg`  ·  **Linux:** `dist/The Backrooms-x.y.z.AppImage`

Notes:
- `F11` toggles fullscreen, `F12` opens devtools.
- `npm install` runs `scripts/download-three.js`, which bundles Three.js **and the
  postprocessing (bloom) addons** into `vendor/` so the desktop app works fully
  offline. If a download fails, the game still works online via CDN fallbacks
  (and simply runs without bloom if the addons are unavailable).

> The game code is plain HTML/JS split into `<script>` modules on a global `BR`
> namespace — no build step, no bundler. It runs identically from `file://`
> (browser or Electron `loadFile`). ES-module `import` is blocked over `file://`;
> classic scripts are not, which is why it's structured this way.

## Controls

| Key | Action |
|-----|--------|
| `W A S D` | Move |
| `Mouse` | Look |
| `Shift` | Run (drains stamina; loud) |
| `Space` | Jump |
| `Ctrl` / `C` | Crouch (slow, quiet — harder for the Hunter to hear) |
| `E` | Interact / open drawer / take item / use door |
| `F` | Toggle lantern |
| `1`–`6` / wheel | Select hotbar item |
| `Q` / left-click | Use selected item |
| `Tab` | Field journal |
| `Esc` | Pause |

## Mechanics

- **Vitals:** Health, Sanity, Stamina, Lantern battery. Sanity and battery are
  tuned to last a long time — you can explore, not panic-rush.
- **Search the drawers:** items live inside desk drawers (3 per desk, several
  items per drawer). **Look at a drawer + `E`** to open it, then **point the
  crosshair at the specific item** and `E` to take it. Cabinets are dark inside —
  bring the lantern.
- **Sanity** erodes slowly — a little faster in the dark, sharply near the
  entity. Drink **Almond Water** or stand in light to recover.
- **Dark zones:** a cluster or two of dead tubes per level. No working lamp =
  no light = faster sanity loss. That's what the lantern is for.
- **The Hunter:** a bulky grey humanoid with glowing white eyes and a split,
  exposed chest. It wanders with BFS pathfinding and hunts you on sight, on
  sound (running), or if you shine your light at it.
- **Progression:** find the **key** in a drawer, reach the **EXIT** door,
  no-clip deeper. Each level the Hunter is faster and the dark zones grow.

## Project layout

```
backrooms.html        entry: DOM + Three loader (vendor->CDN) + ordered <script> includes
main.js               Electron main process (desktop window)
preload.js            Electron preload (empty; secure contextIsolation)
package.json          Electron app + scripts (start / postinstall / dist)
scripts/
  download-three.js   fetches Three.js into vendor/ for offline desktop use
styles/game.css       all styling / HUD / overlays
src/
  core.js             BR namespace, config, shared state, canvas + normal-map utils
  textures.js         HD procedural textures (albedo, height->normal, roughness, wood, diffuser)
  world.js            maze gen, PBR materials, instanced walls, colliders, pathfinding
  lighting.js         fixed troffer fixtures, dark zones, per-lamp flicker, lantern
  entity.js           the Hunter: rig, procedural PBR skin + fresnel shader, chest wound, AI
  furniture.js        desks with 3 sliding drawers, item meshes, exit door
  items.js            drawer placement, inventory/hotbar, raycast crosshair interaction
  player.js           movement, stamina, vitals, sanity/damage post-FX
  audio.js            WebAudio hum + procedural SFX
  ui.js               HUD bars, toasts, note/journal/death overlays
  game.js             bootstrap, input, lifecycle, main loop
```

Everything hangs off the global `BR` object: `BR.cfg` (tunables), `BR.ctx`
(runtime/Three objects), `BR.S` (mutable game state), and one sub-object per
module (`BR.world`, `BR.lights`, `BR.entity`, …).

## Tuning knobs (`src/core.js` → `BR.cfg`)

- `EXPOSURE` — master brightness (tone-mapping exposure). Raise if too dark.
- `BATTERY_DRAIN` — lantern battery %/sec (default 0.95 → ~105s per charge).
- `SANITY_BASE` / `SANITY_DARK` / `SANITY_FEAR` — sanity loss per second (idle /
  in darkness / next to the entity). All deliberately gentle now.
- `POOL` — how many fixtures get a real point-light (spread across the floor).
- `TABLES` — desks (3 drawers each) spawned per level.
- `JUMP_V` / `GRAVITY` — jump height / fall speed.  `CROUCH_DROP` / `CROUCH_SPEED` — crouch feel.
- `BLOOM_STRENGTH` / `BLOOM_RADIUS` / `BLOOM_THRESHOLD` — glow amount / spread / cutoff.
- `COLS`/`ROWS`/`CELL` — maze size.
- Ambient/hemisphere light levels live in `src/lighting.js` (`L.init`); lower
  ambient = darker dark-zones.

## Rendering notes

- Modern pipeline: sRGB color management, ACES filmic tone mapping, PCF soft
  shadow maps (the lantern casts real-time shadows).
- **Postprocessing (Three.js modules):** `EffectComposer` → `RenderPass` →
  `UnrealBloomPass` → `GammaCorrectionShader`. Bloom makes the fluorescent
  panels, the Hunter's eyes, the chest wound and the EXIT sign glow. The lamp
  diffusers are `toneMapped = false` so they stay full-bright and bloom strongly.
  Bloom degrades gracefully — if the addon scripts aren't loaded, the game
  renders directly.
- PBR surfaces with procedurally derived tangent-space normal maps.
- The Hunter's skin is `MeshStandardMaterial` patched via `onBeforeCompile` to
  add a fresnel rim-light and a pulsing subdermal glow (composited in linear
  space before tone mapping).

Built on Three.js **r128** plus its `examples/js` postprocessing addons
(bundled in `vendor/` by `npm install`, or loaded from CDN).
