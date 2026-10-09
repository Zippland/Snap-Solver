"""把本地模型 id 映射到中转站实际提供的型号。

先请求中转的 OpenAI 兼容接口 ``GET {base}/models``，再按型号系列和版本就近匹配。
精确同名优先；没有同名时留在同一产品线（如 claude-opus、gpt-5.6）；
产品线对不上时，才在同一厂商里选档位最接近的型号。拉不到列表就保持原 id。
"""

import hashlib
import re
import threading
import time
from typing import Iterable, Optional

import requests

# 名称里的档位/渠道后缀，不参与产品线判断
_VARIANTS = {
    "sol", "luna", "astra", "flash", "mini", "nano", "lite",
    "preview", "latest", "exp", "turbo",
}

# 同厂商里没有同系列时，用档位距离挑选。数字越小越偏速度档
_TIER = {
    "haiku": 0, "flash": 0, "mini": 0, "nano": 0, "lite": 0, "luna": 0,
    "sonnet": 1, "fable": 1,
    "opus": 2, "pro": 2, "ultra": 2,
}

_CACHE_LOCK = threading.Lock()
_CACHE = {}  # (base_url, key_hash) -> (expires_at, ids)
_OK_TTL = 300
_FAIL_TTL = 30


def _parts(model_id: str) -> list:
    return [part for part in model_id.lower().replace("_", "-").split("-") if part]


def _is_version(part: str) -> bool:
    # 5.6 / 4 / k2.6 算版本；qwen3 这种多字母前缀留给产品线
    return bool(re.fullmatch(r"(?:[a-z])?\d+(?:\.\d+)*", part))


def _product_line(model_id: str) -> str:
    kept = [
        part for part in _parts(model_id)
        if part not in _VARIANTS and not _is_version(part)
    ]
    return "-".join(kept)


def _brand(model_id: str) -> str:
    parts = _parts(model_id)
    return parts[0] if parts else ""


def _versions(model_id: str) -> tuple:
    numbers = []
    for part in _parts(model_id):
        if part in _VARIANTS or not _is_version(part):
            continue
        numbers.extend(int(piece) for piece in re.findall(r"\d+", part))
    return tuple(numbers)


def _version_distance(left: str, right: str) -> int:
    left_versions = _versions(left)
    right_versions = _versions(right)
    width = max(len(left_versions), len(right_versions), 1)
    left_versions = left_versions + (0,) * (width - len(left_versions))
    right_versions = right_versions + (0,) * (width - len(right_versions))
    return sum(abs(a - b) for a, b in zip(left_versions, right_versions))


def _tier(model_id: str) -> int:
    for part in _parts(model_id):
        if part in _TIER:
            return _TIER[part]
    return 1


def provider_of(model_id: str) -> str:
    """按模型 id 判断该用哪家适配器。认不出的返回空字符串。"""
    name = (model_id or "").lower()
    if "claude" in name or name.startswith("anthropic"):
        return "anthropic"
    if name.startswith("gpt") or "openai" in name or name.startswith(("o1", "o3", "o4")):
        return "openai"
    if "gemini" in name or name.startswith("google"):
        return "google"
    if "qwen" in name or "qvq" in name:
        return "alibaba"
    if "doubao" in name:
        return "doubao"
    if "kimi" in name or "moonshot" in name:
        return "moonshot"
    if "deepseek" in name:
        return "deepseek"
    return ""


def overlay_with_remote_models(local_models, relay_by_provider, key_by_provider):
    """配了中转地址的厂商，用远端模型列表替换本地目录，页面上显示远端真实 id。"""
    remote_by_provider = {}
    for provider, base_url in (relay_by_provider or {}).items():
        if not base_url or not str(base_url).strip():
            continue
        api_key = (key_by_provider or {}).get(provider) or ""
        if not api_key:
            continue
        for model_id in fetch_remote_model_ids(str(base_url).strip(), api_key):
            if provider_of(model_id) != provider:
                continue
            remote_by_provider.setdefault(provider, set()).add(model_id)

    if not remote_by_provider:
        return list(local_models)

    template = {}
    provider_order = []
    for model in local_models:
        provider = model.get("provider") or ""
        template.setdefault(provider, model)
        if provider not in provider_order:
            provider_order.append(provider)
    for provider in remote_by_provider:
        if provider not in provider_order:
            provider_order.append(provider)

    merged = []
    for provider in provider_order:
        if provider not in remote_by_provider:
            merged.extend(model for model in local_models if (model.get("provider") or "") == provider)
            continue
        sample = template.get(provider, {})
        tiers = sample.get("reasoning_tiers") or ["fast", "deep", "max"]
        for model_id in sorted(remote_by_provider[provider]):
            merged.append({
                "id": model_id,
                "display_name": model_id,
                "is_multimodal": True,
                "is_reasoning": sample.get("is_reasoning", True),
                "description": "当前中转站提供的型号",
                "version": "latest",
                "reasoning_tiers": tiers,
                "default_tier": sample.get("default_tier") or "deep",
                "provider": provider,
            })
    return merged


def resolve_model_id(requested: str, remote_ids: Iterable[str]) -> str:
    """在远端 id 列表中为 requested 找一个可调用的型号。列表为空时原样返回。"""
    remote = [model_id for model_id in remote_ids if isinstance(model_id, str) and model_id.strip()]
    if not requested or not remote:
        return requested

    by_lower = {}
    for model_id in remote:
        by_lower.setdefault(model_id.lower(), model_id)
    exact = by_lower.get(requested.lower())
    if exact:
        return exact

    line = _product_line(requested)
    same_line = [model_id for model_id in remote if line and _product_line(model_id) == line]
    if same_line:
        return min(
            same_line,
            key=lambda model_id: (
                _version_distance(requested, model_id),
                tuple(-number for number in _versions(model_id)),
                model_id,
            ),
        )

    brand = _brand(requested)
    same_brand = [model_id for model_id in remote if brand and _brand(model_id) == brand]
    if not same_brand:
        return requested

    wanted_tier = _tier(requested)
    return min(
        same_brand,
        key=lambda model_id: (
            abs(_tier(model_id) - wanted_tier),
            _version_distance(requested, model_id),
            tuple(-number for number in _versions(model_id)),
            model_id,
        ),
    )


def _models_url(base_url: str) -> list:
    root = base_url.strip().rstrip("/")
    if root.endswith("/v1"):
        return [root + "/models"]
    return [root + "/v1/models", root + "/models"]


def _parse_model_ids(payload) -> list:
    if not isinstance(payload, dict):
        return []
    items = payload.get("data")
    if not isinstance(items, list):
        items = payload.get("models")
    if not isinstance(items, list):
        return []
    ids = []
    for item in items:
        if isinstance(item, str) and item.strip():
            ids.append(item.strip())
        elif isinstance(item, dict) and item.get("id"):
            ids.append(str(item["id"]))
    return ids


def fetch_remote_model_ids(base_url: Optional[str], api_key: Optional[str]) -> list:
    """读取中转站模型列表。失败时返回空列表，调用方继续使用本地 id。"""
    if not base_url or not str(base_url).strip() or not api_key:
        return []

    root = str(base_url).strip().rstrip("/")
    key_hash = hashlib.sha256(api_key.encode("utf-8")).hexdigest()[:12]
    cache_key = (root, key_hash)
    now = time.monotonic()
    with _CACHE_LOCK:
        cached = _CACHE.get(cache_key)
        if cached and cached[0] > now:
            return list(cached[1])

    headers = {
        "Authorization": f"Bearer {api_key}",
        "Accept": "application/json",
    }
    found = []
    for url in _models_url(root):
        try:
            response = requests.get(url, headers=headers, timeout=8)
        except requests.RequestException as exc:
            print(f"读取远端模型列表失败: {url} ({type(exc).__name__})")
            continue
        if response.status_code != 200:
            continue
        try:
            found = _parse_model_ids(response.json())
        except ValueError:
            continue
        if found:
            break

    ttl = _OK_TTL if found else _FAIL_TTL
    with _CACHE_LOCK:
        _CACHE[cache_key] = (now + ttl, list(found))
    if found:
        print(f"远端模型列表 {root}: {len(found)} 个")
    else:
        print(f"远端模型列表为空，保持本地模型 id: {root}")
    return found
