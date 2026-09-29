import { fail } from "./types.ts";

export async function boundedText(request: Request, limit: number) {
  if (Number(request.headers.get("content-length")) > limit) fail("Request too large.", 413);
  if (!request.body) return "";
  const reader = request.body.getReader(); const parts: Uint8Array[] = []; let total = 0;
  for (;;) {
    const { done, value } = await reader.read(); if (done) break;
    total += value.length;
    if (total > limit) { await reader.cancel(); fail("Request too large.", 413); }
    parts.push(value);
  }
  return Buffer.concat(parts).toString("utf8");
}
