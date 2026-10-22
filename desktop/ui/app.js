const $ = (id) => document.getElementById(id);
let state,
  busy = false;
function notice(text, error = false, source = "action") {
  $("notice").textContent = text;
  $("notice").classList.toggle("error", error);
  $("notice").dataset.source = source;
}
function render(next) {
  state = next;
  const online = next.ready && !next.paused && !next.error && next.networks.length > 0;
  $("service-status").textContent = next.error
    ? "启动失败"
    : next.paused
      ? "手机访问已暂停"
      : !next.networks.length
        ? "电脑未联网"
        : next.ready
          ? "可以连接手机"
          : "正在启动";
  $("service-status").className =
    "pill " + (next.error ? "error" : online ? "ready" : "");
  $("qr").src = next.qr;
  $("qr-cover").hidden = online;
  $("qr-cover").textContent = next.error
    ? "启动失败"
    : next.paused
      ? "恢复访问后可扫码"
      : !next.networks.length
        ? "请先连接 Wi-Fi 或有线网络"
        : "正在启动…";
  $("code").textContent = next.code.slice(0, 3) + " " + next.code.slice(3);
  $("address").textContent = next.baseUrl;
  $("expiry").textContent =
    Math.max(1, Math.ceil((next.expiresAt - Date.now()) / 60000)) +
    " 分钟内有效";
  const networkKey = JSON.stringify(next.networks);
  if ($("networks").dataset.key !== networkKey) {
    $("networks").replaceChildren(
      ...next.networks.map((item) => {
        const option = document.createElement("option");
        option.value = item.address;
        option.textContent = item.name + " · " + item.address;
        return option;
      }),
    );
    $("networks").dataset.key = networkKey;
  }
  $("networks").value = next.selectedAddress;
  const granted = next.permission === "granted";
  $("permission-icon").textContent = granted ? "✓" : "!";
  $("permission-icon").classList.toggle("ready", granted);
  $("permission-title").textContent = granted ? "已允许截屏" : "截屏未授权";
  $("permission-hint").textContent = granted
    ? ""
    : "在系统设置中允许 Electron 录屏，然后重启。";
  $("permission").hidden = granted || next.platform !== "darwin";
  $("pause").textContent = next.paused ? "恢复手机访问" : "暂停手机访问";
  $("background-note").textContent = next.backgroundAvailable === false
    ? "关闭窗口将退出 App"
    : "关闭窗口后继续运行";
  $("device-count").textContent = next.devices.length + " 台";
  $("preview").disabled = !online;
  const devices = next.devices.map((device) => {
    const minutes = Math.floor((Date.now() - device.lastSeen) / 60000);
    const activity = next.paused
      ? "访问已暂停"
      : minutes < 1
        ? "刚刚访问"
        : minutes < 60
          ? minutes + " 分钟前访问"
          : minutes < 1440
            ? Math.floor(minutes / 60) + " 小时前访问"
            : Math.floor(minutes / 1440) + " 天前访问";
    return { ...device, activity };
  });
  if ($("devices").dataset.key !== JSON.stringify(devices)) {
    $("devices").replaceChildren();
    if (!next.devices.length) {
      const p = document.createElement("p");
      p.className = "empty";
      p.textContent = "等待手机连接";
      $("devices").append(p);
    }
    for (const device of devices) {
      const row = document.createElement("div");
      row.className = "device";
      const icon = document.createElement("span");
      icon.className = "device-icon";
      icon.innerHTML =
        '<svg viewBox="0 0 20 28"><rect x="3" y="1" width="14" height="26" rx="3"/><path d="M8 4h4m-3 19h2"/></svg>';
      const label = document.createElement("div");
      label.className = "device-label";
      const name = document.createElement("span");
      name.textContent = device.name;
      const status = document.createElement("small");
      status.textContent = device.activity;
      const remove = document.createElement("button");
      remove.className = "text-button";
      remove.textContent = "取消配对";
      remove.onclick = () => action(async () => {
        const result = await window.snap.revoke(device.id);
        notice("已取消配对。这台设备需重新扫码连接。");
        return result;
      });
      label.append(name, status);
      row.append(icon, label, remove);
      $("devices").append(row);
    }
    $("devices").dataset.key = JSON.stringify(devices);
  }
  if (next.error) notice(next.error, true, "system");
  else if (!next.networks.length)
    notice("请先连接 Wi-Fi 或有线网络。", true, "system");
  else if ($("notice").dataset.source === "system") notice("");
}
async function action(fn) {
  if (busy) return;
  busy = true;
  try {
    const result = await fn();
    if (result?.networks) render(result);
  } catch (error) {
    notice(
      error.message.replace(/^Error invoking remote method .*?: /, ""),
      true,
    );
  } finally {
    busy = false;
  }
}
$("copy").onclick = () =>
  action(async () => {
    await window.snap.copyAddress();
    notice("连接地址已复制。手机浏览器打开后，输入连接码即可。");
  });
$("refresh-code").onclick = () => action(async () => {
  const result = await window.snap.refreshCode();
  notice("连接码已更新，已配对设备不受影响。");
  return result;
});
$("networks").onchange = () =>
  action(() => window.snap.selectNetwork($("networks").value));
$("pause").onclick = () => action(() => window.snap.pause(!state.paused));
$("permission").onclick = () => action(() => window.snap.permission());
$("test").onclick = () =>
  action(async () => {
    $("test").disabled = true;
    $("test").textContent = "检查中…";
    try {
      const result = await window.snap.testCapture();
      notice(
        "截屏成功 · " +
          result.width +
          " × " +
          result.height +
          "，可以在手机上开始使用。",
      );
    } finally {
      $("test").disabled = false;
      $("test").textContent = "检查截屏";
    }
  });
$("preview").onclick = () => action(() => window.snap.openPhonePreview());
$("quit").onclick = () => window.snap.quit();
async function refresh() {
  try {
    render(await window.snap.state());
  } catch (error) {
    notice(error.message, true);
  }
}
refresh();
setInterval(refresh, 2500);
