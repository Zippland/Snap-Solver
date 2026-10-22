const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { Gateway } = require("../desktop/gateway.cjs");
const { COOKIE } = require("../desktop/pairing.cjs");
test("局域网网关阻止未配对、跨站和撤销设备访问系统能力", async (t) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "snap-gateway-"));
  let captures = 0;
  const native = {
    permission: () => "granted",
    displays: () => [],
    capture: async () => {
      captures++;
      return { image: "test" };
    },
  };
  const runtime = { ready: true };
  const gateway = new Gateway(directory, native, runtime);
  await gateway.start();
  t.after(async () => {
    await gateway.close();
    fs.rmSync(directory, { recursive: true, force: true });
  });
  const url = "http://127.0.0.1:" + gateway.port;
  assert.equal(
    (await fetch(url + "/snap/api/capture", { method: "POST" })).status,
    401,
  );
  assert.equal(
    (
      await fetch(url + "/api/models", {
        headers: { Accept: "application/json" },
      })
    ).status,
    401,
  );
  const code = gateway.pairing.info().token;
  let response = await fetch(url + "/snap/api/pair", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Snap-Client": "mobile",
      Origin: "https://elsewhere.test",
    },
    body: JSON.stringify({ credential: code }),
  });
  assert.equal(response.status, 403);
  response = await fetch(url + "/snap/api/pair", {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Snap-Client": "mobile" },
    body: JSON.stringify({ credential: code, name: "测试手机" }),
  });
  assert.equal(response.status, 200);
  const cookie = response.headers.get("set-cookie").split(";")[0];
  assert.ok(cookie.startsWith(COOKIE + "="));
  const headers = {
    Cookie: cookie,
    "X-Snap-Client": "mobile",
    "Content-Type": "application/json",
    // pause/revoke deliberately destroy existing sockets. Probe the next
    // request on a fresh connection rather than an undici pooled socket.
    Connection: "close",
  };
  assert.equal(
    (
      await fetch(url + "/snap/api/capture", {
        method: "POST",
        headers,
        body: "{}",
      })
    ).status,
    200,
  );
  assert.equal(captures, 1);
  for (const route of ["/admin/settings", "/workspace/models", "/playground"]) {
    const result = await fetch(url + route, { headers, redirect: "manual" });
    assert.equal(result.status, 302);
    assert.equal(result.headers.get("location"), "/");
  }
  for (const route of [
    "/api/v1/audio/speech",
    "/api/v1/images/generations",
    "/api/v1/configs/import",
    "/api/v1/utils/code/execute",
  ]) {
    const result = await fetch(url + route, {
      method: "POST",
      headers,
      body: "{}",
    });
    assert.equal(result.status, 403);
  }
  gateway.pause(true);
  const pausedPage = await fetch(url + "/", { headers: { ...headers, Accept: "text/html" } });
  assert.equal(pausedPage.status, 423);
  assert.match(pausedPage.headers.get("content-type"), /text\/html/);
  assert.match(await pausedPage.text(), /connection-state/);
  assert.equal(
    (
      await fetch(url + "/snap/api/capture", {
        method: "POST",
        headers,
        body: "{}",
      })
    ).status,
    423,
  );
  gateway.pause(false);
  runtime.ready = false;
  const startingPage = await fetch(url + "/c/test-chat", { headers: { ...headers, Accept: "text/html" } });
  assert.equal(startingPage.status, 503);
  assert.match(await startingPage.text(), /connection-state/);
  const startingApi = await fetch(url + "/api/models", { headers: { ...headers, Accept: "text/html" } });
  assert.equal(startingApi.status, 503);
  assert.match(startingApi.headers.get("content-type"), /application\/json/);
  runtime.ready = true;
  gateway.revoke(gateway.pairing.list()[0].id);
  assert.equal(
    (
      await fetch(url + "/snap/api/capture", {
        method: "POST",
        headers,
        body: "{}",
      })
    ).status,
    401,
  );
  assert.equal(captures, 1);
});
test("重启复用局域网端口，被占用时重新选择", async (t) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "snap-port-"));
  const native = { permission: () => "granted", displays: () => [] };
  const first = new Gateway(directory, native, { ready: true });
  await first.start();
  const port = first.port;
  await first.close();
  const second = new Gateway(directory, native, { ready: true });
  await second.start();
  assert.equal(second.port, port);
  const third = new Gateway(directory, native, { ready: true });
  await third.start();
  assert.notEqual(third.port, port);
  t.after(async () => {
    await second.close();
    await third.close();
    fs.rmSync(directory, { recursive: true, force: true });
  });
});
