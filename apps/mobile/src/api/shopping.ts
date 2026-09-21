import { request } from './request';

/**
 * The shopping list, and what it means to add to it.
 *
 * "The active list" is defined once, here, because two screens need to agree on
 * it: the shopping screen shows only the most recent list, so a recipe that
 * added to any other one would look like it had done nothing at all.
 */

export interface ShoppingItem {
  id: string;
  name: string;
  quantity: number;
  unit: string;
  category: string;
  isCompleted: boolean;
  recipeId?: string;
  recipeName?: string;
}

export interface ShoppingListData {
  id: string;
  name?: string;
  isCompleted?: boolean;
  items: ShoppingItem[];
}

/** An item being created: no id, which is what tells the API to insert it. */
export interface NewShoppingItem {
  name: string;
  quantity: number;
  unit: string;
  category: string;
  priority: string;
  isCompleted: boolean;
  recipeId?: string;
  recipeName?: string;
}

/** The most recent list, or null when the user has never had one. */
export async function loadActiveList(): Promise<ShoppingListData | null> {
  const data = await request<{ shoppingLists?: ShoppingListData[] }>('/shopping-lists?limit=1');
  return data?.shoppingLists?.[0] ?? null;
}

/** Tick or untick an item. The whole item goes back, as the upsert expects. */
export async function setItemCompleted(
  listId: string,
  item: ShoppingItem,
  isCompleted: boolean
): Promise<ShoppingListData> {
  return request<ShoppingListData>(`/shopping-lists/${listId}/items`, {
    method: 'PATCH',
    body: JSON.stringify({ items: [{ ...item, isCompleted }] }),
  });
}

const key = (name: string, unit: string) =>
  `${name.trim().toLowerCase()}|${unit.trim().toLowerCase()}`;

/**
 * Add items to the active list in one write.
 *
 * Three cases, decided against the list we just read so it costs no extra
 * request: an item that is not there is created, one that is there but ticked
 * off is un-ticked because it is needed again, and one already waiting is left
 * alone. The resulting array mixes elements with and without ids, which is
 * exactly what the endpoint's upsert handles.
 *
 * Returns null when everything was already on the list, so the caller can say
 * so rather than claiming to have added nothing.
 */
export async function addItemsToActiveList(
  items: NewShoppingItem[],
  listName: string
): Promise<{ list: ShoppingListData; added: number } | null> {
  if (!items.length) return null;

  const active = await loadActiveList();

  // A finished shop is not somewhere to append: the user would never see it.
  if (!active || active.isCompleted) {
    const list = await request<ShoppingListData>('/shopping-lists', {
      method: 'POST',
      body: JSON.stringify({ name: listName, items }),
    });
    return { list, added: items.length };
  }

  const existing = new Map(active.items.map(item => [key(item.name, item.unit), item]));
  const payload: unknown[] = [];
  let added = 0;

  for (const item of items) {
    const match = existing.get(key(item.name, item.unit));
    if (!match) {
      payload.push(item);
      added++;
    } else if (match.isCompleted) {
      payload.push({ ...match, isCompleted: false });
      added++;
    }
  }

  if (!payload.length) return null;

  const list = await request<ShoppingListData>(`/shopping-lists/${active.id}/items`, {
    method: 'PATCH',
    body: JSON.stringify({ items: payload }),
  });

  return { list, added };
}
