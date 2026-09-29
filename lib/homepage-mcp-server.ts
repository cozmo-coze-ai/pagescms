import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod/v3";

// Keep the transport independent of database/Git implementations so the real
// MCP client can exercise protocol, scopes and confirmation gates in tests.
export interface HomepageMcpBackend {
  getHomepage(): Promise<unknown>;
  getHomepageFile(path: string): Promise<unknown>;
  checkHomepageChange(input: Record<string, unknown>): Promise<unknown>;
  applyHomepageChange(input: Record<string, unknown>): Promise<unknown>;
  listHomepageChanges(): Promise<unknown>;
  getHomepageChange(id: string): Promise<unknown>;
  undoHomepageChange(input: { changeId: string; rationale: string; confirmedByUser: true }): Promise<unknown>;
}

const proposal = {
  expectedCommit: z.string().regex(/^[a-f0-9]{40}$/),
  rationale: z.string().trim().min(5).max(3000),
  edits: z.array(z.union([
    z.object({ path: z.string(), content: z.string().max(80_000) }).strict(),
    z.object({ path: z.string(), find: z.string().min(1).max(20_000), replace: z.string().max(40_000) }).strict(),
  ])).max(30).default([]),
  openaiFileIdRefs: z.array(z.object({ download_link: z.string().url(), name: z.string().optional(), id: z.string().optional(), mime_type: z.string().optional() }).strict()).max(5).default([]),
  imageFilenames: z.array(z.string().max(150)).max(5).default([]),
};

export function createHomepageMcpServer(backend: HomepageMcpBackend, canWrite: boolean) {
  const server = new McpServer({ name: "coze-homepage-editor", version: "1.0.0" }, {
    instructions: "Read the current homepage and affected files first. Check one exact proposal, show its summary, and ask 'Deploy this to www.coze.care now?' Apply only after explicit user approval using the returned checkedChangeToken. Recheck changed proposals. Confirm undo separately. Only build.state=live proves deployment. Homepage only; no itinerary, booking, payment or guest-message access.",
  });
  const read = { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false };
  const write = { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: true };
  const securitySchemes = [{ type: "oauth2", scopes: ["homepage:read"] }];
  const respond = async (fn: () => Promise<unknown>, mutates = false) => {
    if (mutates && !canWrite) return { isError: true, content: [{ type: "text" as const, text: "Read-only access. An editor account and homepage:write permission are required." }] };
    try {
      const value = await fn();
      const data = value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : { result: value };
      return { content: [{ type: "text" as const, text: JSON.stringify(data) }], structuredContent: data };
    } catch (error) {
      // Only application errors with an HTTP status are safe to return. Driver
      // errors can contain SQL, credentials or private records.
      const safe = error instanceof Error && "status" in error;
      return { isError: true, content: [{ type: "text" as const, text: safe ? error.message : "The homepage request failed. Please try again or ask the COZE admin to check the connection." }] };
    }
  };
  const metadata = { securitySchemes };
  server.registerTool("getHomepage", { description: "Read the current COZE homepage commit, editable files, images and rules. Never edits anything.", inputSchema: {}, annotations: read, _meta: metadata }, () => respond(() => backend.getHomepage()));
  server.registerTool("getHomepageFile", { description: "Read one allowed homepage file and its current commit before proposing edits.", inputSchema: { path: z.string().max(200) }, annotations: read, _meta: metadata }, ({ path }) => respond(() => backend.getHomepageFile(path)));
  server.registerTool("checkHomepageChange", { description: "Validate an exact homepage proposal without publishing. Returns a summary and checkedChangeToken bound to this user, content, images and commit for 15 minutes. Show the summary and ask for explicit approval.", inputSchema: proposal, annotations: read, _meta: metadata }, (input) => respond(() => backend.checkHomepageChange(input)));
  const writeMeta = { securitySchemes: [{ type: "oauth2", scopes: ["homepage:read", "homepage:write"] }] };
  server.registerTool("applyHomepageChange", { description: "Publish ONLY the exact checked homepage proposal after the user explicitly approves it in this chat. Requires its checkedChangeToken and confirmedByUser:true. A commit is not proof the site is live.", inputSchema: { ...proposal, checkedChangeToken: z.string().min(1).max(2000), confirmedByUser: z.literal(true) }, annotations: write, _meta: writeMeta }, (input) => respond(() => backend.applyHomepageChange(input), true));
  server.registerTool("listHomepageChanges", { description: "List recent homepage changes to identify what was changed or the exact change to undo.", inputSchema: {}, annotations: read, _meta: metadata }, () => respond(() => backend.listHomepageChanges()));
  server.registerTool("getHomepageChange", { description: "Read change and deployment status. Say live only if build.state is live; report failures accurately.", inputSchema: { changeId: z.string().uuid() }, annotations: read, _meta: metadata }, ({ changeId }) => respond(() => backend.getHomepageChange(changeId)));
  server.registerTool("undoHomepageChange", { description: "Undo one identified homepage change ONLY after fresh explicit approval from the user. Creates a new commit; later conflicting changes block undo.", inputSchema: { changeId: z.string().uuid(), rationale: z.string().trim().min(3).max(1000), confirmedByUser: z.literal(true) }, annotations: write, _meta: writeMeta }, (input) => respond(() => backend.undoHomepageChange(input), true));
  return server;
}
