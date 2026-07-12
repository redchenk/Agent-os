import { app, BrowserWindow, globalShortcut, screen } from 'electron';

const FRONTEND_URL = process.env.AGENT_OS_FRONTEND_URL || 'http://127.0.0.1:5173/?pet=1&nativePet=1';

let mainWindow = null;

function createWindow() {
  const primary = screen.getPrimaryDisplay();
  const workArea = primary.workArea;
  const width = Math.min(920, Math.max(760, Math.round(workArea.width * 0.46)));
  const height = Math.min(780, Math.max(640, Math.round(workArea.height * 0.76)));
  const x = workArea.x + workArea.width - width - 24;
  const y = workArea.y + workArea.height - height - 24;

  mainWindow = new BrowserWindow({
    width,
    height,
    x,
    y,
    frame: false,
    transparent: true,
    backgroundColor: '#00000000',
    alwaysOnTop: true,
    skipTaskbar: false,
    resizable: true,
    hasShadow: false,
    title: 'Agent OS Pet',
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  });

  mainWindow.setAlwaysOnTop(true, 'screen-saver');
  mainWindow.loadURL(FRONTEND_URL);
}

app.whenReady().then(() => {
  createWindow();
  globalShortcut.register('CommandOrControl+Alt+P', () => {
    if (!mainWindow) return;
    if (mainWindow.isVisible()) mainWindow.hide();
    else mainWindow.show();
  });
  globalShortcut.register('CommandOrControl+Alt+R', () => mainWindow?.reload());
});

app.on('window-all-closed', () => {
  app.quit();
});

app.on('will-quit', () => {
  globalShortcut.unregisterAll();
});
