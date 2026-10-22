const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const root = path.resolve(__dirname, "..");
function walk(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((item) => {
    const file = path.join(dir, item.name);
    return item.isDirectory() ? walk(file) : [file];
  });
}
for (const directory of ["desktop", "web", "scripts", "tests"]) {
  for (const file of walk(path.join(root, directory)).filter((file) =>
    /\.(cjs|js)$/.test(file),
  )) {
    const result = spawnSync(process.execPath, ["--check", file], {
      stdio: "inherit",
    });
    if (result.status !== 0) process.exit(result.status || 1);
  }
}
const catalog = require("../config/providers.json");
const ids = new Set();
for (const provider of catalog.providers) {
  if (
    ids.has(provider.id) ||
    !provider.models.length ||
    new URL(provider.baseUrl).protocol !== "https:"
  )
    throw new Error("模型目录格式错误");
  ids.add(provider.id);
}
const scope = require("../config/product-scope.json");
if (!Number.isSafeInteger(scope.maxImages) || scope.maxImages < 1)
  throw new Error("附件上限必须是正整数");
const upstream = path.join(
  root,
  ".runtime",
  process.platform === "win32"
    ? "Lib/site-packages/open_webui/config.py"
    : "lib/python3.12/site-packages/open_webui/config.py",
);
if (fs.existsSync(upstream)) {
  const source = fs.readFileSync(upstream, "utf8");
  for (const key of Object.keys(scope.runtime)) {
    if (!source.includes("'" + key + "':"))
      throw new Error("未知的上游功能开关：" + key);
  }
}
console.log("JavaScript 语法、模型目录与产品开关检查通过。");
