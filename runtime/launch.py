"""Launch the unmodified installed Open WebUI wheel, owned by the desktop app."""
import argparse
from importlib.metadata import version
import os
from pathlib import Path
import threading
import time

import psutil


def watch_parent(pid):
    try:
        parent = psutil.Process(pid)
        created = parent.create_time()
        while parent.is_running() and parent.create_time() == created:
            time.sleep(1)
    except psutil.Error:
        pass
    # The desktop was killed/crashed. Do not leave an orphan model request.
    os._exit(0)


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--port", type=int, required=True)
    parser.add_argument("--parent", type=int, required=True)
    args = parser.parse_args()
    if version("open-webui") != "0.12.2":
        raise RuntimeError("Open WebUI 版本不匹配，请运行 npm run setup")
    import open_webui
    package = Path(open_webui.__file__).parent
    # Match the official wheel entry point, independently of the caller's cwd.
    os.environ["FRONTEND_BUILD_DIR"] = str(package / "frontend")
    os.environ["STATIC_DIR"] = str(Path(os.environ["DATA_DIR"]) / "static")
    threading.Thread(target=watch_parent, args=(args.parent,), daemon=True).start()
    # Use the official entry point, including its Windows event-loop policy.
    open_webui.serve(host="127.0.0.1", port=args.port)
