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

  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <div className="w-full max-w-sm space-y-6">
        <div className="space-y-2 text-center">
          <h1 className="text-xl font-semibold tracking-tight">Join Coze CMS</h1>
          {problem ? (
            <p className="text-sm text-muted-foreground">{problem}</p>
          ) : (
            <p className="text-sm text-muted-foreground">
              Set a password for <span className="font-medium text-foreground">{invite.email}</span> to start editing.
            </p>
          )}
        </div>
        {!problem && <AcceptInviteForm token={token} />}
      </div>
    </div>
  );
}
