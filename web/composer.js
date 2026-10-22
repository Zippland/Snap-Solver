/* Versioned DOM adapter for the unmodified Open WebUI 0.12.2 composer.
 * Read and mutate its real attachment list; never keep a second chat draft. */
export class Composer {
  constructor(say, changed) {
    this.say = say;
    this.changed = changed;
    this.busy = false;
    this.epoch = 0;
    this.maxImages = 12;
    this.nativeClick = false;
    document.addEventListener(
      "click",
      (event) => {
        const target = event.target.closest?.("button,a");
        if (
          target?.matches(
            "#new-chat-button,#sidebar-new-chat-button,a[href='/']",
          )
        ) {
          this.epoch++;
          this.changed();
        }
        if (this.busy && target?.matches("#send-message-button")) {
          event.preventDefault();
          event.stopImmediatePropagation();
          this.say("图片正在加入，稍等一下");
        }
      },
      true,
    );
    document.addEventListener(
      "keydown",
      (event) => {
        if (
          this.busy &&
          event.key === "Enter" &&
          !event.shiftKey &&
          !event.isComposing &&
          event.target.closest?.("#chat-input")
        ) {
          event.preventDefault();
          event.stopImmediatePropagation();
        }
      },
      true,
    );
    window.addEventListener("popstate", () => {
      this.epoch++;
      this.changed();
    });
  }
  container() {
    return document.querySelector("#message-input-container");
  }
  entries() {
    return [
      ...(this.container()?.querySelectorAll(
        'button[aria-label="移除文件"],button[aria-label="Remove file"]',
      ) || []),
    ].flatMap((remove) => {
      const row = remove.closest(".group");
      const image = row?.querySelector("img");
      const preview = image?.closest("button");
      return preview && image.getAttribute("src")
        ? [{ key: image.src, image, row, remove, preview }]
        : [];
    });
  }
  context() {
    return {
      editor: document.querySelector("#chat-input"),
      container: this.container(),
      path: location.pathname,
      epoch: this.epoch,
    };
  }
  isCurrent(context) {
    return (
      context?.editor &&
      context.editor === document.querySelector("#chat-input") &&
      context.container === this.container() &&
      context.path === location.pathname &&
      context.epoch === this.epoch
    );
  }
  assertCurrent(context) {
    if (!this.isCurrent(context))
      throw new Error("对话已切换，请在当前对话重新添加图片");
  }
  async run(action) {
    if (this.busy) return;
    this.busy = true;
    this.changed();
    try {
      return await action();
    } catch (error) {
      this.say(error.message || "图片操作失败，请重试", true);
    } finally {
      this.busy = false;
      this.changed();
    }
  }
  async append(blob, context, name = "Snap-Solver-" + Date.now() + ".jpg") {
    this.assertCurrent(context);
    const before = new Set(this.entries().map((entry) => entry.key));
    if (before.size >= this.maxImages)
      throw new Error(
        "每次最多添加 " + this.maxImages + " 张图片，请先发送或移除一些",
      );
    const transfer = new DataTransfer();
    transfer.items.add(
      new File([blob], name, { type: blob.type || "image/jpeg" }),
    );
    context.editor.dispatchEvent(
      new ClipboardEvent("paste", {
        bubbles: true,
        cancelable: true,
        clipboardData: transfer,
      }),
    );
    const deadline = Date.now() + 15000;
    while (Date.now() < deadline) {
      this.assertCurrent(context);
      const entry = this.entries().find((item) => !before.has(item.key));
      if (entry) {
        entry.row.classList.add("snap-just-added");
        entry.row.scrollIntoView({ block: "nearest", inline: "nearest" });
        setTimeout(() => entry.row.classList.remove("snap-just-added"), 800);
        return entry;
      }
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    throw new Error("图片尚未加入，请查看附件并确认模型支持图片，再重试");
  }
  remove(key, context) {
    this.assertCurrent(context);
    const entry = this.entries().find((item) => item.key === key);
    if (!entry) throw new Error("这张图片已不在当前草稿中");
    this.nativeClick = true;
    try {
      entry.remove.click();
    } finally {
      this.nativeClick = false;
    }
  }
  async blob(entry) {
    const url = new URL(entry.key, location.href);
    if (
      !["data:", "blob:"].includes(url.protocol) &&
      url.origin !== location.origin
    )
      throw new Error("无法恢复这张外部图片");
    const response = await fetch(url, {
      signal: AbortSignal.timeout(10000),
      ...(url.origin === location.origin
        ? {
            headers: {
              Authorization: "Bearer " + localStorage.getItem("token"),
            },
          }
        : {}),
    });
    if (!response.ok) throw new Error("图片读取失败，原图已保留");
    return response.blob();
  }
}
