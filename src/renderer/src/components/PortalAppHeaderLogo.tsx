import { getPortalAppHeaderLogoUrl } from "@renderer/lib/portalAppBranding.js";

interface Props {
  appId: string;
  className?: string;
}

/** アプリ内ヘッダー用（`logo.png` / seisan は `seisan-board.png`）。見出しテキストと並ぶ想定で alt は空 */
export function PortalAppHeaderLogo({ appId, className }: Props): JSX.Element | null {
  const url = getPortalAppHeaderLogoUrl(appId);
  if (!url) return null;
  return <img src={url} alt="" decoding="async" className={className} aria-hidden />;
}
