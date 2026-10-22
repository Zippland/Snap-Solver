const form = document.getElementById("pair-form");
const status = document.getElementById("pair-error");
const button = document.getElementById("connect");
let pending = false;
async function connect(credential) {
  if (pending) return;
  pending = true;
  button.disabled = true;
  button.textContent = "正在连接…";
  status.textContent = "";
  const ua = navigator.userAgent;
  const name = /iPhone/.test(ua)
    ? "iPhone"
    : /iPad/.test(ua)
      ? "iPad"
      : /Android/.test(ua)
        ? "Android 手机"
        : "浏览器";
  try {
    const response = await fetch("/snap/api/pair", {
      signal: AbortSignal.timeout(15000),
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Snap-Client": "mobile",
      },
      body: JSON.stringify({ credential, name }),
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error);
    location.replace("/");
  } catch (error) {
    status.textContent = error instanceof TypeError || error.name === "TimeoutError"
      ? "连接中断，请确认电脑 App 正在运行"
      : error.message || "无法连接，请重新扫码";
  } finally {
    pending = false;
    button.disabled = false;
    button.textContent = "连接电脑";
  }
}
form.addEventListener("submit", (event) => {
  event.preventDefault();
  connect(document.getElementById("credential").value.trim());
});
function connectFromLink() {
  const token = new URLSearchParams(location.hash.slice(1)).get("token");
  if (token) {
    history.replaceState(null, "", location.pathname);
    connect(token);
  }
}
window.addEventListener("hashchange", connectFromLink);
connectFromLink();
