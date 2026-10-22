const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { Pairing, COOKIE } = require("../desktop/pairing.cjs");
function fixture(t) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "snap-pair-"));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  let now = Date.now();
  const pairing = new Pairing(directory, () => now);
  return {
    pairing,
    directory,
    advance: (ms) => {
      now += ms;
    },
  };
}
test("二维码配对只持久化哈希，重启可恢复，移除后立即失效", (t) => {
  const { pairing, directory } = fixture(t);
  const token = pairing.pair(pairing.info().token, "手机", "127.0.0.1");
  const cookie = COOKIE + "=" + token;
  assert.equal(pairing.authenticate(cookie).name, "手机");
  assert.equal(
    fs
      .readFileSync(path.join(directory, "devices.json"), "utf8")
      .includes(token),
    false,
  );
  const restarted = new Pairing(directory);
  const device = restarted.authenticate(cookie);
  assert.ok(device);
  restarted.revoke(device.id);
  assert.equal(restarted.authenticate(cookie), null);
});
test("刷新连接码不踢出现有设备，旧码与过期码不可使用", (t) => {
  const { pairing, advance } = fixture(t);
  const old = pairing.info();
  const token = pairing.pair(old.code, "手机", "a");
  pairing.rotate();
  assert.throws(() => pairing.pair(old.token, "未知设备", "b"), /不正确/);
  assert.ok(pairing.authenticate(COOKIE + "=" + token));
  const expired = pairing.info().token;
  advance(600001);
  assert.throws(() => pairing.pair(expired, "手机", "c"), /过期/);
});
test("错误尝试受限，设备登录也会过期", (t) => {
  const { pairing, advance } = fixture(t);
  const token = pairing.pair(pairing.code, "手机", "a");
  for (let i = 0; i < 8; i++)
    assert.throws(() => pairing.pair("wrong", "", "b"));
  assert.throws(() => pairing.pair(pairing.code, "", "b"), /次数过多/);
  advance(60001);
  assert.ok(pairing.pair(pairing.info().code, "手机二", "b"));
  advance(30 * 86400000 + 1);
  assert.equal(pairing.authenticate(COOKIE + "=" + token), null);
});
test("非 ASCII 连接码不能使常量时间比较抛出长度异常", (t) => {
  const { pairing } = fixture(t);
  assert.throws(
    () => pairing.pair("你好你好你好", "手机", "a"),
    /连接码不正确/,
  );
});
