const { existsSync } = require("node:fs");
const { spawnSync } = require("node:child_process");
const path = require("node:path");
const root = path.resolve(__dirname, "..");
const windows = process.platform === "win32";
const python = path.join(
  root,
  ".runtime",
  windows ? "Scripts/python.exe" : "bin/python",
);
const hasUv = !spawnSync("uv", ["--version"], { stdio: "ignore" }).error;
function run(command, args) {
  const result = spawnSync(command, args, {
    cwd: root,
    stdio: "inherit",
    shell: false,
  });
  if (result.error || result.status !== 0) {
    console.error(
      result.error?.message || "安装失败，请检查网络与 Python 3.12 环境。",
    );
    process.exit(1);
  }
}
if (!existsSync(python)) {
  if (hasUv) run("uv", ["venv", ".runtime", "--python", "3.12"]);
  else {
    const executable =
      process.env.SNAP_SETUP_PYTHON || (windows ? "py" : "python3.12");
    run(executable, [
      ...(windows && !process.env.SNAP_SETUP_PYTHON ? ["-3.12"] : []),
      "-m",
      "venv",
      ".runtime",
    ]);
  }
}
run(python, [
  "-c",
  'import sys; assert sys.version_info[:2] == (3, 12), "请使用 Python 3.12 创建 .runtime"',
]);
// Install the official slim dependency set, then the unmodified wheel without
// its full/RAG extras. Both sources are pinned to the same upstream release.
const install = hasUv
  ? (args) => run("uv", ["pip", "install", "--python", python, ...args])
  : (args) => run(python, ["-m", "pip", "install", ...args]);
install(["-r", "runtime/requirements.lock"]);
install(["--no-deps", "open-webui==0.12.2"]);
run(python, [
  "-c",
  'from importlib.metadata import version; assert version("open-webui") == "0.12.2"; import open_webui, psutil',
]);
console.log("准备完成。运行 npm start 打开 Snap-Solver。");
