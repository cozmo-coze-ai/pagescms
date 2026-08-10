/**
 * Tiny client-safe helpers for reading/updating deep values in guest-page
 * field trees. Paths are arrays of object keys and/or array indices, so the
 * same helpers work for "arrival.checkInValue" and "packages[0].price".
 */

// Single shared JSON type across the CMS (defined in lib/field-format.ts) so
// values flow between the sheets, the registry and these path helpers without
// structural-mismatch casts.
export type { Json } from "@/lib/field-format";
import type { Json } from "@/lib/field-format";

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

// Immutable deep set that CREATES intermediate objects along a string-key
// path — for sparse override documents that start as {} and grow one field at
// a time. Only object nesting is created (override rows are string leaves
// reached through object keys); an existing non-object at a step is replaced.
export const setAtPathCreate = (root: Json, path: JsonPath, value: Json): Json => {
  if (path.length === 0) return value;
  const [head, ...rest] = path;
  const key = String(head);
  const base: Record<string, Json> =
    root && typeof root === "object" && !Array.isArray(root)
      ? (root as Record<string, Json>)
      : {};
  return {
    ...base,
    [key]: rest.length === 0 ? value : setAtPathCreate(base[key] ?? {}, rest, value),
  };
};

// Immutable delete of the key at `path`, pruning any ancestor object left
// empty — reverting the last override on a branch collapses it back so an
// all-reverted document returns to {} (fully inherit from the shared manual).
export const deleteAtPath = (root: Json, path: JsonPath): Json => {
  if (path.length === 0 || !root || typeof root !== "object" || Array.isArray(root)) return root;
  const [head, ...rest] = path;
  const key = String(head);
  const record = root as Record<string, Json>;
  if (!(key in record)) return root;
  if (rest.length === 0) {
    const { [key]: _removed, ...remaining } = record;
    return remaining;
  }
  const child = deleteAtPath(record[key], rest);
  const childEmpty =
    child && typeof child === "object" && !Array.isArray(child) && Object.keys(child).length === 0;
  if (childEmpty) {
    const { [key]: _removed, ...remaining } = record;
    return remaining;
  }
  return { ...record, [key]: child };
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
