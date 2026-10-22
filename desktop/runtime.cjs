const fs = require("node:fs");
const path = require("node:path");
const net = require("node:net");
const crypto = require("node:crypto");
const { spawn } = require("node:child_process");
const { setTimeout: delay } = require("node:timers/promises");
const { readJson, writeJson } = require("./pairing.cjs");
const catalog = require("../config/providers.json");
const { scope } = require("./product-scope.cjs");
const VERSION = "0.12.2";
const ROOT = path.resolve(__dirname, "..");

async function freePort() {
  const server = net.createServer();
  await new Promise((resolve, reject) =>
    server.once("error", reject).listen(0, "127.0.0.1", resolve),
  );
  const port = server.address().port;
  await new Promise((resolve) => server.close(resolve));
  return port;
}

function seedConnections(env, legacyDirectory) {
  const keys = readJson(path.join(legacyDirectory, "api_keys.json"), {});
  const proxy = readJson(path.join(legacyDirectory, "proxy_api.json"), {});
  const urls = [],
    apiKeys = [],
    configs = {};
  catalog.providers.forEach((provider, index) => {
    const key = env[provider.envKey] || keys[provider.legacyKey] || "";
    const baseUrl =
      (proxy.enabled && proxy.apis?.[provider.id]) || provider.baseUrl;
    urls.push(baseUrl);
    apiKeys.push(key);
    configs[index] = {
      enable: Boolean(key),
      model_ids: provider.models,
      prefix_id: provider.id,
      tags: [{ name: provider.name }],
      api_type: provider.apiType,
    };
  });
  return {
    OPENAI_API_BASE_URLS: urls.join(";"),
    OPENAI_API_KEYS: apiKeys.join(";"),
    OPENAI_API_CONFIGS: JSON.stringify(configs),
  };
}

class Runtime {
  constructor(directory, options = {}) {
    this.directory = directory;
    this.options = options;
    this.ready = false;
    this.error = "";
    this.child = null;
    this.stopping = false;
    this.updates = Promise.resolve();
  }
  async start() {
    this.port = await freePort();
    this.url = "http://127.0.0.1:" + this.port;
    const python =
      process.env.SNAP_PYTHON ||
      path.join(
        ROOT,
        ".runtime",
        process.platform === "win32" ? "Scripts/python.exe" : "bin/python",
      );
    if (!fs.existsSync(python))
      throw new Error("尚未安装聊天运行环境。请先运行 npm run setup。");
    fs.mkdirSync(this.directory, { recursive: true, mode: 0o700 });
    const secretFile = path.join(this.directory, "runtime-secret.json");
    const secret = readJson(secretFile, {
      key: crypto.randomBytes(32).toString("hex"),
    });
    writeJson(secretFile, secret);
    const dataDirectory = path.join(this.directory, "open-webui");
    fs.mkdirSync(dataDirectory, { recursive: true, mode: 0o700 });
    const env = {
      ...process.env,
      ...seedConnections(
        process.env,
        this.options.legacyDirectory || path.join(ROOT, ".snapsolver"),
      ),
      DATA_DIR: dataDirectory,
      WEBUI_SECRET_KEY: secret.key,
      WEBUI_AUTH: "False",
      USE_SLIM_DOCKER: "True",
      OFFLINE_MODE: "True",
      WEBUI_NAME: "Snap-Solver",
      DEFAULT_LOCALE: "zh-CN",
      DEFAULT_PROMPT_SUGGESTIONS: "[]",
      ENABLE_OLLAMA_API: "False",
      OLLAMA_BASE_URL: "http://127.0.0.1:11434",
      ENABLE_DIRECT_CONNECTIONS: "False",
      ENABLE_VERSION_UPDATE_CHECK: "False",
      ENABLE_CODE_EXECUTION: "False",
      ENABLE_CODE_INTERPRETER: "False",
      ENABLE_PLUGINS: "False",
      ENABLE_TOOLS: "False",
      ENABLE_TOOL_SERVERS: "False",
      ENABLE_MEMORIES: "False",
      ENABLE_NOTES: "False",
      ENABLE_CALENDAR: "False",
      ENABLE_AUTOMATIONS: "False",
      ENABLE_CHANNELS: "False",
      ENABLE_COMMUNITY_SHARING: "False",
      ENABLE_TITLE_GENERATION: "False",
      ENABLE_TAGS_GENERATION: "False",
      ENABLE_FOLLOW_UP_GENERATION: "False",
      ENABLE_SEARCH_QUERY_GENERATION: "False",
      ENABLE_AUTOCOMPLETE_GENERATION: "False",
      ENABLE_EVALUATION_ARENA_MODELS: "False",
      RAG_EMBEDDING_ENGINE: "openai",
      AUDIO_STT_ENGINE: "openai",
      DO_NOT_TRACK: "true",
      SCARF_NO_ANALYTICS: "true",
      ANONYMIZED_TELEMETRY: "False",
      CORS_ALLOW_ORIGIN: this.url,
      PYTHONUNBUFFERED: "1",
    };
    // The process log is local-only. It contains framework diagnostics, never
    // an environment dump. Preserve it for startup failures.
    this.logFile = path.join(this.directory, "runtime.log");
    const log = fs.openSync(this.logFile, "a", 0o600);
    if (this.stopping) {
      fs.closeSync(log);
      throw new Error("启动已取消");
    }
    this.child = spawn(
      python,
      [
        path.join(ROOT, "runtime/launch.py"),
        "--port",
        String(this.port),
        "--parent",
        String(process.pid),
      ],
      {
        cwd: this.directory,
        env,
        stdio: ["pipe", log, log],
        windowsHide: true,
      },
    );
    fs.closeSync(log);
    this.child.on("error", (error) => {
      this.error = error.message;
    });
    this.child.on("exit", (code) => {
      this.ready = false;
      if (!this.stopping)
        this.error =
          "聊天服务已退出（" + code + "），请重启 App。日志：" + this.logFile;
    });
    const deadline = Date.now() + 120000;
    while (Date.now() < deadline) {
      if (this.stopping || this.error)
        throw new Error(this.error || "启动已取消");
      try {
        const response = await fetch(this.url + "/health", {
          signal: AbortSignal.timeout(1200),
        });
        if (response.ok) {
          // Single-user mode creates the local account, and returns its token.
          const auth = await this.request(
            "/api/v1/auths/signin",
            {
              method: "POST",
              body: { email: "admin@localhost", password: "" },
            },
            false,
          );
          this.authToken = auth.token;
          // Environment defaults do not override persisted Open WebUI settings.
          // Apply only product-owned switches; preserve keys, models and chats.
          await this.applyProductScope();
          // Seed the upstream interface once, without replacing later choices.
          const preferences = await this.request("/api/v1/users/user/settings");
          if (!preferences?.ui) {
            await this.request("/api/v1/users/user/settings/update", {
              method: "POST",
              body: {
                ui: {
                  showChangelog: false,
                  showUpdateToast: false,
                  language: "zh-CN",
                },
              },
            });
          }
          await this.initializeWorkspace();
          this.ready = true;
          return;
        }
      } catch (error) {
        if (error.message?.startsWith("Open WebUI:"))
          this.error = error.message;
      }
      await delay(500);
    }
    throw new Error("聊天服务启动超时。查看本地日志：" + this.logFile);
  }
  async request(route, options = {}, authenticated = true) {
    const response = await fetch(this.url + route, {
      ...options,
      headers: {
        "Content-Type": "application/json",
        ...(authenticated ? { Authorization: "Bearer " + this.authToken } : {}),
      },
      body:
        options.body === undefined ? undefined : JSON.stringify(options.body),
      signal: AbortSignal.timeout(15000),
    });
    if (!response.ok)
      throw new Error(
        "Open WebUI: 本地服务返回 " + response.status + "（" + route + "）",
      );
    return response.json();
  }
  async applyProductScope() {
    await this.request("/api/v1/configs/import", {
      method: "POST",
      body: {
        config: { ...scope.runtime, "rag.file.max_count": scope.maxImages },
      },
    });
  }
  async providers() {
    const config = await this.request("/openai/config");
    return {
      verifiedAt: catalog.verifiedAt,
      providers: catalog.providers.map((provider) => {
        const index = Object.entries(config.OPENAI_API_CONFIGS).find(
          ([, value]) => value.prefix_id === provider.id,
        )?.[0];
        return {
          id: provider.id,
          name: provider.name,
          models: provider.models,
          source: provider.source,
          baseUrl:
            index === undefined
              ? provider.baseUrl
              : config.OPENAI_API_BASE_URLS[index],
          configured:
            index !== undefined &&
            Boolean(config.OPENAI_API_KEYS[index]) &&
            config.OPENAI_API_CONFIGS[index]?.enable !== false,
        };
      }),
    };
  }
  async initializeWorkspace() {
    const file = path.join(this.directory, "bootstrap.json");
    const seeded = readJson(file, { models: [], prompts: false });
    const profiles = await this.request("/api/v1/models/all");
    const existing = new Set(profiles.map((model) => model.id));
    for (const provider of catalog.providers) {
      for (const model of provider.models) {
        const id = provider.id + "." + model;
        if (seeded.models.includes(id)) continue;
        if (!existing.has(id)) {
          await this.request("/api/v1/models/create", {
            method: "POST",
            body: {
              id,
              name: provider.labels[model],
              base_model_id: null,
              meta: {
                capabilities: { vision: true },
                tags: [{ name: provider.name }],
              },
              params: {},
            },
          });
        }
        seeded.models.push(id);
      }
    }
    if (!seeded.prompts) {
      const directory =
        this.options.legacyDirectory || path.join(ROOT, ".snapsolver");
      const prompts = readJson(
        path.join(directory, "prompts.json"),
        readJson(path.join(ROOT, "config/prompts.json"), {}),
      );
      const existingPrompts = new Set(
        (await this.request("/api/v1/prompts/")).map(
          (prompt) => prompt.command,
        ),
      );
      for (const [id, prompt] of Object.entries(prompts)) {
        if (typeof prompt?.content !== "string") continue;
        const command = "/snap-" + id.replace(/[^a-zA-Z0-9_-]/g, "-");
        if (existingPrompts.has(command)) continue;
        await this.request("/api/v1/prompts/create", {
          method: "POST",
          body: {
            command,
            name: String(prompt.name || id),
            content: prompt.content,
            tags: ["Snap-Solver"],
          },
        });
        existingPrompts.add(command);
      }
      seeded.prompts = true;
    }
    writeJson(file, seeded);
  }
  saveProvider(id, data) {
    const result = this.updates.then(() => this.writeProvider(id, data));
    this.updates = result.catch(() => {});
    return result;
  }
  async writeProvider(id, data) {
    const provider = catalog.providers.find((item) => item.id === id);
    if (!provider) throw new Error("未知的模型服务");
    if (typeof data.apiKey !== "string" || data.apiKey.length > 4096)
      throw new Error("API Key 格式不正确");
    let url;
    try {
      url = new URL(data.baseUrl || provider.baseUrl);
    } catch {
      throw new Error("服务地址格式不正确");
    }
    if (
      !["https:", "http:"].includes(url.protocol) ||
      url.username ||
      url.password ||
      url.search ||
      url.hash
    ) {
      throw new Error("请填写不含账号密码的 HTTP(S) 服务地址");
    }
    const config = await this.request("/openai/config");
    let index = Object.entries(config.OPENAI_API_CONFIGS).find(
      ([, value]) => value.prefix_id === id,
    )?.[0];
    if (index === undefined) index = String(config.OPENAI_API_BASE_URLS.length);
    config.OPENAI_API_BASE_URLS[index] = url.href.replace(/\/$/, "");
    if (data.remove === true) config.OPENAI_API_KEYS[index] = "";
    else if (data.apiKey.trim())
      config.OPENAI_API_KEYS[index] = data.apiKey.trim();
    config.OPENAI_API_CONFIGS[index] = {
      ...config.OPENAI_API_CONFIGS[index],
      enable: Boolean(config.OPENAI_API_KEYS[index]),
      prefix_id: id,
      model_ids: provider.models,
      tags: [{ name: provider.name }],
      api_type: provider.apiType,
    };
    config.ENABLE_OPENAI_API = true;
    await this.request("/openai/config/update", {
      method: "POST",
      body: config,
    });
    return { success: true };
  }
  async stop() {
    this.stopping = true;
    this.ready = false;
    if (!this.child || this.child.exitCode !== null) return;
    const child = this.child;
    const exited = new Promise((resolve) => child.once("exit", resolve));
    child.kill("SIGTERM");
    await Promise.race([exited, delay(4000)]);
    if (child.exitCode === null) {
      child.kill("SIGKILL");
      await Promise.race([exited, delay(1500)]);
    }
  }
}
module.exports = { Runtime, seedConnections, freePort, VERSION };
