import { existsSync } from "node:fs";
import { join } from "node:path";

import { app } from "electron";

/**
 * package.json があるアプリルート（dev でも asar 内でも一定）を基準に out を解決する。
 * `import.meta.dirname` 依存だと実行コンテキストによっては preload パスがずれ、window.api が載らないことがある。
 */
function appRoot(): string {
  return app.getAppPath();
}

export function getPreloadScriptPath(): string {
  const p = join(appRoot(), "out/preload/index.cjs");
  if (!existsSync(p)) {
    // eslint-disable-next-line no-console
    console.error(`[appPaths] preload script not found: ${p}`);
  }
  return p;
}

export function getRendererIndexHtmlPath(): string {
  return join(appRoot(), "out/renderer/index.html");
}
