const os = require("node:os");

function addresses() {
  return Object.entries(os.networkInterfaces())
    .flatMap(([name, entries]) =>
      (entries || [])
        .filter((item) => item.family === "IPv4" && !item.internal)
        .map((item) => ({ name, address: item.address })),
    )
    .sort(
      (a, b) =>
        Number(/utun|docker|vmnet|vEthernet|bridge/i.test(a.name)) -
        Number(/utun|docker|vmnet|vEthernet|bridge/i.test(b.name)),
    );
}

function createNative(electron) {
  const { desktopCapturer, screen, systemPreferences, shell, clipboard } =
    electron;
  let capturing = false;
  function permission() {
    return process.platform === "darwin"
      ? systemPreferences.getMediaAccessStatus("screen")
      : "granted";
  }
  function displays() {
    const primary = screen.getPrimaryDisplay().id;
    return screen.getAllDisplays().map((item, index) => ({
      id: String(item.id),
      name: item.label || "屏幕 " + (index + 1),
      width: item.size.width,
      height: item.size.height,
      primary: item.id === primary,
    }));
  }
  async function capture(displayId) {
    if (capturing) throw new Error("正在截屏，请稍候");
    capturing = true;
    try {
      const display =
        screen
          .getAllDisplays()
          .find((item) => String(item.id) === String(displayId)) ||
        screen.getPrimaryDisplay();
      const scale = Math.min(
        1,
        2560 /
          Math.max(
            display.size.width * display.scaleFactor,
            display.size.height * display.scaleFactor,
          ),
      );
      const sources = await desktopCapturer.getSources({
        types: ["screen"],
        thumbnailSize: {
          width: Math.round(display.size.width * display.scaleFactor * scale),
          height: Math.round(display.size.height * display.scaleFactor * scale),
        },
      });
      if (permission() !== "granted") {
        throw new Error("请在电脑 App 中开启屏幕录制权限，然后重启 App");
      }
      const source = sources.find(
        (item) => item.display_id === String(display.id),
      );
      if (!source || source.thumbnail.isEmpty())
        throw new Error("暂时无法读取屏幕，请确认电脑已解锁且显示器已连接");
      const size = source.thumbnail.getSize();
      return {
        image:
          "data:image/jpeg;base64," +
          source.thumbnail.toJPEG(92).toString("base64"),
        width: size.width,
        height: size.height,
        displayId: String(display.id),
      };
    } finally {
      capturing = false;
    }
  }
  return {
    permission,
    displays,
    capture,
    async openPermission() {
      if (process.platform === "darwin") {
        await shell.openExternal(
          "x-apple.systempreferences:com.apple.preference.security?Privacy_ScreenCapture",
        );
      }
    },
    copy(text) {
      clipboard.writeText(String(text));
    },
  };
}
module.exports = { createNative, addresses };
