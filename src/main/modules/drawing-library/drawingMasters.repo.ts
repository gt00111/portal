import { getDrawingLibraryDb } from "@main/db/drawingLibraryConnection.js";

export interface NamedRow {
  id: number;
  name: string;
}

export function listCustomerCategories(): string[] {
  const db = getDrawingLibraryDb();
  const rows = db.prepare("SELECT name FROM customer_categories ORDER BY name COLLATE NOCASE").all() as {
    name: string;
  }[];
  const names = rows.map((r) => r.name);
  return names.sort((a, b) => a.localeCompare(b, "ja"));
}

export function listWorkCategories(): string[] {
  const db = getDrawingLibraryDb();
  const rows = db.prepare("SELECT name FROM work_categories ORDER BY name COLLATE NOCASE").all() as {
    name: string;
  }[];
  const names = rows.map((r) => r.name);
  return names.sort((a, b) => a.localeCompare(b, "ja"));
}

export function insertCustomerCategory(name: string): void {
  const db = getDrawingLibraryDb();
  db.prepare("INSERT INTO customer_categories (name) VALUES (?)").run(name.trim());
}

export function deleteCustomerCategory(name: string): void {
  const db = getDrawingLibraryDb();
  db.prepare("DELETE FROM customer_categories WHERE name = ?").run(name);
}

export function insertWorkCategory(name: string): void {
  const db = getDrawingLibraryDb();
  db.prepare("INSERT INTO work_categories (name) VALUES (?)").run(name.trim());
}

export function deleteWorkCategory(name: string): void {
  const db = getDrawingLibraryDb();
  db.prepare("DELETE FROM work_categories WHERE name = ?").run(name);
}

export function listCustomers(): NamedRow[] {
  const db = getDrawingLibraryDb();
  const rows = db.prepare("SELECT id, name FROM customers").all() as NamedRow[];
  return rows.sort((a, b) => a.name.localeCompare(b.name, "ja"));
}

export function insertCustomer(name: string): NamedRow {
  const db = getDrawingLibraryDb();
  const r = db.prepare("INSERT INTO customers (name) VALUES (?)").run(name.trim());
  const id = Number(r.lastInsertRowid);
  return db.prepare("SELECT id, name FROM customers WHERE id = ?").get(id) as NamedRow;
}

export function deleteCustomer(id: number): void {
  const db = getDrawingLibraryDb();
  db.prepare("DELETE FROM customers WHERE id = ?").run(id);
}

export function listModels(): NamedRow[] {
  const db = getDrawingLibraryDb();
  const rows = db.prepare("SELECT id, name FROM models").all() as NamedRow[];
  return rows.sort((a, b) => a.name.localeCompare(b.name, "ja"));
}

export function insertModel(name: string): NamedRow {
  const db = getDrawingLibraryDb();
  const r = db.prepare("INSERT INTO models (name) VALUES (?)").run(name.trim());
  const id = Number(r.lastInsertRowid);
  return db.prepare("SELECT id, name FROM models WHERE id = ?").get(id) as NamedRow;
}

export function deleteModel(id: number): void {
  const db = getDrawingLibraryDb();
  db.prepare("DELETE FROM models WHERE id = ?").run(id);
}

export function listProducts(): NamedRow[] {
  const db = getDrawingLibraryDb();
  const rows = db.prepare("SELECT id, name FROM products").all() as NamedRow[];
  return rows.sort((a, b) => a.name.localeCompare(b.name, "ja"));
}

export function insertProduct(name: string): NamedRow {
  const db = getDrawingLibraryDb();
  const r = db.prepare("INSERT INTO products (name) VALUES (?)").run(name.trim());
  const id = Number(r.lastInsertRowid);
  return db.prepare("SELECT id, name FROM products WHERE id = ?").get(id) as NamedRow;
}

export function deleteProduct(id: number): void {
  const db = getDrawingLibraryDb();
  db.prepare("DELETE FROM products WHERE id = ?").run(id);
}
