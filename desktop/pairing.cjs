const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const COOKIE = "snap_device";
const hash = (value) => crypto.createHash("sha256").update(value).digest("hex");
const safeEqual = (a, b) => {
  if (typeof a !== "string" || typeof b !== "string") return false;
  const left = Buffer.from(a),
    right = Buffer.from(b);
  return left.length === right.length && crypto.timingSafeEqual(left, right);
};

function writeJson(file, data) {
  fs.mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });
  const temporary = file + "." + crypto.randomBytes(6).toString("hex") + ".tmp";
  fs.writeFileSync(temporary, JSON.stringify(data, null, 2), { mode: 0o600 });
  fs.renameSync(temporary, file);
}
function readJson(file, fallback) {
  if (!fs.existsSync(file)) return fallback;
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    throw new Error(
      "无法读取本地配置文件：" + path.basename(file) + "。请修复该文件后重启。",
    );
  }
}
function cookieToken(header = "") {
  return (
    header
      .split(";")
      .map((item) => item.trim())
      .find((item) => item.startsWith(COOKIE + "="))
      ?.slice(COOKIE.length + 1) || ""
  );
}

class Pairing {
  constructor(directory, now = Date.now) {
    this.file = path.join(directory, "devices.json");
    this.now = now;
    this.devices = readJson(this.file, []).filter(
      (item) => now() - item.lastSeen < 30 * 86400000,
    );
    this.attempts = new Map();
    this.rotate();
  }
  rotate() {
    this.token = crypto.randomBytes(32).toString("base64url");
    this.code = crypto.randomInt(1000000).toString().padStart(6, "0");
    this.expiresAt = this.now() + 10 * 60000;
    return this.info();
  }
  info() {
    if (this.now() >= this.expiresAt) return this.rotate();
    return { token: this.token, code: this.code, expiresAt: this.expiresAt };
  }
  pair(credential, name, address) {
    if (typeof credential !== "string" || credential.length > 100)
      throw new Error("连接码格式不正确");
    for (const [id, limit] of [
      [address, 8],
      ["*", 40],
    ]) {
      const attempts = (this.attempts.get(id) || []).filter(
        (time) => this.now() - time < 60000,
      );
      this.attempts.set(id, attempts);
      if (attempts.length >= limit)
        throw new Error("尝试次数过多，请一分钟后再试");
    }
    if (
      this.now() >= this.expiresAt ||
      !(safeEqual(credential, this.token) || safeEqual(credential, this.code))
    ) {
      this.attempts.get(address).push(this.now());
      this.attempts.get("*").push(this.now());
      throw new Error("连接码不正确或已过期，请查看电脑 App");
    }
    this.devices = this.devices.filter(
      (item) => this.now() - item.lastSeen < 30 * 86400000,
    );
    if (this.devices.length >= 8)
      throw new Error("最多连接 8 台设备，请先在电脑 App 移除旧设备");
    const token = crypto.randomBytes(32).toString("base64url");
    this.devices.push({
      id: crypto.randomUUID(),
      tokenHash: hash(token),
      name: String(name || "手机浏览器").slice(0, 60),
      createdAt: this.now(),
      lastSeen: this.now(),
    });
    writeJson(this.file, this.devices);
    return token;
  }
  authenticate(header) {
    const token = cookieToken(header);
    if (!token || token.length > 100) return null;
    const item = this.devices.find((item) =>
      safeEqual(item.tokenHash, hash(token)),
    );
    if (!item || this.now() - item.lastSeen >= 30 * 86400000) return null;
    if (this.now() - item.lastSeen > 15000) {
      item.lastSeen = this.now();
      writeJson(this.file, this.devices);
    }
    return item;
  }
  list() {
    return this.devices.map(({ tokenHash, ...rest }) => rest);
  }
  revoke(id) {
    this.devices = this.devices.filter((item) => item.id !== id);
    writeJson(this.file, this.devices);
  }
}
module.exports = { Pairing, COOKIE, cookieToken, writeJson, readJson };
