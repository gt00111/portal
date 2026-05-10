/** 図面ライブラリ一覧（顧客図面・自社発行）共通の1ページあたり件数 */
export const DRAWING_LIST_PAGE_SIZES = [20, 50, 100] as const;
export type DrawingListPageSize = (typeof DRAWING_LIST_PAGE_SIZES)[number];

export const DEFAULT_DRAWING_LIST_PAGE_SIZE: DrawingListPageSize = 20;
