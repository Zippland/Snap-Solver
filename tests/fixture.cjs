const http = require("node:http");
const path = require("node:path");
const { Runtime } = require("../desktop/runtime.cjs");
const { Gateway } = require("../desktop/gateway.cjs");
const { setTimeout: delay } = require("node:timers/promises");
const catalog = require("../config/providers.json");

async function createFixture(directory) {
  const requests = [],
    closed = [];
  const provider = http.createServer(async (request, response) => {
    if (
      !request.url.endsWith("/chat/completions") &&
      !request.url.endsWith("/responses")
    ) {
      response.writeHead(404);
      response.end();
      return;
    }
    let raw = "";
    for await (const chunk of request) raw += chunk;
    const payload = JSON.parse(raw);
    requests.push(payload);
    if (request.url.endsWith("/responses")) {
      response.writeHead(200, { "Content-Type": "application/json" });
      response.end(
        JSON.stringify({
          id: "resp_mock",
          object: "response",
          created_at: Math.floor(Date.now() / 1000),
          status: "completed",
          model: payload.model,
          output: [
            {
              id: "msg_mock",
              type: "message",
              role: "assistant",
              status: "completed",
              content: [
                {
                  type: "output_text",
                  text: "Responses 多模态转换已验证",
                  annotations: [],
                },
              ],
            },
          ],
          usage: { input_tokens: 5, output_tokens: 5, total_tokens: 10 },
        }),
      );
      return;
    }
    response.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
    });
    const slow = JSON.stringify(payload.messages).includes("慢速测试");
    let done = false;
    response.on("close", () => {
      closed.push({ slow, completed: done });
    });
    const content = slow
      ? "正在逐步分析。".repeat(300)
      : requests.length === 1
        ? "## 第一步：理解问题\n\n截图已收到。这是本地模拟模型的验证回答。\n\n由 $a^2+b^2=c^2$，代入可得 **c = 5**。\n\n~~~python\nprint(3 ** 2 + 4 ** 2)\n~~~\n"
        : "追问已收到。前一轮的截图和对话上下文都保留了。\n\n答案仍然是 **5**。";
    for (
      let index = 0;
      index < content.length && !response.destroyed;
      index += 8
    ) {
      response.write(
        "data: " +
          JSON.stringify({
            id: "test-completion",
            object: "chat.completion.chunk",
            model: payload.model,
            choices: [
              {
                index: 0,
                delta: { content: content.slice(index, index + 8) },
                finish_reason: null,
              },
            ],
          }) +
          "\n\n",
      );
      await delay(slow ? 100 : 15);
    }
    if (!response.destroyed) {
      done = true;
      response.write(
        "data: " +
          JSON.stringify({
            id: "test-completion",
            choices: [{ index: 0, delta: {}, finish_reason: "stop" }],
          }) +
          "\n\ndata: [DONE]\n\n",
      );
      response.end();
    }
  });
  await new Promise((resolve) => provider.listen(0, "127.0.0.1", resolve));
  const oldEnv = {};
  for (const item of catalog.providers) {
    oldEnv[item.envKey] = process.env[item.envKey];
    delete process.env[item.envKey];
  }
  const runtime = new Runtime(directory, {
    legacyDirectory: path.join(directory, "no-legacy"),
  });
  const svg =
    '<svg xmlns="http://www.w3.org/2000/svg" width="1440" height="900"><rect width="1440" height="900" fill="#f3f5f2"/><rect x="200" y="180" width="1040" height="540" rx="24" fill="white"/><text x="260" y="275" font-family="sans-serif" font-size="36" fill="#24392d">Mathematics · Practice 01</text><text x="260" y="370" font-family="sans-serif" font-size="28" fill="#52654c">A right triangle has sides a = 3, b = 4.</text><text x="260" y="425" font-family="sans-serif" font-size="28" fill="#52654c">Find the hypotenuse c, and explain each step.</text><path d="M300 610h280L300 480z" fill="none" stroke="#81936e" stroke-width="5"/><text x="420" y="645" font-size="24">4</text><text x="265" y="550" font-size="24">3</text><text x="430" y="525" font-size="24">c = ?</text></svg>';
  const captures = [];
  const native = {
    permission: () => "granted",
    displays: () => [
      { id: "1", name: "测试屏幕", width: 1440, height: 900, primary: true },
      { id: "2", name: "第二块屏幕", width: 1440, height: 900, primary: false },
    ],
    capture: async (displayId) => {
      captures.push({ displayId: displayId === "2" ? "2" : "1" });
      const numbered = svg.replace(
        "</svg>",
        '<text x="260" y="690" font-family="sans-serif" font-size="20" fill="#87957e">Screen ' +
          captures.at(-1).displayId +
          " / Capture " +
          captures.length +
          "</text></svg>",
      );
      return {
        image:
          "data:image/svg+xml;base64," +
          Buffer.from(numbered).toString("base64"),
        width: 1440,
        height: 900,
        displayId: captures.at(-1).displayId,
      };
    },
  };
  const gateway = new Gateway(directory, native, runtime);
  await gateway.start();
  const url =
    "http://" +
    (process.env.SNAP_TEST_HOST || "127.0.0.1") +
    ":" +
    gateway.port;
  try {
    await runtime.start();
  } finally {
    for (const item of catalog.providers) {
      if (oldEnv[item.envKey] === undefined) delete process.env[item.envKey];
      else process.env[item.envKey] = oldEnv[item.envKey];
    }
  }
  await runtime.saveProvider("alibaba", {
    apiKey: "test-only-never-real",
    baseUrl: "http://127.0.0.1:" + provider.address().port + "/v1",
  });
  return {
    url,
    runtime,
    gateway,
    requests,
    closed,
    captures,
    providerUrl: "http://127.0.0.1:" + provider.address().port + "/v1",
    pairingUrl: url + "/snap/pair#token=" + gateway.pairing.info().token,
    async stop() {
      await gateway.close();
      await runtime.stop();
      provider.closeAllConnections();
      await new Promise((resolve) => provider.close(resolve));
    },
  };
}
module.exports = { createFixture };
