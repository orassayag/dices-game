import type { CreateItemInput, Item } from '../../shared';

export async function getItems(): Promise<Item[]> {
  const res = await fetch('/api/items');
  if (!res.ok) throw new Error(`Failed to fetch items: ${res.status}`);
  return res.json() as Promise<Item[]>;
}

export async function createItem(input: CreateItemInput): Promise<Item> {
  const res = await fetch('/api/items', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  if (!res.ok) throw new Error(`Failed to create item: ${res.status}`);
  return res.json() as Promise<Item>;
}
