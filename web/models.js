const $ = (id) => document.getElementById(id);
let providers = [],
  selected,
  saving = false;
const initials = {
  openai: "O",
  anthropic: "A",
  google: "G",
  alibaba: "千",
  doubao: "豆",
  moonshot: "K",
};
function choose(provider) {
  selected = provider;
  $("provider-name").textContent = provider.name;
  $("model-list").replaceChildren(
    ...provider.models.map((model) => {
      const line = document.createElement("div");
      line.textContent = model;
      return line;
    }),
  );
  $("api-key").value = "";
  $("base-url").value = provider.baseUrl;
  $("api-key").placeholder = provider.configured
    ? "已保存 · 留空保留"
    : "粘贴你的 API Key";
  $("api-key").required = !provider.configured;
  $("key-note").textContent = provider.configured
    ? "填写新密钥可替换已有密钥"
    : "密钥仅保存在电脑";
  $("remove").hidden = !provider.configured;
  $("save-error").textContent = "";
  $("provider-dialog").querySelector("details").open = false;
  $("provider-dialog").showModal();
}
async function save(remove = false) {
  if (saving) return;
  saving = true;
  $("save").disabled = true;
  $("remove").disabled = true;
  $("close-provider").disabled = true;
  $("save").textContent = remove ? "正在移除…" : "正在保存…";
  $("save-error").textContent = "";
  try {
    const response = await fetch("/snap/api/providers/" + selected.id, {
      signal: AbortSignal.timeout(20000),
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Snap-Client": "mobile",
      },
      body: JSON.stringify({
        apiKey: remove ? "" : $("api-key").value.trim(),
        baseUrl: $("base-url").value.trim(),
        remove,
      }),
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error);
    location.assign("/");
  } catch (error) {
    $("save-error").textContent = error instanceof TypeError || error.name === "TimeoutError"
      ? "未确认保存结果，请检查电脑连接后重新打开设置"
      : error.message;
  } finally {
    saving = false;
    $("save").disabled = false;
    $("remove").disabled = false;
    $("close-provider").disabled = false;
    $("save").textContent = "保存并返回";
  }
}
$("provider-form").onsubmit = (event) => {
  event.preventDefault();
  save();
};
$("close-provider").onclick = () => $("provider-dialog").close();
$("provider-dialog").addEventListener("cancel", (event) => {
  if (saving) event.preventDefault();
});
$("remove").onclick = () => {
  if (confirm("移除这家服务的密钥？聊天记录会保留。")) save(true);
};
fetch("/snap/api/providers", { signal: AbortSignal.timeout(15000) })
  .then(async (response) => {
    if (response.status === 401) {
      location.replace("/snap/pair");
      return;
    }
    const data = await response.json();
    if (!response.ok) throw new Error(data.error);
    providers = data.providers;
    for (const provider of providers) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "provider-button";
      button.dataset.id = provider.id;
      const mark = document.createElement("span");
      mark.className = "provider-mark";
      mark.textContent = initials[provider.id];
      const title = document.createElement("span");
      title.textContent = provider.name;
      const note = document.createElement("small");
      note.textContent = provider.configured ? "密钥已存" : "添加密钥";
      button.setAttribute("aria-label", provider.name + " · " + note.textContent);
      button.classList.toggle("configured", provider.configured);
      button.append(mark, title, note);
      button.onclick = () => choose(provider);
      $("providers").append(button);
    }
    $("verified").textContent = "目录更新于 " + data.verifiedAt;
    $("message").textContent = "";
  })
  .catch((error) => {
    $("message").textContent = error instanceof TypeError || error.name === "TimeoutError"
      ? "无法读取模型，请检查电脑连接后刷新"
      : error.message;
  });
