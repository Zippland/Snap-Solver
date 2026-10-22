// UI selectors are intentionally tied to Open WebUI 0.12.2 and covered by
// integration tests. The upstream engine, editor, history and branding stay.
export function applyScope() {
  for (const link of document.querySelectorAll("a[href]")) {
    const href = link.getAttribute("href");
    if (
      /^\/(admin|workspace|playground|notes|channels|calendar|automations|apps)(\/|$)/.test(
        href,
      )
    )
      link.classList.add("snap-unused");
  }
  const unnecessary = new Set([
    "对话高级设置",
    "Chat Controls",
    "语音模式",
    "Voice mode",
    "用户菜单",
    "User menu",
    "朗读",
    "Read Aloud",
    "比较模型",
    "Compare Models",
    "添加模型",
    "Add Model",
    "复制对话",
    "Copy Chat",
    "继续回答",
    "Continue Response",
  ]);
  for (const element of document.querySelectorAll("button[aria-label]")) {
    if (unnecessary.has(element.getAttribute("aria-label")))
      element.classList.add("snap-unused");
  }
  // Hide peripheral actions only inside menus, never text in model answers.
  const menuItems = new Set([
    "分享",
    "分享对话",
    "Share",
    "Share Chat",
    "添加到笔记",
    "Add to Notes",
    "克隆",
    "Clone",
    "移动到文件夹",
    "Move to Folder",
  ]);
  for (const item of document.querySelectorAll('[role="menuitem"]')) {
    if (menuItems.has(item.textContent.trim()))
      item.classList.add("snap-unused");
  }
  const sidebar = document.querySelector("#sidebar > div");
  if (sidebar && !sidebar.querySelector("#snap-sidebar-settings")) {
    const link = document.createElement("a");
    link.id = "snap-sidebar-settings";
    link.href = "/snap/models";
    link.textContent = "模型设置";
    sidebar.append(link);
  }

  // A tooltip alone is not discoverable on a phone. Keep the native action,
  // but give frequently used icons a short visible label through CSS.
  const labels = new Map([
    ["展开侧边栏", "对话"], ["Open Sidebar", "对话"],
    ["新对话", "新对话"], ["New Chat", "新对话"],
    ["对话操作", "更多"], ["Chat actions", "更多"],
    ["发送消息", "发送"], ["Send message", "发送"],
    ["停止", "停止回答"], ["Stop", "停止回答"],
    ["复制", "复制"], ["Copy", "复制"],
    ["编辑", "编辑"], ["Edit", "编辑"],
    ["重新生成", "重答"], ["Regenerate", "重答"],
    ["滚动到底部", "最新回复"], ["Scroll to bottom", "最新回复"],
    ["展开输入框", "展开"], ["Expand input", "展开"],
  ]);
  for (const button of document.querySelectorAll("button[aria-label], #send-message-button")) {
    // Sidebar rows and menu items already have their own visible names.
    if (button.id === "new-chat-button" || button.closest('#sidebar, [role="menu"], dialog')) {
      delete button.dataset.snapLabel;
      continue;
    }
    const label = button.id === "send-message-button"
      ? "发送"
      : labels.get(button.getAttribute("aria-label"));
    if (button.id === "send-message-button") button.setAttribute("aria-label", "发送消息");
    if (label && !button.textContent.trim()) button.dataset.snapLabel = label;
    else delete button.dataset.snapLabel;
  }
}
