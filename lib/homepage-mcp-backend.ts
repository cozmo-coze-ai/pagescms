import "server-only";
import { createHttpError } from "@/lib/api-error";
import { getHomepageSnapshot, getHomepageFileSnapshot } from "@/lib/homepage-read";
import { applyHomepageChange, checkHomepageChange, getHomepageChange, listHomepageChanges, undoHomepageChange } from "@/lib/homepage-changes";
import { parseHomepageChange } from "@/lib/homepage-request";
import { homepageProposalDigest, issueHomepageCheck, verifyHomepageCheck } from "@/lib/homepage-approval";
import type { HomepageMcpBackend } from "@/lib/homepage-mcp-server";

export function homepageMcpBackend(actor: { userId: string; email: string; sessionId: string }): HomepageMcpBackend {
  const subject = `${actor.userId}:${actor.sessionId}`;
  const signingKey = () => process.env.AUTH_SECRET || process.env.BETTER_AUTH_SECRET || "";
  const parse = (input: Record<string, unknown>, confirmation: boolean) => parseHomepageChange(new Request("https://cms.invalid/check", {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(input),
  }), { requireConfirmation: confirmation });
  const identity = { actorId: actor.userId, author: `ChatGPT (${actor.email})` };
  return {
    getHomepage: getHomepageSnapshot,
    getHomepageFile: getHomepageFileSnapshot,
    async checkHomepageChange(input) {
      const parsed = await parse(input, false);
      const checked = await checkHomepageChange(parsed);
      return { ...checked, checkedChangeToken: issueHomepageCheck(subject, homepageProposalDigest(parsed), signingKey()),
        next: "Show this summary, then ask: Deploy this to www.coze.care now? Only apply this exact proposal after an explicit yes. The check expires in 15 minutes." };
    },
    async applyHomepageChange(input) {
      const { checkedChangeToken, ...proposal } = input;
      const parsed = await parse(proposal, true);
      if (typeof checkedChangeToken !== "string" || !verifyHomepageCheck(checkedChangeToken, subject, homepageProposalDigest(parsed), signingKey())) {
        throw createHttpError("This proposal needs a fresh check and approval. Call checkHomepageChange, show its summary, and ask the user to confirm again.", 428);
      }
      return { ...await applyHomepageChange({ ...parsed, ...identity }), next: "Poll getHomepageChange until build.state is live or failed. A commit alone is not proof of deployment." };
    },
    listHomepageChanges: async () => ({ items: await listHomepageChanges() }),
    getHomepageChange,
    async undoHomepageChange(input) {
      if (input.confirmedByUser !== true) throw createHttpError("Ask the user to confirm this undo first.", 428);
      return { ...await undoHomepageChange({ id: input.changeId, rationale: input.rationale, ...identity }), next: "Check the new changeId until build.state is live or failed." };
    },
  };
}
