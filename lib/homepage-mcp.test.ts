import test from "node:test";
import assert from "node:assert/strict";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { homepageMcpResponse } from "./homepage-mcp-http.ts";
import { createHomepageMcpServer, type HomepageMcpBackend } from "./homepage-mcp-server.ts";
import { homepageProposalDigest, issueHomepageCheck, verifyHomepageCheck } from "./homepage-approval.ts";
import { boundedText } from "./homepage-http.ts";
import { allowedChatGptRedirect, isHomepageOAuthProtocolPath } from "./homepage-mcp-config.ts";

const secret = "test-only-approval-secret".repeat(3);
const proposal = { expectedCommit: "a".repeat(40), rationale: "Improve mobile spacing", edits: [{ path: "src/components/pages/HomePageV3.astro", find: "padding: 10px", replace: "padding: 12px" }], images: [] };

test("checked proposals bind the exact content, images, identity and expiry", () => {
  const digest = homepageProposalDigest(proposal);
  const token = issueHomepageCheck("editor:session", digest, secret, 1_000);
  assert.equal(verifyHomepageCheck(token, "editor:session", digest, secret, 2_000), true);
  for (const changed of [
    { ...proposal, expectedCommit: "b".repeat(40) },
    { ...proposal, rationale: "Different request" },
    { ...proposal, edits: [] },
    { ...proposal, images: [{ filename: "hero.png", bytes: new Uint8Array([1, 2]) }] },
  ]) assert.equal(verifyHomepageCheck(token, "editor:session", homepageProposalDigest(changed), secret, 2_000), false);
  assert.equal(verifyHomepageCheck(token, "other:session", digest, secret, 2_000), false);
  assert.equal(verifyHomepageCheck(token, "editor:other-session", digest, secret, 2_000), false);
  assert.equal(verifyHomepageCheck(token, "editor:session", digest, secret, 901_000), false);
  assert.equal(verifyHomepageCheck(`${token}x`, "editor:session", digest, secret, 2_000), false);
  assert.equal(verifyHomepageCheck(token, "editor:session", digest, "short", 2_000), false);
  const image = { ...proposal, images: [{ filename: "hero.png", bytes: new Uint8Array([1]) }] };
  assert.notEqual(homepageProposalDigest(image), homepageProposalDigest({ ...image, images: [{ filename: "hero.png", bytes: new Uint8Array([2]) }] }));
});

async function connected(canWrite = true) {
  const writes: unknown[] = [];
  const backend: HomepageMcpBackend = {
    getHomepage: async () => ({ commit: "a".repeat(40), files: [] }),
    getHomepageFile: async (path) => ({ path }),
    checkHomepageChange: async () => ({ ok: true, checkedChangeToken: "checked-token" }),
    applyHomepageChange: async (input) => { writes.push(input); return { status: "queued" }; },
    listHomepageChanges: async () => ({ items: [] }),
    getHomepageChange: async (changeId) => ({ changeId, build: { state: "failed" } }),
    undoHomepageChange: async (input) => { writes.push(input); return { status: "queued" }; },
  };
  const server = createHomepageMcpServer(backend, canWrite);
  const client = new Client({ name: "homepage-test", version: "1.0.0" });
  const [a, b] = InMemoryTransport.createLinkedPair();
  await server.connect(a); await client.connect(b);
  return { client, writes, backend, close: async () => { await client.close(); await server.close(); } };
}

test("MCP discovery exposes only the seven homepage operations with accurate write annotations", async () => {
  const c = await connected();
  try {
    const { tools } = await c.client.listTools();
    assert.deepEqual(tools.map((t) => t.name).sort(), ["getHomepage", "getHomepageFile", "checkHomepageChange", "applyHomepageChange", "listHomepageChanges", "getHomepageChange", "undoHomepageChange"].sort());
    for (const t of tools) assert.equal(t.annotations?.readOnlyHint, !["applyHomepageChange", "undoHomepageChange"].includes(t.name));
    assert.equal((await c.client.callTool({ name: "getHomepage", arguments: {} })).isError, undefined);
    assert.equal(c.writes.length, 0);
  } finally { await c.close(); }
});

test("MCP rejects apply without true confirmation and a checked proposal; undo also requires confirmation", async () => {
  const c = await connected();
  const { images: _images, ...body } = proposal;
  try {
    for (const args of [body, { ...body, confirmedByUser: false, checkedChangeToken: "token" }, { ...body, confirmedByUser: true }]) {
      assert.equal((await c.client.callTool({ name: "applyHomepageChange", arguments: args })).isError, true);
    }
    assert.equal((await c.client.callTool({ name: "undoHomepageChange", arguments: { changeId: "24660f54-5484-4ec4-8c21-7ea562095ab3", rationale: "Undo this" } })).isError, true);
    assert.equal(c.writes.length, 0);
    const result = await c.client.callTool({ name: "applyHomepageChange", arguments: { ...body, confirmedByUser: true, checkedChangeToken: "token" } });
    assert.equal(result.isError, undefined);
    assert.equal(c.writes.length, 1);
  } finally { await c.close(); }
});

test("read-only sessions cannot publish or undo, even with valid input", async () => {
  const c = await connected(false);
  const { images: _images, ...body } = proposal;
  try {
    assert.equal((await c.client.callTool({ name: "applyHomepageChange", arguments: { ...body, confirmedByUser: true, checkedChangeToken: "token" } })).isError, true);
    assert.equal((await c.client.callTool({ name: "undoHomepageChange", arguments: { changeId: "24660f54-5484-4ec4-8c21-7ea562095ab3", rationale: "Undo this", confirmedByUser: true } })).isError, true);
    assert.equal(c.writes.length, 0);
  } finally { await c.close(); }
});

test("MCP reports failed builds and sanitizes unexpected backend errors", async () => {
  const c = await connected();
  try {
    const result = await c.client.callTool({ name: "getHomepageChange", arguments: { changeId: "24660f54-5484-4ec4-8c21-7ea562095ab3" } });
    assert.deepEqual((result.structuredContent as { build: unknown }).build, { state: "failed" });
    c.backend.getHomepage = async () => { throw new Error("postgres://private-credential"); };
    const failed = await c.client.callTool({ name: "getHomepage", arguments: {} });
    assert.equal(failed.isError, true);
    assert.doesNotMatch(JSON.stringify(failed), /private-credential/);
  } finally { await c.close(); }
});

test("request size limit is enforced even without Content-Length", async () => {
  const request = new Request("https://cms.test/mcp", { method: "POST", body: "😀".repeat(25) });
  await assert.rejects(() => boundedText(request, 50), /too large/);
  assert.equal(await boundedText(new Request("https://cms.test/mcp", { method: "POST", body: "hello" }), 5), "hello");
});

test("OAuth callback and Origin exemptions cannot escape the intended routes", () => {
  assert.equal(allowedChatGptRedirect("https://chatgpt.com/connector_platform_oauth_redirect"), true);
  assert.equal(allowedChatGptRedirect("https://chatgpt.com/connector/oauth/abc-123"), true);
  for (const url of ["https://chatgpt.com.evil.test/connector_platform_oauth_redirect", "http://chatgpt.com/connector_platform_oauth_redirect", "https://chatgpt.com/connector_platform_oauth_redirect?next=https://evil.test", "https://evil@chatgpt.com/connector_platform_oauth_redirect", "javascript:alert(1)"]) assert.equal(allowedChatGptRedirect(url), false);
  assert.equal(isHomepageOAuthProtocolPath("/api/homepage-auth/oauth2/token"), true);
  for (const p of ["/api/homepage-auth/oauth2/consent", "/api/auth/sign-in/email", "/api/homepage-auth/oauth2/token/extra", "/api/cms/homepage"]) assert.equal(isHomepageOAuthProtocolPath(p), false);
});

test("real HTTP client initializes and calls tools across independent serverless requests", async () => {
  const c = await connected();
  const client = new Client({ name: "http-test", version: "1.0.0" });
  let requests = 0;
  const transport = new StreamableHTTPClientTransport(new URL("https://cms.test/mcp"), {
    fetch: async (url, init) => {
      requests++;
      const request = new Request(url, init);
      if (request.method !== "POST") return new Response(null, { status: 405 });
      return homepageMcpResponse(request, c.backend, true);
    },
  });
  try {
    await client.connect(transport);
    assert.equal((await client.listTools()).tools.length, 7);
    assert.equal((await client.callTool({ name: "getHomepage", arguments: {} })).isError, undefined);
    assert.ok(requests >= 3);
    assert.equal(c.writes.length, 0);
  } finally { await client.close(); await c.close(); }
});
