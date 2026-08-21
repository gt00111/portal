import {
  HOLDER_TYPE_LABELS,
  HOLDER_TYPES,
  PUNCH_TYPE_LABELS,
  PUNCH_TYPES,
} from "./sheetMetalSupport.js";

export const MASTER_TABLES = [
  "m_customers",
  "m_models",
  "m_part_numbers",
  "m_component_names",
  "m_group_names",
  "m_user_names",
  "m_suppliers",
  "m_categories",
  "m_machines",
  "m_upper_tools",
  "m_lower_tools",
  "m_tool_holders",
] as const;

export type MasterTable = (typeof MASTER_TABLES)[number];

export const MASTER_TABLE_LABELS: Record<MasterTable, string> = {
  m_customers: "客先",
  m_models: "機種",
  m_part_numbers: "図面番号(品番)",
  m_component_names: "部品名称",
  m_group_names: "グループ名",
  m_user_names: "ユーザー",
  m_suppliers: "商社",
  m_categories: "カテゴリ",
  m_machines: "機械",
  m_upper_tools: "上型（パンチ）",
  m_lower_tools: "下型（ダイ）",
  m_tool_holders: "ホルダー・中間板",
};

/** scope を持つマスタ（scope 単位で値を分離する） */
export const SCOPED_MASTER_TABLES = ["m_categories"] as const;
export type ScopedMasterTable = (typeof SCOPED_MASTER_TABLES)[number];

export function isScopedMasterTable(table: MasterTable): table is ScopedMasterTable {
  return (SCOPED_MASTER_TABLES as readonly string[]).includes(table);
}

/** カテゴリの scope（用途別の値の集合） */
export const CATEGORY_SCOPES = [
  "drawing-library/work",
  "drawing-library/customer",
] as const;
export type CategoryScope = (typeof CATEGORY_SCOPES)[number];

export const CATEGORY_SCOPE_LABELS: Record<CategoryScope, string> = {
  "drawing-library/work": "図面ライブラリ：自社発行",
  "drawing-library/customer": "図面ライブラリ：顧客図面",
};

export function isCategoryScope(value: unknown): value is CategoryScope {
  return typeof value === "string" && (CATEGORY_SCOPES as readonly string[]).includes(value);
}

/**
 * マスタごとの追加項目。
 * 汎用 CRUD がこの定義を読んで入力欄・一覧列・DB カラムを組み立てるため、
 * 項目を増やすときは本定義とスキーマのカラム追加のみで完結する。
 */
interface MasterFieldBase {
  /** DB のカラム名（camelCase） */
  key: string;
  label: string;
  /** 一覧に列として表示する */
  inList?: boolean;
  hint?: string;
}

/** 数値項目（DB は REAL） */
export interface MasterNumberField extends MasterFieldBase {
  kind?: "number";
  unit: string;
  /** 入力欄の刻み（既定 1） */
  step?: number;
}

/** 選択項目（DB は TEXT。登録された選択肢のみ受け付ける） */
export interface MasterChoiceField extends MasterFieldBase {
  kind: "choice";
  options: readonly { value: string; label: string }[];
}

/** 自由入力項目（DB は TEXT。呼称が現場ごとに異なる項目に使う） */
export interface MasterTextField extends MasterFieldBase {
  kind: "text";
  placeholder?: string;
}

export type MasterExtraField = MasterNumberField | MasterChoiceField | MasterTextField;

export function isChoiceField(field: MasterExtraField): field is MasterChoiceField {
  return field.kind === "choice";
}

export function isTextField(field: MasterExtraField): field is MasterTextField {
  return field.kind === "text" || (!("unit" in field) && !("options" in field));
}

/** 数値項目（`unit` を持つ。kind 省略時の既定） */
export function isNumberField(field: MasterExtraField): field is MasterNumberField {
  return "unit" in field && field.kind !== "choice" && field.kind !== "text";
}

export const MASTER_EXTRA_FIELDS: Partial<Record<MasterTable, readonly MasterExtraField[]>> = {
  m_machines: [
    {
      key: "pressCapacity",
      label: "加圧能力",
      unit: "kN",
      inList: true,
      hint: "ベンダーの最大加圧力。必要加圧力の判定に使用します。",
    },
    {
      key: "tableLength",
      label: "テーブル長",
      unit: "mm",
      inList: true,
      hint: "加工できる最大曲げ長さの目安。",
    },
    { key: "openHeight", label: "開口高さ", unit: "mm", hint: "ダイ上面からパンチ先端までの最大開き量。" },
    { key: "strokeLength", label: "ストローク", unit: "mm" },
  ],
  m_upper_tools: [
    {
      key: "punchType",
      kind: "choice",
      label: "型式",
      inList: true,
      options: PUNCH_TYPES.map((value) => ({ value, label: PUNCH_TYPE_LABELS[value] })),
      hint: "先に曲げたフランジをどれだけ逃がせるかが型式で変わります。干渉判定に使用します。",
    },
    {
      key: "tipRadius",
      label: "先端R",
      unit: "mm",
      step: 0.1,
      inList: true,
      hint: "パンチ先端の半径。内側曲げ R の下限に影響します。",
    },
    { key: "tipAngle", label: "先端角度", unit: "°", inList: true, hint: "88° / 60° / 30° など。" },
    {
      key: "bodyOffset",
      label: "本体張り出し（片側）",
      unit: "mm",
      step: 0.5,
      hint: "剣先の中心から、フランジが立つ側の本体面までの距離。左右対称の型なら全幅の半分です。全幅ではなく片側の値を入れてください。",
    },
    {
      key: "reliefHeight",
      label: "逃げ高さ",
      unit: "mm",
      step: 0.5,
      hint: "グースネックの逃げ空間の高さ。この高さまでのフランジを逃がせます。ストレートは空欄で構いません。",
    },
    {
      key: "reliefDepth",
      label: "逃げ奥行き",
      unit: "mm",
      step: 0.5,
      hint: "剣先の中心から、逃げがどこまで空いているかの距離。ストレートは空欄で構いません。",
    },
    { key: "toolHeight", label: "型高さ", unit: "mm", hint: "干渉判定・段取り確認に使用します。" },
    { key: "maxLoad", label: "耐圧", unit: "kN/m", hint: "金型が許容できる曲げ長さ 1m あたりの荷重。" },
    {
      key: "mountStandard",
      kind: "text",
      label: "取付規格",
      placeholder: "アマダ標準 など",
      hint: "シャンク・溝の呼称。中間板と規格が食い違うときだけ警告します。空欄なら突き合わせません。",
    },
  ],
  m_lower_tools: [
    {
      key: "vWidth",
      label: "V幅",
      unit: "mm",
      step: 0.1,
      inList: true,
      hint: "ダイの V 溝幅。金型選定・曲げ荷重の計算に使用する最重要項目です。",
    },
    { key: "dieAngle", label: "ダイ角度", unit: "°", inList: true, hint: "88° / 86° など。" },
    { key: "shoulderRadius", label: "肩R", unit: "mm", step: 0.1, hint: "ダイ肩の半径。" },
    { key: "toolHeight", label: "型高さ", unit: "mm" },
    { key: "maxLoad", label: "耐圧", unit: "kN/m" },
    {
      key: "mountStandard",
      kind: "text",
      label: "取付規格",
      placeholder: "アマダ標準 など",
      hint: "シャンク・溝の呼称。ダイホルダーと規格が食い違うときだけ警告します。空欄なら突き合わせません。",
    },
  ],
  m_tool_holders: [
    {
      key: "holderType",
      kind: "choice",
      label: "種別",
      inList: true,
      options: HOLDER_TYPES.map((value) => ({ value, label: HOLDER_TYPE_LABELS[value] })),
      hint: "種別で積む側が決まります。中間板はラムとパンチの間、ダイホルダーはテーブルとダイの間に入ります。",
    },
    {
      key: "toolHeight",
      label: "型高さ",
      unit: "mm",
      step: 0.1,
      inList: true,
      hint: "この 1 段ぶんの高さ。上下の合計と機械の開口高さを比べて、ワークを抜けるかを判定します。",
    },
    {
      key: "maxLoad",
      label: "耐圧",
      unit: "kN/m",
      hint: "スタックの中でもっとも低い耐圧が、その工程の実質耐圧になります。",
    },
    {
      key: "topOffset",
      label: "上面張り出し（片側）",
      unit: "mm",
      step: 0.5,
      hint: "ダイの中心から、ホルダー上面がどこまで張り出すか。下向きフランジとの干渉判定に使います。",
    },
    {
      key: "maxStack",
      label: "最大段数",
      unit: "段",
      inList: true,
      hint: "同じホルダーを何段まで積んでよいか。1 なら段積み不可として扱います。",
    },
    {
      key: "mountStandard",
      kind: "text",
      label: "取付規格",
      placeholder: "アマダ標準 など",
      hint: "上に載せる金型の規格と食い違うときだけ警告します。空欄なら突き合わせません。",
    },
  ],
};

export function masterExtraFields(table: MasterTable): readonly MasterExtraField[] {
  return MASTER_EXTRA_FIELDS[table] ?? [];
}

/**
 * 機械との対応（どの機械に付くか）を持つマスタ。
 * 対応機械を 1 台も登録していないレコードは「全機械で共用」とみなす。
 */
export const MACHINE_LINKED_MASTER_TABLES = [
  "m_upper_tools",
  "m_lower_tools",
  "m_tool_holders",
] as const;
export type MachineLinkedMasterTable = (typeof MACHINE_LINKED_MASTER_TABLES)[number];

export function isMachineLinkedMasterTable(
  table: MasterTable
): table is MachineLinkedMasterTable {
  return (MACHINE_LINKED_MASTER_TABLES as readonly string[]).includes(table);
}

/** 機械紐付けマスタ → 対応表の定義 */
export const MACHINE_LINK_TABLES: Record<
  MachineLinkedMasterTable,
  { table: string; column: string }
> = {
  m_upper_tools: { table: "m_upper_tool_machines", column: "upperToolId" },
  m_lower_tools: { table: "m_lower_tool_machines", column: "lowerToolId" },
  m_tool_holders: { table: "m_tool_holder_machines", column: "holderId" },
};

/** マスタ行の追加項目（数値項目は number、選択項目は string、未入力は null） */
export type MasterExtraValues = Record<string, number | string | null>;

export interface MasterRow {
  id: number;
  code: string;
  name: string;
  note: string | null;
  isActive: boolean;
  /** 値が scope を持つ場合のみ設定される（例：m_categories） */
  scope?: string | null;
  /** 追加項目を持つマスタのみ設定される（例：m_lower_tools の vWidth） */
  extra?: MasterExtraValues;
  /**
   * 対応する機械の ID（機械紐付けマスタのみ設定される）。
   * 空配列は「全機械で共用」を意味する。
   */
  machineIds?: number[];
  createdAt: string;
  updatedAt: string;
}

export interface MasterUpsertInput {
  code: string;
  name: string;
  note?: string | null;
  isActive?: boolean;
  /** scope を持つマスタは必須（例：m_categories） */
  scope?: string | null;
  /** 追加項目を持つマスタのみ利用される */
  extra?: MasterExtraValues;
  /** 対応する機械の ID（空配列は全機械で共用） */
  machineIds?: number[];
}

export interface MasterListParams {
  table: string;
  /** scope を持つマスタの絞り込み（指定しない場合は全件） */
  scope?: string | null;
}

export function isMasterTable(value: unknown): value is MasterTable {
  return typeof value === "string" && (MASTER_TABLES as readonly string[]).includes(value);
}
