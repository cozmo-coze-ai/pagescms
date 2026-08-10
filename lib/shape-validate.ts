/**
 * Structural validation for guest-page saves: the coze_client layout locks
 * the shape of each guest-page document, so a save may only change string
 * values and grow/shrink arrays — never add, remove or rename keys, and
 * never change a leaf's type. `assertSameShape` enforces exactly that.
 *
 * Array items are validated against the *union* of keys across the existing
 * items, not just item[0]: real data has optional per-item fields (e.g. a
 * door-code row's `note` appears only on some doors). An item must carry
 * every key common to all existing items (required), may carry any key that
 * appears on some existing item (optional), and may not introduce a key that
 * appears on none. Homogeneous arrays are unaffected (union === item[0]).
 *
 * Pure (only depends on createHttpError) so it can be unit-tested and shared
 * without importing the server content-store / fields graph.
 */

import { createHttpError } from "@/lib/api-error";

const isPlainObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

// From an array's existing items, derive the required key set (present on
// every object item), and a template object mapping each union key to a
// representative value (first seen) for type checking.
const analyzeArrayItems = (items: unknown[]) => {
  const objectItems = items.filter(isPlainObject);
  const template: Record<string, unknown> = {};
  const counts = new Map<string, number>();
  for (const item of objectItems) {
    for (const [key, value] of Object.entries(item)) {
      if (!(key in template)) template[key] = value;
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
  }
  const required = new Set(
    [...counts.entries()].filter(([, n]) => n === objectItems.length).map(([k]) => k),
  );
  return { objectItems, template, required };
};

// Validate one array item against the union template + required keys.
const assertArrayItem = (
  template: Record<string, unknown>,
  required: Set<string>,
  next: unknown,
  path: string,
) => {
  if (!isPlainObject(next))
    throw createHttpError(`Expected a group of fields at ${path || "(root)"}.`, 400);
  for (const key of Object.keys(next)) {
    if (!(key in template))
      throw createHttpError(`Unknown field "${path ? `${path}.` : ""}${key}".`, 400);
  }
  for (const key of required) {
    if (!(key in next))
      throw createHttpError(`Missing field "${path ? `${path}.` : ""}${key}".`, 400);
  }
  for (const key of Object.keys(next)) {
    assertSameShape(template[key], next[key], path ? `${path}.${key}` : key);
  }
};

// Throws with a readable path when `next` deviates from `current`'s shape.
export const assertSameShape = (current: unknown, next: unknown, path: string) => {
  if (typeof current === "string") {
    if (typeof next !== "string")
      throw createHttpError(`Expected text at ${path || "(root)"}.`, 400);
    return;
  }
  if (Array.isArray(current)) {
    if (!Array.isArray(next))
      throw createHttpError(`Expected a list at ${path || "(root)"}.`, 400);
    if (current.length === 0) return; // no template item to check against
    const { objectItems, template, required } = analyzeArrayItems(current);
    for (let i = 0; i < next.length; i++) {
      // Object-shaped items → union/required check; primitive items → strict.
      if (objectItems.length > 0) {
        assertArrayItem(template, required, next[i], `${path}[${i}]`);
      } else {
        assertSameShape(current[0], next[i], `${path}[${i}]`);
      }
    }
    return;
  }
  if (isPlainObject(current)) {
    if (!isPlainObject(next))
      throw createHttpError(`Expected a group of fields at ${path || "(root)"}.`, 400);
    const currentKeys = Object.keys(current);
    const nextKeys = new Set(Object.keys(next));
    for (const key of currentKeys) {
      if (!nextKeys.has(key))
        throw createHttpError(`Missing field "${path ? `${path}.` : ""}${key}".`, 400);
    }
    for (const key of nextKeys) {
      if (!currentKeys.includes(key))
        throw createHttpError(`Unknown field "${path ? `${path}.` : ""}${key}".`, 400);
    }
    for (const key of currentKeys) {
      assertSameShape(current[key], (next as Record<string, unknown>)[key], path ? `${path}.${key}` : key);
    }
    return;
  }
  // Non-string scalars (numbers/booleans) don't occur in guest-page dicts
  // today; if one appears, require exact type match so nothing silently morphs.
  if (typeof next !== typeof current)
    throw createHttpError(`Unexpected value type at ${path || "(root)"}.`, 400);
};
