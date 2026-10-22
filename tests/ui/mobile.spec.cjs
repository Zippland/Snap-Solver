const { test, expect } = require("@playwright/test");
const path = require("node:path");
const fs = require("node:fs");
const os = require("node:os");
const { createFixture } = require("../fixture.cjs");
let fixture, directory;
test.beforeAll(async () => {
  directory = fs.mkdtempSync(path.join(os.tmpdir(), "snap-ui-"));
  fixture = await createFixture(directory);
});
test.afterAll(async () => {
  await fixture?.stop();
  if (directory) fs.rmSync(directory, { recursive: true, force: true });
});
test("真实 Open WebUI 手机流程：配对、截图、框选、流式回复、追问、停止与撤销", async ({
  page,
}, testInfo) => {
  const pageErrors = [];
  const pendingModels = new Set();
  page.on("pageerror", (error) => pageErrors.push(error.message));
  page.on("request", (request) => {
    if (new URL(request.url()).pathname === "/api/models") pendingModels.add(request);
  });
  page.on("requestfinished", (request) => pendingModels.delete(request));
  page.on("requestfailed", (request) => pendingModels.delete(request));
  await page.goto(fixture.url + "/snap/pair");
  await expect(page.locator("h1")).toContainText("连接你的电脑");
  await page.screenshot({
    path: "test-results/pair-" + testInfo.project.name + ".png",
    fullPage: true,
  });
  await page.goto(fixture.pairingUrl);
  await expect(page.locator("#chat-input")).toBeVisible({ timeout: 60000 });
  await expect(page.getByText("已登录。", { exact: true })).not.toBeVisible();
  fs.writeFileSync(
    path.join("test-results", "chat-dom-" + testInfo.project.name + ".html"),
    await page.content(),
  );
  await page.screenshot({
    path: "test-results/chat-initial-" + testInfo.project.name + ".png",
    fullPage: true,
  });
  // Each click adds one attachment; it never submits or replaces the draft.
  const editor = page.locator("#chat-input");
  await editor.fill("请解释这道题");
  const attachments = page
    .locator("#message-input-container")
    .getByRole("button", { name: "显示图像预览" });
  await page.locator("#snap-capture").click();
  await expect(attachments).toHaveCount(1);
  await page.locator("#snap-capture").click();
  await expect(attachments).toHaveCount(2);
  await expect(editor).toContainText("请解释这道题");
  expect(fixture.requests).toHaveLength(0);
  await page.locator("#snap-crop").click();
  await expect(page.locator("#snap-crop-dialog")).toBeVisible();
  await expect(page.locator(".cropper-crop-box")).toBeVisible();
  await page.screenshot({
    path: "test-results/crop-" + testInfo.project.name + ".png",
  });
  await page.locator("#snap-attach").click();
  await expect(page.locator("#snap-crop-dialog")).toHaveCount(0);
  await expect(attachments).toHaveCount(3);
  await page.screenshot({
    path: "test-results/attachments-" + testInfo.project.name + ".png",
  });
  // Removing an attachment also stays in the upstream composer state.
  await page
    .locator("#message-input-container")
    .getByRole("button", { name: "移除文件", exact: true })
    .first()
    .click();
  await expect(attachments).toHaveCount(2);
  await page.locator("#send-message-button").click();
  await expect(
    page.getByText("截图已收到。这是本地模拟模型的验证回答。", {
      exact: false,
    }),
  ).toBeVisible({ timeout: 45000 });
  await expect.poll(() => fixture.requests.length).toBe(1);
  const first = fixture.requests[0];
  const parts = first.messages.flatMap((message) =>
    Array.isArray(message.content) ? message.content : [],
  );
  expect(
    parts.filter(
      (part) =>
        part.type === "image_url" &&
        part.image_url.url.startsWith("data:image/"),
    ),
  ).toHaveLength(2);
  await expect(page.locator(".katex").first()).toBeVisible();
  await expect(
    page.getByRole("button", { name: "停止", exact: true }),
  ).not.toBeVisible();
  await page.screenshot({
    path: "test-results/answer-" + testInfo.project.name + ".png",
    fullPage: true,
  });
  await page
    .getByRole("button", { name: "已选择：Qwen 3.8 Max", exact: true })
    .click();
  await page.getByText("Qwen 3.8 Flash", { exact: true }).click();
  await editor.fill("为什么是 5？");
  await page.locator("#send-message-button").click();
  await expect(
    page.getByText("前一轮的截图和对话上下文都保留了。", { exact: false }),
  ).toBeVisible();
  expect(
    fixture.requests[1].messages.some(
      (message) => message.role === "assistant",
    ),
  ).toBe(true);
  expect(fixture.requests[1].model).toBe("qwen3.8-flash");
  await expect(
    page.getByRole("button", { name: "停止", exact: true }),
  ).not.toBeVisible();
  // Let the native model-list refresh finish before deliberately unloading it.
  // WebKit otherwise reports the cancelled old-document fetch as a page error.
  await expect.poll(() => pendingModels.size).toBe(0);
  await page.reload();
  await expect(
    page.getByText("前一轮的截图和对话上下文都保留了。", { exact: false }),
  ).toBeVisible();
  await page.locator("#chat-input").fill("慢速测试");
  await page.locator("#send-message-button").click();
  await expect.poll(() => fixture.requests.length).toBe(3);
  await expect(
    page.getByRole("button", { name: "停止", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "停止", exact: true }).click();
  await expect
    .poll(() => fixture.closed.some((item) => item.slow && !item.completed))
    .toBe(true);
  expect(pageErrors).toEqual([]);
  fixture.gateway.revoke(fixture.gateway.pairing.list()[0].id);
  await page.reload();
  await expect(page.locator("#pair-form")).toBeVisible();
});
test("附件整理：多屏、编号、大图、删除与撤销，实际发送顺序一致", async ({
  page,
}, testInfo) => {
  const before = fixture.requests.length;
  await page.goto(fixture.pairingUrl);
  await expect(page.locator("#snap-capture")).toBeEnabled();
  await expect(page.locator("#snap-connection")).toHaveText("电脑已连接");
  await expect(page.locator("#temporary-chat-button")).not.toBeVisible();
  await expect(page.locator("#voice-input-button")).not.toBeVisible();
  await expect(page.locator("#input-menu-button")).not.toBeVisible();
  await expect(
    page.getByRole("button", { name: "语音模式", exact: true }),
  ).not.toBeVisible();
  await page.locator("#snap-display").selectOption("2");
  const editor = page.locator("#chat-input");
  await editor.fill("把这几张图一起解释一下");
  const images = page.locator("#message-input-container .snap-attachment img");
  for (let count = 1; count <= 3; count++) {
    await page.locator("#snap-capture").click();
    await expect(images).toHaveCount(count);
    await expect(page.locator("#snap-capture")).toBeEnabled();
  }
  expect(fixture.captures.at(-1).displayId).toBe("2");
  await expect(page.locator("#snap-attachment-heading")).toContainText(
    "3 张待发送",
  );
  // A short viewport models the space available above a phone keyboard.
  // Pictures must scroll within the draft without pushing send off screen.
  await page.setViewportSize({ width: 390, height: 460 });
  const reachableSend = () => page.locator("#send-message-button").evaluate((element) => {
    const box = element.getBoundingClientRect();
    const hit = document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2);
    return box.top >= 0 && box.bottom <= innerHeight && element.contains(hit);
  });
  await expect.poll(reachableSend).toBe(true);
  await page.locator(".snap-attachment").last().scrollIntoViewIfNeeded();
  await expect.poll(reachableSend).toBe(true);
  await page.setViewportSize({ width: 390, height: 844 });
  // Safari may keep the layout viewport tall when the keyboard opens. Exercise
  // that separate visual-viewport event, not only a resized browser window.
  await page.evaluate(() => {
    Object.defineProperty(window.visualViewport, "height", { configurable: true, get: () => 460 });
    window.visualViewport.dispatchEvent(new Event("resize"));
  });
  await expect.poll(async () => (await page.locator("#send-message-button").boundingBox()).y).toBeLessThan(420);
  await page.evaluate(() => {
    delete window.visualViewport.height;
    window.visualViewport.dispatchEvent(new Event("resize"));
  });
  await expect(page.locator(".snap-start").getByText("Snap-Solver (Open WebUI)", { exact: false })).toBeVisible();
  await expect(page.getByText("已登录。", { exact: true })).not.toBeVisible();
  expect(
    await page
      .locator(".snap-attachment")
      .evaluateAll((nodes) => nodes.map((n) => n.dataset.snapIndex)),
  ).toEqual(["1", "2", "3"]);
  await page.screenshot({
    path: "test-results/organized-" + testInfo.project.name + ".png",
  });
  const original = await images.evaluateAll((nodes) => nodes.map((n) => n.src));
  await page
    .getByRole("button", { name: "显示图像预览", exact: true })
    .nth(1)
    .click();
  await expect(page.locator("#snap-preview header span")).toHaveText("2 / 3");
  await page.getByRole("button", { name: "下一张图片", exact: true }).click();
  await expect(page.locator("#snap-preview header span")).toHaveText("3 / 3");
  await expect(
    page.getByRole("button", { name: "下一张图片", exact: true }),
  ).toBeDisabled();
  await page.getByRole("button", { name: "放大图片", exact: true }).click();
  await expect(page.locator(".snap-preview-stage")).toHaveClass(/zoomed/);
  await page.getByRole("button", { name: "适合屏幕", exact: true }).click();
  await page.screenshot({
    path: "test-results/image-preview-" + testInfo.project.name + ".png",
  });
  await page.getByRole("button", { name: "关闭图片预览", exact: true }).click();
  await page
    .getByRole("button", { name: "移除文件", exact: true })
    .nth(1)
    .click();
  await expect(images).toHaveCount(2);
  await expect(page.locator("#snap-capture")).toBeEnabled();
  expect(await images.evaluateAll((nodes) => nodes.map((n) => n.src))).toEqual([
    original[0],
    original[2],
  ]);
  await page.locator("#snap-undo").click();
  await expect(images).toHaveCount(3);
  await expect(page.locator("#snap-capture")).toBeEnabled();
  await expect(page.locator("#snap-toast")).toContainText("恢复到末尾");
  const contents = [];
  for (const image of await images.evaluateAll((nodes) =>
    nodes.map((n) => n.src),
  )) {
    contents.push(
      (await (await page.request.get(image)).body()).toString("base64"),
    );
  }
  // Clear + restore preserves all images, including their current send order.
  await page
    .getByRole("button", { name: "清空待发送图片", exact: true })
    .click();
  await expect(images).toHaveCount(0);
  await page.locator("#snap-undo").click();
  await expect(images).toHaveCount(3);
  await expect(page.locator("#snap-capture")).toBeEnabled();
  await expect(editor).toHaveText("把这几张图一起解释一下");
  expect(fixture.requests.length).toBe(before);
  await page.locator("#send-message-button").click();
  await expect.poll(() => fixture.requests.length).toBe(before + 1);
  const sent = fixture.requests.at(-1).messages.at(-1).content;
  expect(
    sent
      .filter((p) => p.type === "image_url")
      .map((p) => p.image_url.url.split(",")[1]),
  ).toEqual(contents);
  await expect(
    page.getByRole("button", { name: "停止", exact: true }),
  ).not.toBeVisible();
  await expect(images).toHaveCount(0);
  await page.locator("#sidebar-toggle-button").click();
  await expect(page.locator("#snap-sidebar-settings")).toBeVisible();
  await expect(page.locator('#sidebar a[href="/workspace"]')).not.toBeVisible();
  await expect
    .poll(async () =>
      Math.round((await page.locator("#sidebar").boundingBox()).x),
    )
    .toBe(0);
  await page.screenshot({
    path: "test-results/sidebar-" + testInfo.project.name + ".png",
  });
});

test("截图未完成不能抢先发送，切换对话后不把截图加入新草稿", async ({
  page,
}) => {
  await page.goto(fixture.pairingUrl);
  await expect(page.locator("#snap-capture")).toBeEnabled();
  await page.locator("#chat-input").fill("正在编辑的问题");
  const before = fixture.requests.length;
  let release;
  const gate = new Promise((resolve) => {
    release = resolve;
  });
  await page.route("**/snap/api/capture", async (route) => {
    await gate;
    await route.continue();
  });
  try {
    await page.locator("#snap-capture").click();
    await expect(page.locator("#snap-capture")).toHaveAttribute(
      "aria-busy",
      "true",
    );
    await page.locator("#send-message-button").click();
    await page.locator("#chat-input").press("Enter");
    expect(fixture.requests.length).toBe(before);
    await page.locator("#sidebar-toggle-button").click();
    await page.locator("#sidebar a#sidebar-new-chat-button").click();
  } finally {
    release();
  }
  await expect(page.locator("#snap-toast")).toContainText("对话已切换");
  await expect(
    page.locator("#message-input-container .snap-attachment"),
  ).toHaveCount(0);
  await expect(page.locator("#snap-capture")).toBeEnabled();
  expect(fixture.requests.length).toBe(before);
  await page.unroute("**/snap/api/capture");
  await page.route("**/snap/api/capture", (route) =>
    route.fulfill({
      status: 400,
      contentType: "application/json",
      body: JSON.stringify({ error: "请先授予截屏权限" }),
    }),
  );
  await page.locator("#chat-input").fill("保留这段草稿");
  await page.locator("#snap-capture").click();
  await expect(page.locator("#snap-toast")).toContainText("请先授予截屏权限");
  await expect(page.locator("#chat-input")).toHaveText("保留这段草稿");
  await expect(page.locator("#snap-capture")).toBeEnabled();
});

test("手机选图、附件上限与已保存草稿恢复", async ({ page }) => {
  const before = fixture.requests.length;
  await page.route("**/snap/api/status", async (route) => {
    const response = await route.fetch();
    const status = await response.json();
    await route.fulfill({ response, json: { ...status, maxImages: 2 } });
  });
  await page.goto(fixture.pairingUrl);
  await expect(page.locator("#snap-capture")).toBeEnabled();
  const png = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jWZkAAAAASUVORK5CYII=",
    "base64",
  );
  const file = (name) => ({ name, mimeType: "image/png", buffer: png });
  const chooseImages = async (files) => {
    const opened = page.waitForEvent("filechooser");
    await page.locator("#snap-upload").click();
    await (await opened).setFiles(files);
  };
  await chooseImages([file("one.png"), file("two.png"), file("three.png")]);
  await expect(page.locator("#snap-toast")).toContainText("最多添加 2 张");
  const images = page.locator("#message-input-container .snap-attachment");
  await expect(images).toHaveCount(0);
  await chooseImages([file("one.png"), file("two.png")]);
  await expect(images).toHaveCount(2);
  await expect(page.locator("#snap-capture")).toHaveAttribute(
    "aria-busy",
    "false",
  );
  await expect(page.locator("#snap-capture")).toBeDisabled();
  await expect(page.locator("#snap-composer-hint")).toContainText("已满 2 张");
  await page.locator("#chat-input").fill("稍后继续这个问题");
  // Open WebUI debounces draft persistence by 500 ms. Wait for its actual
  // save acknowledgement, not an arbitrary sleep or a second draft store.
  await expect
    .poll(() =>
      page.evaluate(() => {
        const draft = JSON.parse(sessionStorage.getItem("chat-input") || "{}");
        return { files: draft.files?.length, prompt: draft.prompt };
      }),
    )
    .toEqual({ files: 2, prompt: "稍后继续这个问题" });
  await page.reload();
  await expect(images).toHaveCount(2);
  await expect(page.locator("#chat-input")).toHaveText("稍后继续这个问题");
  await page
    .getByRole("button", { name: "移除文件", exact: true })
    .first()
    .click();
  await expect(images).toHaveCount(1);
  await expect(page.locator("#snap-capture")).toBeEnabled();
  expect(fixture.requests.length).toBe(before);
});

test("裁剪策略覆盖旧开关，但保留已连接的模型", async () => {
  const before = await fixture.runtime.providers();
  await fixture.runtime.request("/api/v1/configs/import", {
    method: "POST",
    body: {
      config: {
        "folders.enable": true,
        "image_generation.enable": true,
        "ui.enable_message_rating": true,
      },
    },
  });
  await fixture.runtime.applyProductScope();
  const config = await fixture.runtime.request("/api/config");
  for (const key of [
    "enable_folders",
    "enable_image_generation",
    "enable_message_rating",
    "enable_notes",
    "enable_web_search",
    "enable_code_execution",
    "enable_plugins",
  ])
    expect(config.features[key]).toBe(false);
  expect(config.file.max_count).toBe(12);
  expect(await fixture.runtime.providers()).toEqual(before);
});

test("手机模型设置按需展开，保存保留密钥且不会调用模型", async ({
  page,
}, testInfo) => {
  const before = fixture.requests.length;
  await page.goto(fixture.pairingUrl);
  await expect(page.locator("#chat-input")).toBeVisible();
  await page.goto(fixture.url + "/snap/models");
  await expect(page.locator(".provider-button")).toHaveCount(6);
  await expect(page.locator("#provider-dialog")).not.toBeVisible();
  await page.screenshot({
    path: "test-results/models-" + testInfo.project.name + ".png",
  });
  await page.locator('[data-id="alibaba"]').click();
  await expect(page.locator("#api-key")).toHaveValue("");
  await expect(page.locator("#model-list")).not.toBeVisible();
  await page.screenshot({
    path: "test-results/model-sheet-" + testInfo.project.name + ".png",
  });
  await page.locator("#save").click();
  await expect(page.locator("#chat-input")).toBeVisible();
  const data = await (
    await page.request.get(fixture.url + "/snap/api/providers")
  ).json();
  expect(
    data.providers.find((provider) => provider.id === "alibaba").configured,
  ).toBe(true);
  expect(JSON.stringify(data)).not.toContain("test-only-never-real");
  expect(fixture.requests).toHaveLength(before);
});
test("OpenAI Responses 多模态协议转换与提示词初始化", async () => {
  const prompts = await fixture.runtime.request("/api/v1/prompts/");
  expect(prompts.some((prompt) => prompt.command === "/snap-a_default")).toBe(
    true,
  );
  await fixture.runtime.saveProvider("openai", {
    apiKey: "test-only-never-real",
    baseUrl: fixture.providerUrl,
  });
  await fixture.runtime.request("/api/models");
  const png =
    "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jWZkAAAAASUVORK5CYII=";
  const result = await fixture.runtime.request("/openai/chat/completions", {
    method: "POST",
    body: {
      model: "openai.gpt-6.1-sol",
      stream: false,
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: "测试" },
            { type: "image_url", image_url: { url: png } },
          ],
        },
      ],
    },
  });
  expect(JSON.stringify(result)).toContain("Responses 多模态转换已验证");
  const sent = fixture.requests.at(-1);
  expect(sent.model).toBe("gpt-6.1-sol");
  expect(
    sent.input[0].content.some(
      (part) => part.type === "input_image" && part.image_url === png,
    ),
  ).toBe(true);
});
test("窄屏操作可见，权限、暂停、断连和恢复都有明确状态", async ({ page }, testInfo) => {
  const before = fixture.requests.length;
  let override = {}, disconnected = false;
  await page.route("**/snap/api/status", async (route) => {
    if (disconnected) return route.abort("connectionrefused");
    const response = await route.fetch();
    await route.fulfill({ response, json: { ...(await response.json()), ...override } });
  });
  await page.goto(fixture.pairingUrl);
  await expect(page.locator("#snap-capture")).toBeEnabled();
  await page.setViewportSize({ width: 320, height: 740 });
  await page.locator("#chat-input").fill("这张图里的问题");
  await page.locator("#snap-capture").click();
  await expect(page.locator(".snap-attachment")).toHaveCount(1);
  await expect(page.getByText("已登录。", { exact: true })).not.toBeVisible();
  // Test actual hit targets: text labels must not push actions off screen or
  // let the connection indicator cover the native navigation.
  for (const id of ["snap-capture", "snap-crop", "snap-upload", "snap-models", "snap-display", "send-message-button", "sidebar-toggle-button"]) {
    const control = page.locator("#" + id);
    await expect(control).toBeVisible();
    const reachable = await control.evaluate((element) => {
      const box = element.getBoundingClientRect();
      const hit = document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2);
      return box.x >= 0 && box.right <= innerWidth && box.top >= 0 && box.bottom <= innerHeight && element.contains(hit);
    });
    expect(reachable, id + " should be within the screen and unobscured").toBe(true);
  }
  await page.screenshot({ path: "test-results/narrow-" + testInfo.project.name + ".png" });
  const heartbeat = () => page.evaluate(() => document.dispatchEvent(new Event("visibilitychange")));
  override = { permission: "denied" };
  await heartbeat();
  await expect(page.locator("#snap-connection")).toHaveText("截屏未授权");
  await expect(page.locator("#snap-composer-hint")).toContainText("开启截屏权限");
  await expect(page.locator("#snap-capture")).toBeDisabled();
  await expect(page.locator("#snap-upload")).toBeEnabled();
  await page.screenshot({ path: "test-results/permission-" + testInfo.project.name + ".png" });
  override = { paused: true };
  await heartbeat();
  await expect(page.locator("#snap-connection")).toHaveText("手机访问已暂停");
  await expect(page.locator("#snap-upload")).toBeDisabled();
  const chatUrl = page.url();
  // An anchor with aria-disabled is still pointer-clickable in a browser;
  // force bypasses Playwright's accessibility guard to exercise our handler.
  await page.locator("#snap-models").click({ force: true });
  await expect(page).toHaveURL(chatUrl);
  override = { ready: false, error: "模拟启动错误" };
  await heartbeat();
  await expect(page.locator("#snap-connection")).toHaveText("电脑启动失败");
  await expect(page.locator("#snap-composer-hint")).toContainText("启动失败");
  disconnected = true;
  await heartbeat();
  await expect(page.locator("#snap-connection")).toHaveText("电脑连接已断开");
  await expect(page.locator("#snap-capture")).toBeDisabled();
  disconnected = false;
  override = {};
  await page.locator("#snap-composer-hint").getByRole("button", { name: "重试" }).click();
  await expect(page.locator("#snap-capture")).toBeEnabled();
  await expect(page.locator("#snap-composer-hint")).toBeHidden();
  await expect(page.locator("#chat-input")).toHaveText("这张图里的问题");
  await expect(page.locator(".snap-attachment")).toHaveCount(1);
  let modelListFailed = true;
  await page.route("**/snap/api/available-models", async (route) => {
    if (!modelListFailed) return route.continue();
    await route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ error: "暂时无法读取模型列表" }) });
  });
  await page.reload();
  await expect(page.locator("#snap-composer-hint")).toContainText("模型列表未加载");
  await expect(page.locator("#snap-capture")).toBeDisabled();
  modelListFailed = false;
  await page.locator("#snap-composer-hint").getByRole("button", { name: "重试" }).click();
  await expect(page.locator("#snap-capture")).toBeEnabled();
  await expect(page.locator("#snap-composer-hint")).toBeHidden();
  await expect(page.locator("#snap-toast")).toBeHidden();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: "test-results/phone-labels-" + testInfo.project.name + ".png" });
  await page.setViewportSize({ width: 320, height: 740 });
  await page.locator("#snap-models").click();
  await expect(page.locator(".provider-button")).toHaveCount(6);
  await expect(page.locator('[data-id="alibaba"]')).toContainText("密钥已存");
  await page.screenshot({ path: "test-results/models-narrow-" + testInfo.project.name + ".png" });
  await page.locator('[data-id="alibaba"]').click();
  await expect(page.locator("#provider-dialog")).toBeVisible();
  await page.screenshot({ path: "test-results/model-sheet-narrow-" + testInfo.project.name + ".png" });
  await page.getByRole("button", { name: "关闭模型设置" }).click();
  await expect(page.locator("#provider-dialog")).toBeHidden();
  expect(fixture.requests.length).toBe(before);
});

test("暂停或启动失败时刷新显示等待页，恢复后回到原页面", async ({ page }, testInfo) => {
  const before = fixture.requests.length;
  await page.goto(fixture.pairingUrl);
  await expect(page.locator("#chat-input")).toBeVisible();
  await page.goto(fixture.url + "/snap/models");
  await expect(page.locator(".provider-button")).toHaveCount(6);
  try {
    fixture.gateway.pause(true);
    const paused = await page.reload();
    expect(paused.status()).toBe(423);
    await expect(page.locator("#connection-state")).toHaveText("手机访问已暂停");
    await page.screenshot({ path: "test-results/paused-page-" + testInfo.project.name + ".png" });
    fixture.gateway.pause(false);
    await page.getByRole("button", { name: "重新检查" }).click();
    await expect(page.locator(".provider-button")).toHaveCount(6);
    await expect(page).toHaveURL(fixture.url + "/snap/models");
    fixture.runtime.ready = false;
    fixture.runtime.error = "模拟启动失败";
    const failed = await page.goto(fixture.url + "/");
    expect(failed.status()).toBe(503);
    await expect(page.locator("#connection-state")).toHaveText("电脑启动失败");
    fixture.runtime.error = "";
    await page.getByRole("button", { name: "重新检查" }).click();
    await expect(page.locator("#connection-state")).toHaveText("电脑正在启动");
    fixture.runtime.ready = true;
    await page.getByRole("button", { name: "重新检查" }).click();
    await expect(page.locator("#chat-input")).toBeVisible();
    expect(fixture.requests.length).toBe(before);
  } finally {
    fixture.runtime.ready = true;
    fixture.runtime.error = "";
    fixture.gateway.pause(false);
  }
});

test("首次没有密钥时可以进入模型配置", async ({ page }, testInfo) => {
  for (const id of ["alibaba", "openai"]) {
    await fixture.runtime.saveProvider(id, { apiKey: "", remove: true });
  }
  await page.goto(fixture.pairingUrl);
  await expect(page.locator("#snap-models")).toBeVisible();
  await expect(page.locator("#snap-models")).toContainText("连接模型");
  await expect(page.locator("#snap-capture")).toBeDisabled();
  await expect(page.getByText("已登录。", { exact: true })).not.toBeVisible();
  await page.screenshot({
    path: "test-results/first-run-" + testInfo.project.name + ".png",
  });
  await page.locator("#snap-models").click();
  await expect(page.locator(".provider-button")).toHaveCount(6);
});
