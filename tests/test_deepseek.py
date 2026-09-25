"""Offline checks using the real OpenAI SDK and a mocked HTTP transport."""
import json
import os
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

import httpx
from openai import OpenAI
from PIL import Image

import app as server
from models.deepseek import DeepSeekModel


def stream_body(finish="stop", answer="答案", reasoning="思考"):
    chunks = [{"choices": []}]
    for key, text in (("reasoning_content", reasoning), ("content", answer)):
        chunks.extend({"choices": [{"index": 0, "delta": {key: char},
                                    "finish_reason": None}]} for char in text)
    chunks.append({"choices": [{"index": 0, "delta": {},
                                "finish_reason": finish}]})
    return "".join(f"data: {json.dumps(chunk)}\n\n" for chunk in chunks) + "data: [DONE]\n\n"


class DeepSeekTests(unittest.TestCase):
    def setUp(self):
        self.requests = []
        self.clients = []
        self.response = httpx.Response(
            200, headers={"content-type": "text/event-stream"},
            text=stream_body(),
        )

        def handler(request):
            self.requests.append(request)
            return self.response

        def client_factory(**kwargs):
            kwargs["http_client"] = httpx.Client(transport=httpx.MockTransport(handler))
            client = OpenAI(max_retries=0, **kwargs)
            self.clients.append(client)
            return client

        self.client_patch = patch("models.deepseek.OpenAI", side_effect=client_factory)
        self.client_patch.start()
        self.addCleanup(self.client_patch.stop)

    def payload(self):
        return json.loads(self.requests[-1].content)

    def test_image_followup_stream_and_relay(self):
        model = DeepSeekModel("test-key", api_base_url="https://relay.invalid/v1",
                              reasoning_tier="max", system_prompt="解题")
        model.max_tokens = 4096
        history = [{"role": "assistant", "content": "先前答案"},
                   {"role": "user", "content": "为什么？"},
                   {"role": "system", "content": "丢弃"}]
        events = list(model.analyze_image("aW1hZ2U=", history=history))
        self.assertEqual(str(self.requests[0].url), "https://relay.invalid/v1/chat/completions")
        body = self.payload()
        self.assertEqual(body["model"], "deepseek-flash")
        self.assertEqual(body["messages"][1]["content"][1], {
            "type": "image_url", "image_url": {"url": "data:image/png;base64,aW1hZ2U="}})
        self.assertEqual(body["messages"][2:], history[:2])
        self.assertEqual(body["thinking"], {"type": "enabled"})
        self.assertEqual(body["reasoning_effort"], "max")
        self.assertEqual(body["max_tokens"], 4096)
        self.assertNotIn("temperature", body)
        self.assertIn({"status": "thinking", "content": "思"}, events)
        self.assertIn({"status": "streaming", "content": "答"}, events)
        self.assertEqual(events[-1], {"status": "completed", "content": "答案"})
        self.assertTrue(self.clients[0].is_closed())

    def test_fast_and_high_parameters(self):
        for tier in ("fast", "deep"):
            with self.subTest(tier=tier):
                list(DeepSeekModel("test", reasoning_tier=tier).analyze_text("题目"))
                body = self.payload()
                self.assertEqual(str(self.requests[-1].url), "https://api.deepseek.com/chat/completions")
                self.assertEqual(body["messages"][1]["content"], "题目")
                if tier == "fast":
                    self.assertEqual(body["thinking"]["type"], "disabled")
                    self.assertNotIn("reasoning_effort", body)
                    self.assertEqual(body["temperature"], 0.7)
                else:
                    self.assertEqual(body["reasoning_effort"], "high")
                    self.assertNotIn("temperature", body)

    def test_data_url_preserved(self):
        url = "data:image/jpeg;base64,aW1hZ2U="
        list(DeepSeekModel("test").analyze_image(url))
        self.assertEqual(self.payload()["messages"][1]["content"][1]["image_url"]["url"], url)

    def test_legacy_image_rejected_without_request(self):
        events = list(DeepSeekModel("test", model_name="deepseek-reasoner").analyze_image("image"))
        self.assertEqual(events[-1]["status"], "error")
        self.assertEqual(self.requests, [])

    def test_proxy_does_not_change_environment(self):
        before = dict(os.environ)
        with patch("models.deepseek.DefaultHttpxClient") as http_client:
            list(DeepSeekModel("test").analyze_text("题目", proxies={"https": "http://localhost:8888"}))
            http_client.assert_called_once_with(proxy="http://localhost:8888")
        self.assertEqual(dict(os.environ), before)

    def test_reasoning_only_and_truncation_are_errors(self):
        for answer, finish in (("", "stop"), ("部分答案", "length")):
            with self.subTest(answer=answer):
                self.response = httpx.Response(200, headers={"content-type": "text/event-stream"},
                                               text=stream_body(finish=finish, answer=answer))
                events = list(DeepSeekModel("test").analyze_text("题目"))
                self.assertEqual(events[-1]["status"], "error")
                self.assertFalse(any(event["status"] == "completed" for event in events))

    def test_authentication_error(self):
        self.response = httpx.Response(401, json={"error": {"message": "invalid_api_key"}})
        events = list(DeepSeekModel("test").analyze_text("题目"))
        self.assertEqual(events[-1]["status"], "error")
        self.assertIn("密钥无效", events[-1]["error"])
        self.assertTrue(self.clients[-1].is_closed())

    def test_model_key_routes_and_socketio_screenshot_flow(self):
        with tempfile.TemporaryDirectory() as directory:
            with patch.object(server, "API_KEYS_FILE", str(Path(directory) / "keys.json")), \
                 patch.object(server, "PROXY_API_FILE", str(Path(directory) / "proxy.json")):
                client = server.app.test_client()
                models = client.get("/api/models").get_json()
                model = next(item for item in models if item["id"] == "deepseek-flash")
                self.assertTrue(model["is_multimodal"])
                self.assertEqual(model["provider"], "deepseek")
                self.assertIn("DeepseekApiKey", server.load_api_keys())
                self.assertIn("deepseek", server.load_proxy_api()["apis"])
                self.assertTrue(server.save_api_keys({"DeepseekApiKey": "offline-test-key"}))
                socket = server.socketio.test_client(server.app)
                try:
                    with patch.object(server.pyautogui, "screenshot", return_value=Image.new("RGB", (20, 20))):
                        socket.emit("capture_screenshot", {})
                    image_event = next(event for event in socket.get_received()
                                       if event["name"] == "screenshot_complete")
                    image = image_event["args"][0]["image"]
                    # Run the background callback synchronously to avoid timing-dependent assertions.
                    with patch.object(server.socketio, "start_background_task",
                                      side_effect=lambda fn, *args: fn(*args)):
                        socket.emit("analyze_image", {"image": image, "settings": {
                            "model": "deepseek-flash", "reasoningTier": "deep",
                            "modelInfo": {"isReasoning": True},
                        }, "history": [{"role": "user", "content": "解释步骤"}]})
                    events = [event["args"][0] for event in socket.get_received()
                              if event["name"] == "ai_response"]
                    self.assertEqual(events[-1], {"status": "completed", "content": "答案"})
                    self.assertEqual(self.payload()["messages"][-1]["content"], "解释步骤")
                    self.assertEqual(server.generation_tasks, {})
                finally:
                    socket.disconnect()


if __name__ == "__main__":
    unittest.main()
