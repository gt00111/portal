export const SCHEMA_VERSION = 6;

export const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS schema_meta (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  version INTEGER NOT NULL,
  updatedAt TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS app_settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updatedAt TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS m_customers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  code TEXT NOT NULL UNIQUE COLLATE NOCASE,
  name TEXT NOT NULL,
  note TEXT,
  isActive INTEGER NOT NULL DEFAULT 1,
  createdAt TEXT NOT NULL DEFAULT (datetime('now')),
  updatedAt TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS m_models (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  code TEXT NOT NULL UNIQUE COLLATE NOCASE,
  name TEXT NOT NULL,
  note TEXT,
  isActive INTEGER NOT NULL DEFAULT 1,
  createdAt TEXT NOT NULL DEFAULT (datetime('now')),
  updatedAt TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS m_part_numbers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  code TEXT NOT NULL UNIQUE COLLATE NOCASE,
  name TEXT NOT NULL,
  note TEXT,
  isActive INTEGER NOT NULL DEFAULT 1,
  createdAt TEXT NOT NULL DEFAULT (datetime('now')),
  updatedAt TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS m_component_names (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  code TEXT NOT NULL UNIQUE COLLATE NOCASE,
  name TEXT NOT NULL,
  note TEXT,
  isActive INTEGER NOT NULL DEFAULT 1,
  createdAt TEXT NOT NULL DEFAULT (datetime('now')),
  updatedAt TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS m_group_names (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  code TEXT NOT NULL UNIQUE COLLATE NOCASE,
  name TEXT NOT NULL,
  note TEXT,
  isActive INTEGER NOT NULL DEFAULT 1,
  createdAt TEXT NOT NULL DEFAULT (datetime('now')),
  updatedAt TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS m_user_names (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  code TEXT NOT NULL UNIQUE COLLATE NOCASE,
  name TEXT NOT NULL,
  note TEXT,
  isActive INTEGER NOT NULL DEFAULT 1,
  createdAt TEXT NOT NULL DEFAULT (datetime('now')),
  updatedAt TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS app_operators (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT NOT NULL UNIQUE COLLATE NOCASE,
  passwordHash TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('admin', 'editor', 'viewer')),
  processView TEXT NOT NULL DEFAULT 'both' CHECK (processView IN ('solidworks', 'cadmac', 'both')),
  userNameId INTEGER REFERENCES m_user_names(id) ON DELETE RESTRICT,
  isActive INTEGER NOT NULL DEFAULT 1,
  mustChangePassword INTEGER NOT NULL DEFAULT 0,
  createdAt TEXT NOT NULL DEFAULT (datetime('now')),
  updatedAt TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS m_skus (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  customerId INTEGER REFERENCES m_customers(id) ON DELETE RESTRICT,
  modelId INTEGER REFERENCES m_models(id) ON DELETE RESTRICT,
  partNumberId INTEGER REFERENCES m_part_numbers(id) ON DELETE RESTRICT,
  componentNameId INTEGER REFERENCES m_component_names(id) ON DELETE RESTRICT,
  drawingNumber TEXT,
  revision TEXT,
  note TEXT,
  isActive INTEGER NOT NULL DEFAULT 1,
  createdAt TEXT NOT NULL DEFAULT (datetime('now')),
  updatedAt TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE UNIQUE INDEX IF NOT EXISTS ux_m_skus_identity
  ON m_skus (customerId, modelId, partNumberId, componentNameId, drawingNumber, revision);

CREATE TABLE IF NOT EXISTS m_user_group_memberships (
  userNameId INTEGER NOT NULL UNIQUE REFERENCES m_user_names(id) ON DELETE CASCADE,
  groupNameId INTEGER NOT NULL REFERENCES m_group_names(id) ON DELETE RESTRICT,
  roleInGroup TEXT NOT NULL CHECK (roleInGroup IN ('member', 'group_admin')),
  createdAt TEXT NOT NULL DEFAULT (datetime('now')),
  updatedAt TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS m_user_app_grants (
  userNameId INTEGER NOT NULL REFERENCES m_user_names(id) ON DELETE CASCADE,
  appId TEXT NOT NULL,
  appRole TEXT NOT NULL CHECK (appRole IN ('admin', 'editor', 'viewer')),
  processView TEXT CHECK (processView IS NULL OR processView IN ('solidworks', 'cadmac', 'both')),
  createdAt TEXT NOT NULL DEFAULT (datetime('now')),
  updatedAt TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (userNameId, appId)
);

CREATE INDEX IF NOT EXISTS idx_user_group_memberships_group ON m_user_group_memberships(groupNameId);

CREATE TABLE IF NOT EXISTS m_categories (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  scope TEXT NOT NULL,
  code TEXT NOT NULL COLLATE NOCASE,
  name TEXT NOT NULL,
  note TEXT,
  isActive INTEGER NOT NULL DEFAULT 1,
  createdAt TEXT NOT NULL DEFAULT (datetime('now')),
  updatedAt TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (scope, code)
);

CREATE INDEX IF NOT EXISTS idx_m_categories_scope ON m_categories(scope);

CREATE TABLE IF NOT EXISTS app_audit_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  occurredAt TEXT NOT NULL DEFAULT (datetime('now')),
  username TEXT,
  userNameId INTEGER,
  appId TEXT,
  channel TEXT NOT NULL,
  action TEXT NOT NULL,
  targetType TEXT,
  targetId TEXT,
  result TEXT NOT NULL CHECK (result IN ('ok', 'fail')),
  errorMessage TEXT,
  detailJson TEXT
);

CREATE INDEX IF NOT EXISTS idx_app_audit_log_occurred ON app_audit_log(occurredAt);
CREATE INDEX IF NOT EXISTS idx_app_audit_log_username ON app_audit_log(username);
CREATE INDEX IF NOT EXISTS idx_app_audit_log_channel ON app_audit_log(channel);
CREATE INDEX IF NOT EXISTS idx_app_audit_log_result ON app_audit_log(result);

CREATE TABLE IF NOT EXISTS m_suppliers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  code TEXT NOT NULL UNIQUE COLLATE NOCASE,
  name TEXT NOT NULL,
  note TEXT,
  isActive INTEGER NOT NULL DEFAULT 1,
  createdAt TEXT NOT NULL DEFAULT (datetime('now')),
  updatedAt TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS m_procurement_lead_times (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  source_type TEXT NOT NULL CHECK (source_type IN ('inhouse', 'purchase', 'supplied')),
  supplier_id INTEGER REFERENCES m_suppliers(id) ON DELETE SET NULL,
  sku_id INTEGER REFERENCES m_skus(id) ON DELETE SET NULL,
  part_number TEXT,
  lead_time_days INTEGER NOT NULL DEFAULT 0,
  note TEXT,
  isActive INTEGER NOT NULL DEFAULT 1,
  createdAt TEXT NOT NULL DEFAULT (datetime('now')),
  updatedAt TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_procurement_lt_source ON m_procurement_lead_times(source_type);
CREATE INDEX IF NOT EXISTS idx_procurement_lt_supplier ON m_procurement_lead_times(supplier_id);

CREATE TABLE IF NOT EXISTS m_products (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  part_number TEXT NOT NULL UNIQUE COLLATE NOCASE,
  name TEXT NOT NULL,
  sku_id INTEGER REFERENCES m_skus(id) ON DELETE SET NULL,
  default_supplier_id INTEGER REFERENCES m_suppliers(id) ON DELETE SET NULL,
  note TEXT,
  isActive INTEGER NOT NULL DEFAULT 1,
  createdAt TEXT NOT NULL DEFAULT (datetime('now')),
  updatedAt TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS m_product_boms (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  product_id INTEGER NOT NULL REFERENCES m_products(id) ON DELETE CASCADE,
  revision TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'released', 'obsolete')),
  released_at TEXT,
  released_by_username TEXT,
  note TEXT,
  createdAt TEXT NOT NULL DEFAULT (datetime('now')),
  updatedAt TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (product_id, revision)
);

CREATE INDEX IF NOT EXISTS idx_m_product_boms_product ON m_product_boms(product_id);

CREATE TABLE IF NOT EXISTS m_product_bom_lines (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  product_bom_id INTEGER NOT NULL REFERENCES m_product_boms(id) ON DELETE CASCADE,
  line_kind TEXT NOT NULL CHECK (line_kind IN ('part', 'sub_assembly')),
  part_number TEXT NOT NULL,
  part_name TEXT NOT NULL,
  quantity REAL NOT NULL DEFAULT 1,
  source_type TEXT NOT NULL CHECK (source_type IN ('inhouse', 'purchase', 'supplied')),
  supplier_id INTEGER REFERENCES m_suppliers(id) ON DELETE SET NULL,
  sku_id INTEGER REFERENCES m_skus(id) ON DELETE SET NULL,
  ref_product_bom_id INTEGER REFERENCES m_product_boms(id) ON DELETE SET NULL,
  ref_part_number TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  note TEXT,
  createdAt TEXT NOT NULL DEFAULT (datetime('now')),
  updatedAt TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_m_product_bom_lines_bom ON m_product_bom_lines(product_bom_id);
CREATE INDEX IF NOT EXISTS idx_m_product_bom_lines_kind ON m_product_bom_lines(line_kind);
`;
