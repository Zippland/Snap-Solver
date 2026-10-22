const {
  app,
  BrowserWindow,
  ipcMain,
  Menu,
  Tray,
  nativeImage,
  shell,
  dialog,
} = require("electron");
const electron = require("electron");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const { Runtime } = require("./runtime.cjs");
const { Gateway } = require("./gateway.cjs");
const { createNative, addresses } = require("./native.cjs");
const ROOT = path.resolve(__dirname, "..");
const page = path.join(__dirname, "ui/index.html");
let window,
  tray,
  runtime,
  gateway,
  quitting = false,
  shutDown = false;

app.setName("Snap-Solver");
if (process.env.SNAP_DATA_DIR)
  app.setPath("userData", path.resolve(process.env.SNAP_DATA_DIR));
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on("second-instance", () => {
    window?.show();
    window?.focus();
  });
  app
    .whenReady()
    .then(start)
    .catch((error) => {
      dialog.showErrorBox("无法启动 Snap-Solver", error.message);
      app.quit();
    });
}

async function start() {
  const native = createNative(electron);
  runtime = new Runtime(app.getPath("userData"), {
    legacyDirectory:
      process.env.SNAP_LEGACY_DIR || path.join(ROOT, ".snapsolver"),
  });
  gateway = new Gateway(app.getPath("userData"), native, runtime);
  await gateway.start(Number(process.env.SNAP_PORT || 0));
  function handle(channel, callback) {
    ipcMain.handle(channel, (event, ...args) => {
      if (
        event.sender !== window?.webContents ||
        event.senderFrame?.url !== pathToFileURL(page).href
      ) {
        throw new Error("不接受来自其他页面的桌面操作");
      }
      return callback(...args);
    });
  }
  const connectionState = async () => ({
    ...(await gateway.state()),
    backgroundAvailable: Boolean(tray),
  });
  handle("snap:state", connectionState);
  handle("snap:refresh-code", () => {
    gateway.pairing.rotate();
    return connectionState();
  });
  handle("snap:network", (address) => {
    if (!addresses().some((item) => item.address === address))
      throw new Error("网络地址已失效，请刷新");
    gateway.selectedAddress = address;
    return connectionState();
  });
  handle("snap:revoke", (id) => {
    gateway.revoke(String(id));
    return connectionState();
  });
  handle("snap:pause", (value) => {
    gateway.pause(value);
    return connectionState();
  });
  handle("snap:permission", () => native.openPermission());
  handle("snap:test-capture", async () => {
    const result = await native.capture();
    return { width: result.width, height: result.height };
  });
  handle("snap:copy", async () => native.copy((await gateway.state()).baseUrl));
  handle("snap:preview", async () => {
    const state = await gateway.state();
    await shell.openExternal(state.pairingUrl);
  });
  handle("snap:quit", () => app.quit());
  window = new BrowserWindow({
    title: "Snap-Solver",
    width: 860,
    height: 740,
    minWidth: 780,
    minHeight: 700,
    backgroundColor: "#ffffff",
    show: false,
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  window.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  window.webContents.on("will-navigate", (event) => event.preventDefault());
  window.webContents.session.setPermissionRequestHandler(
    (_webContents, _permission, callback) => callback(false),
  );
  window.on("close", (event) => {
    if (!quitting && tray) {
      event.preventDefault();
      window.hide();
    }
  });
  await window.loadFile(page);
  window.show();
  Menu.setApplicationMenu(
    Menu.buildFromTemplate([
      {
        label: "Snap-Solver",
        submenu: [
          { label: "显示连接窗口", click: () => window.show() },
          { type: "separator" },
          { role: "quit", label: "退出 Snap-Solver" },
        ],
      },
      { role: "editMenu", label: "编辑" },
      { role: "windowMenu", label: "窗口" },
    ]),
  );
  try {
    // nativeImage accepts bitmap/PNG, not SVG. Draw a small template bitmap so
    // the tray remains visible on both platforms and at Retina scale.
    const pixels = Buffer.alloc(44 * 44 * 4);
    const rectangles = [
      [6, 6, 10, 4],
      [6, 6, 4, 10],
      [28, 6, 10, 4],
      [34, 6, 4, 10],
      [6, 28, 4, 10],
      [6, 34, 10, 4],
      [34, 28, 4, 10],
      [28, 34, 10, 4],
      [15, 20, 14, 4],
      [20, 15, 4, 14],
    ];
    for (const [x, y, width, height] of rectangles) {
      for (let row = y; row < y + height; row++)
        for (let column = x; column < x + width; column++) {
          const index = (row * 44 + column) * 4;
          pixels[index] = 76;
          pixels[index + 1] = 130;
          pixels[index + 2] = 90;
          pixels[index + 3] = 255;
        }
    }
    const icon = nativeImage.createFromBitmap(pixels, {
      width: 44,
      height: 44,
      scaleFactor: 2,
    });
    if (process.platform === "darwin") icon.setTemplateImage(true);
    tray = new Tray(icon);
    tray.setToolTip("Snap-Solver · 手机连接服务");
    tray.setContextMenu(
      Menu.buildFromTemplate([
        { label: "打开 Snap-Solver", click: () => window.show() },
        { label: "退出", click: () => app.quit() },
      ]),
    );
    tray.on("click", () => window.show());
  } catch {
    tray = null; /* Without a tray, closing the window quits normally. */
  }
  try {
    await runtime.start();
  } catch (error) {
    runtime.error = error.message;
    await runtime.stop();
  }
}
app.on("activate", () => window?.show());
app.on("window-all-closed", () => {
  if (!tray) app.quit();
});
app.on("before-quit", (event) => {
  quitting = true;
  if (shutDown) return;
  event.preventDefault();
  Promise.allSettled([runtime?.stop(), gateway?.close()]).then(() => {
    shutDown = true;
    tray?.destroy();
    app.quit();
  });
});
for (const signal of ["SIGINT", "SIGTERM"])
  process.on(signal, () => app.quit());
