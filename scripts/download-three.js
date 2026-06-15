/* ============================================================
   download-three.js — fetches Three.js r128 + the postprocessing
   addons into ./vendor so the desktop app runs fully offline
   (with bloom). Runs automatically on `npm install` (postinstall).
   If anything fails the game still works online via CDN fallbacks.
   ============================================================ */
const https = require('https');
const fs = require('fs');
const path = require('path');

const VENDOR = path.join(__dirname, '..', 'vendor');

// [url, destination-relative-to-vendor]
const FILES = [
  ['https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js', 'three.min.js'],
  ['https://cdn.jsdelivr.net/npm/three@0.128.0/examples/js/shaders/CopyShader.js', 'shaders/CopyShader.js'],
  ['https://cdn.jsdelivr.net/npm/three@0.128.0/examples/js/shaders/LuminosityHighPassShader.js', 'shaders/LuminosityHighPassShader.js'],
  ['https://cdn.jsdelivr.net/npm/three@0.128.0/examples/js/shaders/GammaCorrectionShader.js', 'shaders/GammaCorrectionShader.js'],
  ['https://cdn.jsdelivr.net/npm/three@0.128.0/examples/js/shaders/SSAOShader.js', 'shaders/SSAOShader.js'],
  ['https://cdn.jsdelivr.net/npm/three@0.128.0/examples/js/math/SimplexNoise.js', 'math/SimplexNoise.js'],
  ['https://cdn.jsdelivr.net/npm/three@0.128.0/examples/js/postprocessing/EffectComposer.js', 'postprocessing/EffectComposer.js'],
  ['https://cdn.jsdelivr.net/npm/three@0.128.0/examples/js/postprocessing/ShaderPass.js', 'postprocessing/ShaderPass.js'],
  ['https://cdn.jsdelivr.net/npm/three@0.128.0/examples/js/postprocessing/MaskPass.js', 'postprocessing/MaskPass.js'],
  ['https://cdn.jsdelivr.net/npm/three@0.128.0/examples/js/postprocessing/RenderPass.js', 'postprocessing/RenderPass.js'],
  ['https://cdn.jsdelivr.net/npm/three@0.128.0/examples/js/postprocessing/UnrealBloomPass.js', 'postprocessing/UnrealBloomPass.js'],
  ['https://cdn.jsdelivr.net/npm/three@0.128.0/examples/js/postprocessing/SSAOPass.js', 'postprocessing/SSAOPass.js'],
  ['https://cdn.jsdelivr.net/npm/three@0.128.0/examples/js/loaders/GLTFLoader.js', 'loaders/GLTFLoader.js']
];

function download(url, dest, redirects, done) {
  https.get(url, (res) => {
    if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location && redirects < 5) {
      res.resume();
      return download(res.headers.location, dest, redirects + 1, done);
    }
    if (res.statusCode !== 200) {
      console.warn('[vendor] skip ' + path.basename(dest) + ' (HTTP ' + res.statusCode + ') — CDN fallback will be used.');
      res.resume();
      return done();
    }
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    const file = fs.createWriteStream(dest);
    res.pipe(file);
    file.on('finish', () => file.close(() => { console.log('[vendor] saved ' + path.relative(VENDOR, dest)); done(); }));
  }).on('error', (e) => { console.warn('[vendor] error for ' + path.basename(dest) + ':', e.message); done(); });
}

function run(i) {
  if (i >= FILES.length) { console.log('[vendor] done.'); return; }
  const url = FILES[i][0];
  const dest = path.join(VENDOR, FILES[i][1]);
  if (fs.existsSync(dest) && fs.statSync(dest).size > 1000) { return run(i + 1); }
  download(url, dest, 0, () => run(i + 1));
}

run(0);
