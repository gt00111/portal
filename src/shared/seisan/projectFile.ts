export interface ProjectFile {
  id: string;
  project_id: string;
  file_name: string;
  file_path: string;
  file_ext: string;
  /** 1 = 旧図面。図面ライブラリ「顧客図面」の一覧オーバーレイ用。生産ボード UI では参照しません。 */
  is_obsolete: number;
  created_at: string;
  updated_at: string;
}

/** 案件の提供ファイル＋案件メタ（図面ライブラリ「顧客図面」同期一覧用） */
export interface ProjectFileWithProject extends ProjectFile {
  project_no: string | null;
  company_id: string | null;
  model_type: string | null;
  part_number: string | null;
  /** 案件の図面リビジョン（projects.revision） */
  revision: string | null;
  project_name: string | null;
  group_id: string | null;
}
