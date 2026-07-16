import { eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { cmsEditorInviteTable } from "@/db/schema";
import { AcceptInviteForm } from "@/components/accept-invite-form";

// Public "set your password" page for editor invites — the token in the URL
// is the credential (see lib/actions/editor-invite.ts).
export default async function AcceptInvitePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;

  // Expiry is evaluated by the DB clock (also keeps render pure —
  // react-hooks/purity forbids Date.now() during render).
  const invite = (
    await db
      .select({
        email: cmsEditorInviteTable.email,
        acceptedAt: cmsEditorInviteTable.acceptedAt,
        isExpired: sql<boolean>`${cmsEditorInviteTable.expiresAt} <= now()`,
      })
      .from(cmsEditorInviteTable)
      .where(eq(cmsEditorInviteTable.token, token))
      .limit(1)
  )[0];

  const problem = !invite || invite.acceptedAt
    ? "This invite link is invalid or was already used."
    : invite.isExpired
      ? "This invite link has expired. Ask an admin for a new one."
      : null;

  // Same studio-themed shell as the sign-in page (components/sign-in.tsx).
  return (
    <div className="studio flex min-h-screen items-center justify-center bg-background p-4 text-foreground md:p-6">
      <div className="w-full sm:max-w-[360px]">
        <div className="mb-6 text-center">
          <h1 className="font-serif text-2xl tracking-tight">
            Join Coze <span className="text-primary">CMS</span>
          </h1>
          {problem ? (
            <p className="mt-1 text-sm text-muted-foreground">{problem}</p>
          ) : (
            <p className="mt-1 text-sm text-muted-foreground">
              Set a password for <span className="font-medium text-foreground">{invite.email}</span> to start editing.
            </p>
          )}
        </div>
        {!problem && (
          <div className="rounded-xl border border-border bg-card p-6">
            <AcceptInviteForm token={token} />
          </div>
        )}
      </div>
    </div>
  );
}
