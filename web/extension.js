import { Composer } from "./composer.js";
import { Attachments } from "./attachments.js";
import { applyScope } from "./scope.js";
import { Layout } from "./layout.js";

/* Integration surface for Open WebUI 0.12.2. Conversation and generation stay
 * entirely in the upstream UI; this module only attaches a cropped image. */
(() => {
  if (window.__snapSolver) return;
  window.__snapSolver = true;
  let cropper,
    state,
    cropContext,
    dialog,
    image,
    currentCapture,
    lastFocus,
    hasModels,
    modelsFailed = false;
  const svg =
    '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.7" aria-hidden="true"><path d="M8 3H3v5m13-5h5v5M3 16v5h5m13-5v5h-5M8 12h8m-4-4v8"/></svg>';
  const bar = document.createElement("div");
  bar.id = "snap-toolbar";
  const capture = document.createElement("button");
  capture.id = "snap-capture";
  capture.type = "button";
  capture.innerHTML = svg + "<span>截屏</span>";
  capture.title = "添加一张电脑截图，可连续添加";
  const crop = document.createElement("button");
  crop.id = "snap-crop";
  crop.type = "button";
  crop.title = "框选截屏";
  crop.setAttribute("aria-label", "框选截屏");
  crop.innerHTML =
    '<svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><path d="M7 3v14h14M3 7h14v14"/></svg><span>框选</span>';
  const modelLink = document.createElement("a");
  modelLink.href = "/snap/models";
  modelLink.id = "snap-models";
  modelLink.title = "模型连接与设置";
  modelLink.setAttribute("aria-label", "模型连接与设置");
  modelLink.innerHTML =
    '<span>模型设置</span><span aria-hidden="true">›</span>';
  const connection = document.createElement("button");
  connection.type = "button";
  connection.id = "snap-connection";
  connection.setAttribute("aria-live", "polite");
  connection.textContent = "正在连接电脑";
  const displays = document.createElement("select");
  displays.id = "snap-display";
  displays.setAttribute("aria-label", "选择截屏屏幕");
  displays.hidden = true;
  displays.onchange = () =>
    localStorage.setItem("snap.display", displays.value);
  const upload = document.createElement("button");
  upload.type = "button";
  upload.id = "snap-upload";
  upload.title = "添加手机图片";
  upload.setAttribute("aria-label", "添加手机图片");
  upload.innerHTML =
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><rect x="3" y="4" width="18" height="16" rx="3"/><circle cx="8" cy="9" r="1.5"/><path d="m3 17 5-5 4 4 3-3 6 6"/></svg><span>手机图片</span>';
  const picker = document.createElement("input");
  picker.type = "file";
  picker.id = "snap-image-picker";
  picker.accept = "image/*";
  picker.multiple = true;
  picker.hidden = true;
  upload.onclick = () => picker.click();
  picker.onchange = async () => {
    const files = [...picker.files];
    picker.value = "";
    const context = composer.context();
    await composer.run(async () => {
      if (files.length + composer.entries().length > composer.maxImages)
        throw new Error("每次最多添加 " + composer.maxImages + " 张图片");
      for (const file of files) await composer.append(file, context, file.name);
    });
  };
  const sourceRow = document.createElement("div");
  sourceRow.className = "snap-source-row";
  const sourceLabel = document.createElement("span");
  sourceLabel.className = "snap-source-label";
  sourceLabel.textContent = "添加图片";
  const source = document.createElement("div");
  source.id = "snap-capture-source";
  source.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><rect x="3" y="4" width="18" height="13" rx="2"/><path d="M8 21h8m-4-4v4"/></svg>';
  const singleDisplay = document.createElement("span");
  singleDisplay.textContent = "电脑屏幕";
  source.append(singleDisplay, displays);
  sourceRow.append(sourceLabel, source);
  const actions = document.createElement("div");
  actions.className = "snap-toolbar-actions";
  actions.append(capture, crop, upload);
  const hint = document.createElement("div");
  hint.id = "snap-composer-hint";
  hint.hidden = true;
  const hintText = document.createElement("span");
  hintText.setAttribute("role", "status");
  const retry = document.createElement("button");
  retry.type = "button";
  retry.textContent = "重试";
  retry.onclick = async () => {
    retry.disabled = true;
    await heartbeat();
    if (state?.ready && !state.paused) await loadModels();
    retry.disabled = false;
  };
  hint.append(hintText, retry);
  bar.append(sourceRow, actions, hint, picker);
  const toast = document.createElement("div");
  toast.id = "snap-toast";
  toast.setAttribute("role", "status");
  toast.setAttribute("aria-live", "polite");
  document.body.append(bar, toast, connection);
  let toastTimer;
  function say(text, error = false, action) {
    clearTimeout(toastTimer);
    toast.textContent = text;
    if (action) {
      const undo = document.createElement("button");
      undo.type = "button";
      undo.id = action.id;
      undo.textContent = action.label;
      undo.onclick = action.action;
      toast.append(undo);
    }
    toast.classList.toggle("error", error);
    toast.hidden = false;
    toastTimer = setTimeout(
      () => {
        toast.hidden = true;
      },
      action ? 10000 : 4500,
    );
  }
  const composer = new Composer(say, () => refresh());
  const attachments = new Attachments(composer, say);
  const layout = new Layout();
  let refreshQueued = false;
  function refresh() {
    if (refreshQueued) return;
    refreshQueued = true;
    requestAnimationFrame(() => {
      refreshQueued = false;
      visibility();
      attachments.sync();
      layout.sync(composer.container(), document.querySelector("#chat-container nav"), connection, modelLink, hasModels);
      applyScope();
      const blocked =
        state?.paused ||
        !state?.ready ||
        state?.error ||
        !composer.context().editor ||
        composer.busy ||
        hasModels !== true;
      const full = composer.entries().length >= composer.maxImages;
      const needsPermission = state?.permission !== "granted";
      capture.disabled = crop.disabled = blocked || full || needsPermission;
      upload.disabled = blocked || full;
      displays.disabled = Boolean(blocked);
      for (const link of document.querySelectorAll('a[href="/snap/models"]'))
        link.setAttribute("aria-disabled", String(!state?.ready || Boolean(state?.paused || state?.error)));
      capture.setAttribute("aria-busy", String(composer.busy));
      const label = composer.busy
        ? "处理中"
        : composer.entries().length
          ? "继续截屏"
          : "截屏";
      if (capture.lastElementChild.textContent !== label)
        capture.lastElementChild.textContent = label;
      if (full)
        capture.title =
          "最多 " + composer.maxImages + " 张，请先发送或移除图片";
      else capture.title = "添加一张电脑截图，可连续添加";
      const reason = state?.paused
        ? "请在电脑上恢复手机访问"
        : state?.error
          ? "启动失败，请查看电脑 App"
          : !state?.ready
            ? state?.disconnected
              ? "检查同一 Wi-Fi，保持电脑 App 开启"
              : state ? "等待电脑启动" : "正在连接电脑"
            : modelsFailed
              ? "模型列表未加载"
              : hasModels === false
                ? "先连接一个模型，再添加图片"
                : hasModels === undefined
                  ? "正在读取模型…"
                  : full
                    ? "已满 " + composer.maxImages + " 张，发送或移除后再加"
                    : needsPermission
                      ? "请在电脑上开启截屏权限"
                      : "";
      hint.hidden = !reason;
      if (hintText.textContent !== reason) hintText.textContent = reason;
      retry.hidden = !(modelsFailed || state?.disconnected);
    });
  }
  async function api(url, body) {
    const response = await fetch(
      url,
      body === undefined
        ? { signal: AbortSignal.timeout(15000) }
        : {
            signal: AbortSignal.timeout(20000),
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "X-Snap-Client": "mobile",
            },
            body: JSON.stringify(body),
          },
    );
    if (response.status === 401) {
      location.replace("/snap/pair");
      throw new Error("连接已失效");
    }
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "连接失败");
    return data;
  }
  async function heartbeat() {
    try {
      state = await api("/snap/api/status");
      connection.title = state.paused
        ? "手机访问已暂停"
        : state.error
          ? "电脑启动失败"
          : !state.ready
            ? "电脑正在启动"
            : state.permission !== "granted"
              ? "截屏未授权"
              : "电脑已连接";
      connection.setAttribute("aria-label", connection.title);
      connection.classList.toggle("offline", connection.title !== "电脑已连接");
      if (connection.textContent !== connection.title)
        connection.textContent = connection.title;
      connection.onclick = () =>
        say(
          state.paused
            ? "请在电脑 App 中恢复手机访问"
            : !state.ready || state.error
              ? "请查看电脑 App 的启动状态"
              : state.permission !== "granted"
                ? "请在电脑 App 中允许屏幕录制，再重新截屏"
                : "电脑已连接 · 截图会先加入附件，发送后才交给模型",
        );
      composer.maxImages = state.maxImages || 12;
      const signature = JSON.stringify(state.displays);
      if (displays.dataset.signature !== signature) {
        displays.dataset.signature = signature;
        displays.replaceChildren(
          ...(state.displays || []).map((screen, index) => {
            const option = document.createElement("option");
            option.value = screen.id;
            option.textContent =
              "屏幕 " + (index + 1) + (screen.primary ? " · 主屏" : "");
            return option;
          }),
        );
        displays.hidden = (state.displays?.length || 0) < 2;
        singleDisplay.hidden = !displays.hidden;
        displays.value =
          localStorage.getItem("snap.display") ||
          state.displays?.find((screen) => screen.primary)?.id ||
          "";
        if (!displays.value && displays.options.length)
          displays.selectedIndex = 0;
        localStorage.setItem("snap.display", displays.value);
      }
      refresh();
    } catch {
      connection.title = "电脑连接已断开";
      connection.setAttribute("aria-label", connection.title);
      connection.classList.add("offline");
      connection.textContent = "电脑连接已断开";
      connection.onclick = () => {
        say("请确认手机与电脑在同一 Wi-Fi，且电脑 App 正在运行");
        heartbeat();
      };
      state = { ...state, ready: false, paused: false, error: "", disconnected: true };
      refresh();
    }
  }
  function loadCropper() {
    if (window.Cropper) return Promise.resolve();
    return new Promise((resolve, reject) => {
      const link = document.createElement("link");
      link.rel = "stylesheet";
      link.href = "/snap/vendor/cropper.css";
      document.head.append(link);
      const script = document.createElement("script");
      script.src = "/snap/vendor/cropper.js";
      script.onload = resolve;
      script.onerror = () => reject(new Error("裁剪组件加载失败，请刷新页面"));
      document.head.append(script);
    });
  }
  function closeCrop() {
    cropper?.destroy();
    cropper = null;
    dialog?.remove();
    dialog = null;
    document.documentElement.classList.remove("snap-cropping");
    lastFocus?.focus();
  }
  function button(text, action, className = "") {
    const element = document.createElement("button");
    element.type = "button";
    element.textContent = text;
    element.className = className;
    element.onclick = action;
    return element;
  }
  async function takeScreenshot(displayId, selectRegion = false) {
    const context = composer.context();
    await composer.run(async () => {
      if (composer.entries().length >= composer.maxImages)
        throw new Error("每次最多添加 " + composer.maxImages + " 张图片");
      const result = await api("/snap/api/capture", {
        displayId: displayId || localStorage.getItem("snap.display") || "",
      });
      composer.assertCurrent(context);
      localStorage.setItem("snap.display", result.displayId);
      displays.value = result.displayId;
      if (selectRegion) {
        await loadCropper();
        showCrop(result, context);
      } else {
        const picture = new Image();
        picture.src = result.image;
        await picture.decode();
        const canvas = document.createElement("canvas");
        canvas.width = result.width;
        canvas.height = result.height;
        canvas
          .getContext("2d")
          .drawImage(picture, 0, 0, canvas.width, canvas.height);
        await attachCanvas(canvas, context);
      }
    });
  }
  function showCrop(result, context) {
    if (dialog) closeCrop();
    currentCapture = result;
    cropContext = context;
    localStorage.setItem("snap.display", result.displayId);
    lastFocus = document.activeElement;
    dialog = document.createElement("div");
    dialog.id = "snap-crop-dialog";
    dialog.setAttribute("role", "dialog");
    dialog.setAttribute("aria-modal", "true");
    dialog.setAttribute("aria-label", "框选电脑屏幕");
    const header = document.createElement("div");
    header.className = "snap-crop-header";
    const title = document.createElement("div");
    title.innerHTML =
      "<strong>框选问题</strong><small>拖动边角 · 双指缩放</small>";
    header.append(title, button("取消", closeCrop, "snap-ghost"));
    const controls = document.createElement("div");
    controls.className = "snap-crop-controls";
    const displays = document.createElement("select");
    displays.setAttribute("aria-label", "选择电脑屏幕");
    for (const display of state?.displays || []) {
      const option = document.createElement("option");
      option.value = display.id;
      option.textContent = display.name + (display.primary ? " · 主屏" : "");
      displays.append(option);
    }
    displays.value = result.displayId;
    displays.onchange = () => takeScreenshot(displays.value, true);
    controls.append(
      displays,
      button(
        "重新截屏",
        () => takeScreenshot(displays.value, true),
        "snap-ghost",
      ),
    );
    const area = document.createElement("div");
    area.className = "snap-crop-stage";
    image = document.createElement("img");
    image.alt = "电脑截图，拖动裁剪框选择区域";
    image.src = result.image;
    area.append(image);
    const footer = document.createElement("div");
    footer.className = "snap-crop-footer";
    const tools = document.createElement("div");
    tools.className = "snap-crop-tools";
    tools.append(
      button("缩小", () => cropper?.zoom(-0.15), "snap-ghost"),
      button("放大", () => cropper?.zoom(0.15), "snap-ghost"),
      button("重置选区", () => cropper?.reset(), "snap-ghost"),
    );
    const attach = button("添加选区到对话", attachCrop, "snap-primary");
    attach.id = "snap-attach";
    footer.append(tools, attach);
    dialog.append(header, controls, area, footer);
    document.body.append(dialog);
    document.documentElement.classList.add("snap-cropping");
    let remembered;
    try {
      remembered = JSON.parse(
        localStorage.getItem("snap.crop." + result.displayId),
      );
    } catch {
      /* optional preference */
    }
    cropper = new window.Cropper(image, {
      viewMode: 1,
      dragMode: "move",
      autoCropArea: 0.8,
      background: false,
      guides: true,
      responsive: true,
      zoomOnWheel: true,
      checkOrientation: false,
      ready() {
        if (
          remembered &&
          remembered.width === result.width &&
          remembered.height === result.height
        )
          cropper.setData(remembered.data);
      },
    });
    attach.focus();
    dialog.addEventListener("keydown", (event) => {
      if (event.key === "Escape") closeCrop();
      if (event.key === "Tab") {
        const items = [...dialog.querySelectorAll("button,select")].filter(
          (item) => !item.disabled,
        );
        const first = items[0],
          last = items[items.length - 1];
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first.focus();
        }
      }
    });
  }
  async function attachCrop() {
    if (!cropper) return;
    if (!composer.isCurrent(cropContext)) {
      say("请先返回一个对话，再添加截图。", true);
      return;
    }
    const data = cropper.getData(true);
    if (data.width < 24 || data.height < 24) {
      say("选区太小，请扩大一些。", true);
      return;
    }
    const canvas = cropper.getCroppedCanvas({
      maxWidth: 2560,
      maxHeight: 2560,
      fillColor: "#fff",
    });
    if (!canvas) {
      say("无法生成截图，请重试。", true);
      return;
    }
    const attach = document.querySelector("#snap-attach");
    if (composer.busy) return;
    attach.disabled = true;
    attach.textContent = "正在添加…";
    await composer.run(async () => {
      await attachCanvas(canvas, cropContext);
      localStorage.setItem(
        "snap.crop." + currentCapture.displayId,
        JSON.stringify({
          width: currentCapture.width,
          height: currentCapture.height,
          data,
        }),
      );
      closeCrop();
    });
    attach.disabled = false;
    attach.textContent = "添加选区到对话";
  }
  async function attachCanvas(canvas, context) {
    const blob = await new Promise((resolve) =>
      canvas.toBlob(resolve, "image/jpeg", 0.93),
    );
    if (!blob) throw new Error("图片处理失败，请重新截屏");
    return composer.append(blob, context);
  }
  capture.onclick = () => takeScreenshot();
  crop.onclick = () => takeScreenshot(undefined, true);
  // Upstream SPA navigation does not reload this extension.
  function visibility() {
    const container = document.querySelector("#message-input-container");
    bar.hidden = !container;
    connection.hidden = !container;
    if (container && bar.parentElement !== container) container.prepend(bar);
  }
  new MutationObserver(refresh).observe(document.body, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ["src"],
  });
  document.addEventListener(
    "click",
    (event) => {
      if (event.target.closest?.('a[href="/snap/models"][aria-disabled="true"]')) {
        event.preventDefault();
        event.stopImmediatePropagation();
        connection.click();
      }
      if (event.target.closest?.("#send-message-button") && !composer.busy)
        attachments.clearUndo();
    },
    true,
  );
  heartbeat();
  refresh();
  setInterval(heartbeat, 12000);
  async function loadModels() {
    try {
      const data = await api("/snap/api/available-models");
      hasModels = data.available;
      modelsFailed = false;
      modelLink.firstElementChild.textContent = hasModels ? "模型设置" : "连接模型";
      modelLink.classList.toggle("needs-setup", !hasModels);
    } catch {
      modelsFailed = true;
    }
    refresh();
  }
  loadModels();
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) heartbeat();
  });
})();
