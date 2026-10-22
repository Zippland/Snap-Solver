/* Layout adapter for the pinned Open WebUI 0.12.2 DOM. No chat state lives here.
 * Mark native nodes, so Svelte still owns their lifecycle and event handlers. */
export class Layout {
  constructor() {
    // Mobile keyboards can resize only the visual viewport. Follow its height
    // without fighting pinch zoom; native editor/scroll behavior remains intact.
    const viewport = window.visualViewport;
    const resize = () => {
      if (viewport && Math.abs(viewport.scale - 1) > 0.01) return;
      const height = viewport?.height || window.innerHeight;
      document.documentElement.style.setProperty("--snap-viewport-height", height + "px");
      document.documentElement.classList.toggle("snap-short-viewport", height <= 620);
    };
    viewport?.addEventListener("resize", resize, { passive: true });
    window.addEventListener("resize", resize, { passive: true });
    resize();
    this.welcome = document.createElement("section");
    this.welcome.id = "snap-welcome";
    this.welcome.innerHTML = `
      <div class="snap-paper-stack" aria-hidden="true">
        <div class="snap-paper-back"></div>
        <div class="snap-paper-front">
          <div class="snap-paper-top"><i></i><i></i><i></i></div>
          <svg viewBox="0 0 140 82" fill="none"><path d="M29 60h80L29 15v45Z" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/><path d="M29 49h11v11" stroke="currentColor" stroke-width="1.5"/><path d="M116 22h10m-5-5v10" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>
          <div class="snap-paper-lines"><i></i><i></i></div>
        </div>
        <span class="snap-paper-plus">+</span>
      </div>
      <h1>从一张截图开始</h1>
      <p>连续截屏，放在一起问。</p>`;
    this.context = document.createElement("div");
    this.context.id = "snap-context";
  }

  sync(container, navbar, connection, models, hasModels) {
    document.documentElement.classList.toggle("snap-no-models", hasModels === false);
    const title = hasModels === false ? "连接模型，即可开始" : "从一张截图开始";
    const caption = hasModels === false ? "在右上角添加模型密钥。" : "连续截屏，放在一起问。";
    if (this.welcome.querySelector("h1").textContent !== title) this.welcome.querySelector("h1").textContent = title;
    if (this.welcome.querySelector("p").textContent !== caption) this.welcome.querySelector("p").textContent = caption;
    if (navbar) {
      navbar.classList.add("snap-navbar");
      navbar.querySelector(".pointer-events-none.invisible:has(.truncate)")?.classList.add("snap-chat-title");
      if (this.context.parentElement !== navbar) navbar.append(this.context);
      if (connection.parentElement !== this.context) this.context.append(connection);
      if (models.parentElement !== this.context) this.context.append(models);
    }
    if (!container) return;
    // The welcome composer and conversation composer are different native nodes.
    const start = container.closest(".translate-y-6");
    if (start) {
      start.classList.add("snap-start");
      start.parentElement.classList.add("snap-start-host");
      const column = start.querySelector(":scope > .text-3xl > .flex-col");
      if (column) {
        column.parentElement.classList.add("snap-start-body");
        column.classList.add("snap-start-column");
        column.firstElementChild?.classList.add("snap-model-identity");
        // Only layout wrappers on the path to the native composer participate.
        let wrapper = container.parentElement;
        while (wrapper && wrapper !== column) {
          wrapper.classList.add("snap-compose-chain");
          wrapper = wrapper.parentElement;
        }
      }
      if (this.welcome.parentElement !== container) container.prepend(this.welcome);
    } else this.welcome.remove();
    container.classList.toggle("snap-has-images", Boolean(container.querySelector(".snap-attachment")));
    const input = container.querySelector("#chat-input-container");
    input?.parentElement.classList.add("snap-text-entry");
    for (const node of container.children) {
      if (node.matches(".flex.justify-between"))
        node.classList.add("snap-send-row");
    }
  }
}
