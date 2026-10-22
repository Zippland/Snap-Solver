export class Attachments {
  constructor(composer, say) {
    this.composer = composer;
    this.say = say;
    this.undo = null;
    this.header = document.createElement("div");
    this.header.id = "snap-attachment-heading";
    this.header.innerHTML =
      '<span role="status" aria-live="polite"></span><button type="button" aria-label="清空待发送图片">清空</button>';
    this.header.querySelector("button").onclick = () =>
      this.remove(composer.entries());
    document.addEventListener(
      "click",
      (event) => {
        if (composer.nativeClick) return;
        const entry = composer
          .entries()
          .find(
            (item) =>
              item.preview.contains(event.target) ||
              item.remove.contains(event.target),
          );
        if (!entry) return;
        event.preventDefault();
        event.stopImmediatePropagation();
        if (composer.busy) return;
        if (entry.remove.contains(event.target)) this.remove([entry]);
        else this.preview(entry.key);
      },
      true,
    );
  }
  sync() {
    const { composer } = this;
    const entries = composer.entries();
    entries.forEach((entry, index) => {
      entry.row.classList.add("snap-attachment");
      if (entry.row.dataset.snapIndex !== String(index + 1))
        entry.row.dataset.snapIndex = index + 1;
      entry.preview.title = "预览第 " + (index + 1) + " 张图片";
      entry.remove.title = "移除第 " + (index + 1) + " 张图片";
    });
    const list = entries[0]?.row.parentElement;
    if (list) {
      list.classList.add("snap-attachment-list");
      if (this.header.nextElementSibling !== list) list.before(this.header);
      const count = entries.length + " 张待发送";
      if (this.header.firstElementChild.textContent !== count)
        this.header.firstElementChild.textContent = count;
      this.header.lastElementChild.disabled = composer.busy;
    } else this.header.remove();
    if (this.undo && !composer.isCurrent(this.undo.context)) this.clearUndo();
    if (
      this.dialog &&
      (!composer.isCurrent(this.previewContext) ||
        !entries.some((entry) => entry.key === this.previewKey))
    )
      this.closePreview();
    composer.container()?.classList.toggle("snap-busy", composer.busy);
  }
  clearUndo() {
    clearTimeout(this.undoTimer);
    this.undo = null;
    document.querySelector("#snap-undo")?.remove();
  }
  async remove(entries) {
    if (!entries.length) return;
    const context = this.composer.context();
    await this.composer.run(async () => {
      // Keep the original files until all recovery copies have been read.
      const blobs = await Promise.all(
        entries.map((entry) => this.composer.blob(entry)),
      );
      this.composer.assertCurrent(context);
      // Svelte updates the unkeyed list on its next tick. Remove descending
      // indices so one synchronous removal cannot shift the next handler.
      for (const entry of [...entries].reverse())
        this.composer.remove(entry.key, context);
      this.closePreview();
      this.clearUndo();
      this.undo = { blobs, context };
      this.say("已移除 " + entries.length + " 张图片", false, {
        label: "撤销",
        id: "snap-undo",
        action: () => this.restore(),
      });
      this.undoTimer = setTimeout(() => this.clearUndo(), 10000);
    });
  }
  async restore() {
    const undo = this.undo;
    if (!undo) return;
    await this.composer.run(async () => {
      this.composer.assertCurrent(undo.context);
      if (
        this.composer.entries().length + undo.blobs.length >
        this.composer.maxImages
      )
        throw new Error("图片数量已达上限，请先移除一些再撤销");
      // Consume one at a time so a failed upload cannot duplicate restored files.
      let count = 0;
      while (undo.blobs.length) {
        await this.composer.append(undo.blobs[0], undo.context);
        undo.blobs.shift();
        count++;
      }
      this.clearUndo();
      this.say("已将 " + count + " 张图片恢复到末尾");
    });
  }
  closePreview() {
    this.dialog?.close();
    this.dialog?.remove();
    this.dialog = null;
  }
  preview(key) {
    const entries = this.composer.entries();
    let index = entries.findIndex((entry) => entry.key === key);
    if (index < 0) return;
    this.closePreview();
    this.previewContext = this.composer.context();
    this.previewKey = key;
    const dialog = document.createElement("dialog");
    this.dialog = dialog;
    dialog.id = "snap-preview";
    dialog.setAttribute("aria-label", "待发送图片预览");
    dialog.innerHTML =
      '<header><button type="button" data-action="close" aria-label="关闭图片预览">返回</button><span aria-live="polite"></span><button type="button" data-action="remove" aria-label="移除当前图片">移除</button></header><div class="snap-preview-stage"><img alt="待发送图片" /></div><footer><button type="button" data-action="previous" aria-label="上一张图片">← 上一张</button><button type="button" data-action="zoom" aria-label="放大图片">放大</button><button type="button" data-action="next" aria-label="下一张图片">下一张 →</button></footer>';
    const picture = dialog.querySelector("img");
    const stage = dialog.querySelector(".snap-preview-stage");
    const render = () => {
      const current = this.composer.entries();
      index = Math.max(0, Math.min(index, current.length - 1));
      this.previewKey = current[index].key;
      picture.src = current[index].key;
      picture.alt = "第 " + (index + 1) + " 张待发送图片";
      stage.classList.remove("zoomed");
      dialog.querySelector('[data-action="zoom"]').textContent = "放大";
      dialog.querySelector('[data-action="zoom"]').setAttribute("aria-label", "放大图片");
      dialog.querySelector("header span").textContent =
        index + 1 + " / " + current.length;
      dialog.querySelector('[data-action="previous"]').disabled = index === 0;
      dialog.querySelector('[data-action="next"]').disabled =
        index === current.length - 1;
    };
    const zoom = () => {
      const enlarged = stage.classList.toggle("zoomed");
      dialog.querySelector('[data-action="zoom"]').textContent = enlarged
        ? "适合屏幕"
        : "放大";
      dialog.querySelector('[data-action="zoom"]').setAttribute("aria-label", enlarged ? "适合屏幕" : "放大图片");
    };
    dialog.querySelector('[data-action="close"]').onclick = () =>
      this.closePreview();
    dialog.querySelector('[data-action="zoom"]').onclick = zoom;
    picture.ondblclick = zoom;
    const move = (direction) => {
      index += direction;
      render();
    };
    dialog.querySelector('[data-action="previous"]').onclick = () => move(-1);
    dialog.querySelector('[data-action="next"]').onclick = () => move(1);
    dialog.querySelector('[data-action="remove"]').onclick = () =>
      this.remove(
        this.composer
          .entries()
          .filter((entry) => entry.key === this.previewKey),
      );
    dialog.addEventListener("keydown", (event) => {
      if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
        event.preventDefault();
        move(event.key === "ArrowLeft" ? -1 : 1);
      }
    });
    let start;
    stage.addEventListener(
      "touchstart",
      (event) => {
        start = event.touches.length === 1 ? event.touches[0] : null;
      },
      { passive: true },
    );
    stage.addEventListener(
      "touchend",
      (event) => {
        const end = event.changedTouches[0];
        if (
          start &&
          !stage.classList.contains("zoomed") &&
          Math.abs(end.clientX - start.clientX) > 60 &&
          Math.abs(end.clientY - start.clientY) < 60
        )
          move(end.clientX < start.clientX ? 1 : -1);
        start = null;
      },
      { passive: true },
    );
    dialog.oncancel = () => this.closePreview();
    document.body.append(dialog);
    render();
    dialog.showModal();
  }
}
