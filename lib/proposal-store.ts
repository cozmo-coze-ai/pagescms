import "server-only";

import { desc, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { cmsProposalTable, cmsProposalVersionTable } from "@/db/schema";
import { createHttpError } from "@/lib/api-error";
import { createItinerary, getItinerary, saveItinerary } from "@/lib/content-store";

const itineraryContent = z.object({
  title: z.string().trim().min(1).max(200),
  slug: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  category: z.enum(["tour", "experience"]),
  tag: z.string().max(80).nullable().optional(),
  tagColor: z.string().max(30).nullable().optional(),
  cover: z.string().max(500).nullable().optional(),
  published: z.literal(true).optional(),
  body: z.string().max(100_000),
}).strict();

const designContent = z.object({
  section: z.string().trim().min(1).max(100),
  request: z.string().trim().min(10).max(10_000),
  referenceUrls: z.array(z.string().url().max(1000)).max(10).default([]),
}).strict();

export const proposalInput = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("itinerary"), content: itineraryContent, rationale: z.string().trim().min(1).max(3000) }),
  z.object({ kind: z.literal("homepage_design"), content: designContent, rationale: z.string().trim().min(1).max(3000) }),
]);

export type ProposalInput = z.infer<typeof proposalInput>;

function parseProposalInput(input: unknown): ProposalInput {
  const parsed = proposalInput.safeParse(input);
  if (!parsed.success) throw createHttpError(parsed.error.issues.map((issue) => issue.message).join("; "), 400);
  return parsed.data;
}

export async function createProposal(input: unknown, author: string) {
  const parsed = parseProposalInput(input);
  const target = parsed.kind === "itinerary" ? parsed.content.slug : null;
  const current = target ? await getItinerary(target) : null;
  const id = crypto.randomUUID();
  await db.transaction(async (tx) => {
    await tx.insert(cmsProposalTable).values({
      id, kind: parsed.kind, target, baseUpdatedAt: current?.row.updatedAt ?? null,
    });
    await tx.insert(cmsProposalVersionTable).values({
      proposalId: id, version: 1, content: parsed.content,
      rationale: parsed.rationale, author,
    });
    if (current) {
      await tx.insert(cmsProposalVersionTable).values({
        proposalId: id, version: 0, content: current.contentObject,
        rationale: "Content before this change", author: "COZE CMS",
      });
    }
  });
  return getProposal(id);
}

export async function listProposals() {
  return db.select().from(cmsProposalTable).orderBy(desc(cmsProposalTable.updatedAt));
}

export async function getProposal(id: string) {
  const [proposal] = await db.select().from(cmsProposalTable).where(eq(cmsProposalTable.id, id)).limit(1);
  if (!proposal) throw createHttpError("Proposal not found.", 404);
  const versions = await db.select().from(cmsProposalVersionTable)
    .where(eq(cmsProposalVersionTable.proposalId, id))
    .orderBy(desc(cmsProposalVersionTable.version));
  return { ...proposal, versions };
}

export async function addProposalVersion(id: string, input: unknown, author: string) {
  const parsed = parseProposalInput(input);
  await db.transaction(async (tx) => {
    const [proposal] = await tx.select().from(cmsProposalTable)
      .where(eq(cmsProposalTable.id, id)).for("update").limit(1);
    if (!proposal) throw createHttpError("Proposal not found.", 404);
    if (proposal.status !== "draft") throw createHttpError("Only draft proposals can be revised.", 409);
    if (proposal.kind !== parsed.kind) throw createHttpError("Proposal kind cannot change.", 400);
    if (parsed.kind === "itinerary" && proposal.target !== parsed.content.slug) {
      throw createHttpError("Itinerary slug cannot change between versions.", 400);
    }
    const [latest] = await tx.select({ version: cmsProposalVersionTable.version })
      .from(cmsProposalVersionTable).where(eq(cmsProposalVersionTable.proposalId, id))
      .orderBy(desc(cmsProposalVersionTable.version)).limit(1);
    await tx.insert(cmsProposalVersionTable).values({
      proposalId: id, version: (latest?.version ?? 0) + 1,
      content: parsed.content, rationale: parsed.rationale, author,
    });
    await tx.update(cmsProposalTable).set({ updatedAt: new Date() })
      .where(eq(cmsProposalTable.id, id));
  });
  return getProposal(id);
}

// Called by the Admin review route or the authenticated direct-change route.
export async function publishProposal(id: string, userId: string, expectedVersion: number) {
  const proposal = await getProposal(id);
  if (proposal.status !== "draft") throw createHttpError("Proposal is not a draft.", 409);
  if (proposal.kind !== "itinerary") {
    throw createHttpError("Homepage design requires a reviewed code change; it cannot be published from CMS.", 409);
  }
  const latest = proposal.versions[0];
  if (!latest || latest.version !== expectedVersion) throw createHttpError("A newer proposal version exists. Review it before publishing.", 409);
  const content = itineraryContent.parse(latest.content);
  const current = await getItinerary(content.slug);
  if ((current?.row.updatedAt.toISOString() ?? null) !== (proposal.baseUpdatedAt?.toISOString() ?? null)) {
    throw createHttpError("The live itinerary changed since this proposal was created. Create a new proposal from the current version.", 409);
  }
  const fullContent = { ...content, published: true };
  if (current) await saveItinerary(content.slug, fullContent, userId);
  else await createItinerary(fullContent, userId);
  await db.update(cmsProposalTable).set({ status: "published", publishedAt: new Date(), publishedBy: userId, updatedAt: new Date() })
    .where(eq(cmsProposalTable.id, id));
  return getProposal(id);
}
