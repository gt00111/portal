/**
 * ホーム一覧アイコン・アプリ内ヘッダー用ロゴ（resources/branding を Vite で取り込み）
 * 一覧: master-database は .ico が無いため icon.png を使用
 * ロゴ: seisan-board はファイル名 `seisan-board.png`（他アプリは logo.png）
 */
import drawingLibraryIcon from "@branding/drawing-library/icon.ico?url";
import drawingLibraryLogo from "@branding/drawing-library/logo.png?url";
import masterDatabaseIcon from "@branding/master-database/icon.png?url";
import masterDatabaseLogo from "@branding/master-database/logo.png?url";
import pixoConverterIcon from "@branding/pixo-converter/icon.ico?url";
import pixoConverterLogo from "@branding/pixo-converter/logo.png?url";
import partsTrackerIcon from "@branding/parts-tracker/icon.ico?url";
import partsTrackerLogo from "@branding/parts-tracker/logo.png?url";
import processManagementIcon from "@branding/process-management/icon.ico?url";
import processManagementLogo from "@branding/process-management/logo.png?url";
import seisanBoardIcon from "@branding/seisan-board/seisan-board-icon.ico?url";
import seisanBoardLogo from "@branding/seisan-board/seisan-board.png?url";

const PORTAL_APP_LIST_ICON_URL = {
  "master-database": masterDatabaseIcon,
  "drawing-library": drawingLibraryIcon,
  "parts-tracker": partsTrackerIcon,
  "pixo-converter": pixoConverterIcon,
  "process-management": processManagementIcon,
  "seisan-board": seisanBoardIcon,
} as const;

const PORTAL_APP_HEADER_LOGO_URL = {
  "master-database": masterDatabaseLogo,
  "drawing-library": drawingLibraryLogo,
  "parts-tracker": partsTrackerLogo,
  "pixo-converter": pixoConverterLogo,
  "process-management": processManagementLogo,
  "seisan-board": seisanBoardLogo,
} as const;

export function getPortalAppListIconUrl(appId: string): string | undefined {
  return PORTAL_APP_LIST_ICON_URL[appId as keyof typeof PORTAL_APP_LIST_ICON_URL];
}

export function getPortalAppHeaderLogoUrl(appId: string): string | undefined {
  return PORTAL_APP_HEADER_LOGO_URL[appId as keyof typeof PORTAL_APP_HEADER_LOGO_URL];
}
