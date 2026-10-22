const title = document.getElementById("connection-state");
const help = document.getElementById("connection-help");
const retry = document.getElementById("connection-retry");
async function checkConnection(resume = false) {
  retry.disabled = true;
  retry.textContent = "检查中…";
  try {
    const response = await fetch("/snap/api/status", { signal: AbortSignal.timeout(10000) });
    if (response.status === 401) {
      location.replace("/snap/pair");
      return;
    }
    if (!response.ok) throw new Error("connection");
    const state = await response.json();
    if (state.ready && !state.paused && !state.error) {
      // Keep the original conversation/settings URL and all upstream drafts.
      if (resume) location.reload();
      else {
        title.textContent = "页面暂时无法打开";
        help.textContent = "电脑已连接，可重新尝试。";
      }
      return;
    }
    title.textContent = state.paused ? "手机访问已暂停" : state.error ? "电脑启动失败" : "电脑正在启动";
    help.textContent = state.paused
      ? "请在电脑 App 中恢复手机访问。"
      : state.error
        ? "请查看电脑 App 中的错误提示。"
        : "电脑准备好后，点下方按钮继续。";
  } catch {
    title.textContent = "电脑连接已断开";
    help.textContent = "请确认手机与电脑在同一局域网，且电脑 App 正在运行。";
  } finally {
    retry.disabled = false;
    retry.textContent = "重新检查";
  }
}
retry.onclick = () => checkConnection(true);
checkConnection();
