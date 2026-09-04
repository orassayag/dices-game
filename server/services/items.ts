import db from '../db.js';
import type { CreateItemInput, UpdateItemInput } from '../../shared';

export function getAllItems() {
  return db.prepare('SELECT * FROM items ORDER BY created_at DESC').all();
}

export function getItemById(id: number) {
  return db.prepare('SELECT * FROM items WHERE id = ?').get(id);
}

export function createItem(input: CreateItemInput) {
  const result = db
    .prepare('INSERT INTO items (name, description) VALUES (?, ?)')
    .run(input.name, input.description ?? null);
  return db.prepare('SELECT * FROM items WHERE id = ?').get(Number(result.lastInsertRowid));
}

export function updateItem(id: number, input: UpdateItemInput) {
  db.prepare(
    `UPDATE items
     SET name = COALESCE(?, name),
         description = COALESCE(?, description),
         updated_at = datetime('now')
     WHERE id = ?`,
  ).run(input.name ?? null, input.description ?? null, id);
  return db.prepare('SELECT * FROM items WHERE id = ?').get(id);
}

export function deleteItem(id: number) {
  return db.prepare('DELETE FROM items WHERE id = ?').run(id);
}
