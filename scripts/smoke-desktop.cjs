// Development acceptance check. Uses isolated data and no model credentials.
const { _electron: electron, expect } = require("@playwright/test");
const fs = require("node:fs");
const path = require("node:path");
const catalog = require("../config/providers.json");
const root = path.resolve(__dirname, "..");
(async () => {
  const directory = path.join(
    root,
    ".test-data",
    "desktop-smoke-" + Date.now(),
  );
  fs.mkdirSync(path.join(root, "artifacts"), { recursive: true });
  const env = {
    ...process.env,
    SNAP_DATA_DIR: directory,
    SNAP_LEGACY_DIR: path.join(directory, "no-legacy"),
  };
  for (const provider of catalog.providers) env[provider.envKey] = "";
  const app = await electron.launch({ args: [root], env });
  try {
    const page = await app.firstWindow();
    await expect
      .poll(
        async () => {
          const state = await page.evaluate(() => window.snap.state());
          if (state.error) throw new Error(state.error);
          return state.ready;
        },
        { timeout: 120000, intervals: [500] },
      )
      .toBe(true);
    await expect(page.locator("#qr-cover")).toBeHidden();
    await expect(page.locator("#service-status")).toHaveText("可以连接手机");
    await expect(page.getByRole("button", { name: "检查截屏", exact: true })).toBeVisible();
    await page.getByRole("button", { name: "暂停手机访问", exact: true }).click();
    await expect(page.locator("#service-status")).toHaveText("手机访问已暂停");
    await expect(page.locator("#qr-cover")).toHaveText("恢复访问后可扫码");
    await page.screenshot({ path: path.join(root, "artifacts/desktop-paused.png"), scale: "css" });
    await page.getByRole("button", { name: "恢复手机访问", exact: true }).click();
    await expect(page.locator("#qr-cover")).toBeHidden();
    const state = await page.evaluate(() => window.snap.state());
    await page.screenshot({
      path: path.join(root, "artifacts/desktop.png"),
      scale: "css",
    });
    const capture = await page.evaluate(async () => {
      try {
        return { success: true, ...(await window.snap.testCapture()) };
      } catch (error) {
        return { success: false, error: error.message };
      }
    });
    const closeToTray = await app.evaluate(({ BrowserWindow }) => {
      const window = BrowserWindow.getAllWindows()[0];
      window.close();
      return { visible: window.isVisible(), destroyed: window.isDestroyed() };
    });
    expect(closeToTray).toEqual({ visible: false, destroyed: false });
    const report = {
      at: new Date().toISOString(),
      platform: process.platform,
      ready: state.ready,
      permission: state.permission,
      capture,
      closeToTray,
    };
    fs.writeFileSync(
      path.join(root, "artifacts/native-check.json"),
      JSON.stringify(report, null, 2) + "\n",
    );
    console.log(JSON.stringify(report));
  } finally {
    await app.evaluate(({ app }) => app.quit()).catch(() => {});
    await app.close();
    fs.rmSync(directory, { recursive: true, force: true });
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
