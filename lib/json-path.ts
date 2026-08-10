/**
 * Tiny client-safe helpers for reading/updating deep values in guest-page
 * field trees. Paths are arrays of object keys and/or array indices, so the
 * same helpers work for "arrival.checkInValue" and "packages[0].price".
 */

export type Json = string | number | boolean | null | Json[] | { [key: string]: Json };

export type JsonPath = (string | number)[];

export const getAtPath = (root: Json | undefined, path: JsonPath): Json | undefined => {
  let node: Json | undefined = root;
  for (const segment of path) {
    if (node == null || typeof node !== "object") return undefined;
    if (Array.isArray(node)) {
      if (typeof segment !== "number" && !/^\d+$/.test(String(segment))) return undefined;
      node = node[Number(segment)];
    } else {
      node = (node as Record<string, Json>)[String(segment)];
    }
  }
  return node;
};

// Deep-clone a value with every string blanked — used to grow an array by
// cloning its first item as the template (shape validation requires every
// item to match item[0]'s shape) without carrying its content along.
export const blankStrings = (value: Json): Json => {
  if (typeof value === "string") return "";
  if (Array.isArray(value)) return value.map(blankStrings);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, blankStrings(v)]));
  }
  return value;
};

// Grow (append a blanked clone of item[0]) or shrink (drop from the end) the
// array at `path`. Returns the original doc when the resize isn't possible
// (missing/empty array, length < 1, no-op).
export const resizeArrayAtPath = (
  doc: Json,
  path: JsonPath,
  nextLength: number,
): Json => {
  const current = getAtPath(doc, path);
  if (!Array.isArray(current) || nextLength < 1 || nextLength === current.length) return doc;
  if (nextLength > current.length) {
    if (current.length === 0) return doc; // no template item to clone
    return setAtPath(doc, path, [...current, blankStrings(structuredClone(current[0]))]);
  }
  return setAtPath(doc, path, current.slice(0, nextLength));
};

// Immutable deep set: clones only the spine along `path`, leaves siblings
// shared. Returns the original root untouched if the path doesn't resolve
// (never invents keys — shape validation forbids new keys anyway).
export const setAtPath = (root: Json, path: JsonPath, value: Json): Json => {
  if (path.length === 0) return value;
  const [head, ...rest] = path;
  if (Array.isArray(root)) {
    const index = Number(head);
    if (!Number.isInteger(index) || index < 0 || index >= root.length) return root;
    const next = root.slice();
    next[index] = rest.length === 0 ? value : setAtPath(root[index], rest, value);
    return next;
  }
  if (root && typeof root === "object") {
    const key = String(head);
    if (!(key in root)) return root;
    const record = root as Record<string, Json>;
    return {
      ...record,
      [key]: rest.length === 0 ? value : setAtPath(record[key], rest, value),
    };
  }
  return root;
};
