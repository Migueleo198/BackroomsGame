/* ============================================================
   main.js — Electron main process. Opens the game in a desktop
   window. The game itself is plain HTML/JS (backrooms.html), so
   it runs identically in a browser or here.
   ============================================================ */
const { app, BrowserWindow, Menu } = require('electron');
const path = require('path');

function createWindow() {
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 800,
    minHeight: 560,
    backgroundColor: '#0c0b07',
    title: 'The Backrooms',
    show: false,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      preload: path.join(__dirname, 'preload.js'),
      backgroundThrottling: false
    }
  });

  Menu.setApplicationMenu(null);          // no menu bar; fullscreen-game feel
  win.loadFile('backrooms.html');
  win.once('ready-to-show', () => win.show());

  // F11 toggles fullscreen, F12 opens devtools
  win.webContents.on('before-input-event', (event, input) => {
    if (input.type !== 'keyDown') return;
    if (input.key === 'F11') { win.setFullScreen(!win.isFullScreen()); event.preventDefault(); }
    if (input.key === 'F12') { win.webContents.toggleDevTools(); event.preventDefault(); }
  });
}

app.whenReady().then(() => {
  createWindow();
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
});

app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
