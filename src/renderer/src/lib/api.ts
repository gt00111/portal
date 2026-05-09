import type { IpcResponse } from "@shared/ipcResponse.js";

export async function invoke<T>(channel: string, data?: unknown): Promise<T> {
  const bridge = window.api?.invoke;
  if (!bridge) {
    const alienApi = typeof (window as unknown as { electronAPI?: unknown }).electronAPI !== "undefined";
    if (alienApi) {
      throw new Error(
        "API が利用できません。window.api（ポータル用）がありませんが、window.electronAPI（別アプリ用）が見えています。PixoConverter と Vite のポートが 5173 で競合している可能性があります。ポータルは dev でポート 5180 です。環境変数 ELECTRON_RENDERER_URL が古い http://localhost:5173 のままなら解除してください。"
      );
    }
    throw new Error(
      "API が利用できません。preload のブリッジ（window.api）が読み込めていません。起動に使ったターミナルに [preload] api exposed のログがあるか確認してください（preload のログは F12 のコンソールには基本出ません）。"
    );
  }
  const res = (await bridge(channel, data)) as IpcResponse<T>;
  if (!res.success) throw new Error(res.error);
  return res.data;
}
