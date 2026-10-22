# Third-party components

Snap-Solver is an independent integration. It is not an official Open WebUI product and is not endorsed by its maintainers.

- **Open WebUI 0.12.2** — the official, unmodified wheel is downloaded during setup. Its UI, runtime and branding remain present. See the [tagged source license](https://github.com/open-webui/open-webui/blob/v0.12.2/LICENSE), [license explanation](https://docs.openwebui.com/license/), and [official slim requirements](https://github.com/open-webui/open-webui/blob/v0.12.2/backend/requirements-slim.txt). Open WebUI and its dependencies retain their own licenses; the MIT license of Snap-Solver does not relicense them.
- **Electron 44.8.0** — [MIT and bundled Chromium notices](https://github.com/electron/electron/blob/v44.8.0/LICENSE).
- **Cropper.js 1.6.2** — [MIT](https://github.com/fengyuanchen/cropperjs/blob/v1.6.2/LICENSE).
- **Express**, **http-proxy**, **node-qrcode** — their installed packages include MIT license notices.
- **Playwright** — [Apache-2.0](https://github.com/microsoft/playwright/blob/main/LICENSE), development verification only.

Runtime dependency versions are recorded in `runtime/requirements.lock` and Node dependency versions in `package-lock.json`. This delivery does not bundle or distribute an installer. A future packaged distribution must include the applicable component licenses and notices.
