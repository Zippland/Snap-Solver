const scope = require("../config/product-scope.json");

// Keep the installed UI intact. Remove unrelated product surfaces at the
// gateway as well as their entry points in the pinned frontend adapter.
const unusedPages =
  /^\/(?:admin|workspace|playground|notes|channels|calendar|automations|apps)(?:\/|$)/;
const unusedWrites =
  /^\/api\/v1\/(?:audio|images|retrieval|knowledge|tools|skills|functions|channels|notes|calendar|automations|folders|configs)(?:\/|$)/;

function restrict(request, response, next) {
  if (unusedPages.test(request.path)) return response.redirect("/");
  if (
    !["GET", "HEAD", "OPTIONS"].includes(request.method) &&
    (unusedWrites.test(request.path) ||
      request.path === "/api/v1/utils/code/execute")
  ) {
    return response.status(403).json({ detail: "此功能不在截图问答中启用" });
  }
  next();
}

module.exports = { scope, restrict };
