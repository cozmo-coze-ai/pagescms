// Settings — your profile plus collaborator management, in one place inside
// the studio shell. Collaborators reuses the invite-only sign-up flow
// (lib/actions/editor-invite.ts + better-auth sign-up hook): an admin creates
// an invite (choosing Editor or Admin), the invitee opens the link, sets
// their own password, and gets an account with that role. Roles live on the
// user row in Postgres (lib/admin.ts); admins can promote/demote, force
// sign-out, and remove collaborators from here. Emails in ADMIN_EMAILS are
// bootstrap "Owners" managed only via the environment config.

import { desc } from "drizzle-orm";
import { KeyRound, UserPlus, Users } from "lucide-react";
import { db } from "@/db";
import { cmsEditorInviteTable, userTable } from "@/db/schema";
import { getServerSession } from "@/lib/session-server";
import { hasAdminAccess, getAdminEmails } from "@/lib/admin";
import { getBaseUrl } from "@/lib/base-url";
import { DocumentTitle } from "@/components/document-title";
import { AdminCreateCollaborator } from "@/components/admin-create-collaborator";
import { AdminEditorInvites } from "@/components/admin-editor-invites";
import { CollaboratorManager } from "@/components/collaborator-manager";
import { Profile } from "@/components/settings/profile";

async function Collaborators({ currentUserId }: { currentUserId: string }) {
  const adminEmails = getAdminEmails();
  const [users, invites] = await Promise.all([
    db
      .select({
        id: userTable.id,
        name: userTable.name,
        email: userTable.email,
        image: userTable.image,
        role: userTable.role,
        createdAt: userTable.createdAt,
      })
      .from(userTable)
      .orderBy(desc(userTable.createdAt))
      .limit(100),
    db
      .select()
      .from(cmsEditorInviteTable)
      .orderBy(desc(cmsEditorInviteTable.createdAt))
      .limit(50),
  ]);

  const collaborators = users.map((person) => ({
    id: person.id,
    name: person.name,
    email: person.email,
    image: person.image,
    role: person.role === "admin" ? ("admin" as const) : ("editor" as const),
    isBootstrapAdmin: adminEmails.has(person.email.trim().toLowerCase()),
    joinedAt: person.createdAt.toISOString(),
  }));

  const inviteRows = invites.map((invite) => ({
    id: invite.id,
    email: invite.email,
    role: invite.role,
    inviteUrl: `${getBaseUrl()}/sign-up/invite/${invite.token}`,
    expiresAt: invite.expiresAt.toISOString(),
    acceptedAt: invite.acceptedAt?.toISOString() ?? null,
    createdAt: invite.createdAt.toISOString(),
  }));

  return (
    <div className="grid items-start gap-6 lg:grid-cols-2">
      <section className="space-y-3 rounded-xl border border-border bg-card p-4">
        <header className="flex items-center gap-1.5 text-muted-foreground">
          <Users className="h-3.5 w-3.5" />
          <h3 className="text-[11px] font-semibold uppercase tracking-[0.08em]">
            Collaborators · {collaborators.length}
          </h3>
        </header>
        <CollaboratorManager
          collaborators={collaborators}
          currentUserId={currentUserId}
        />
      </section>

      <div className="space-y-6">
        <section className="space-y-3 rounded-xl border border-border bg-card p-4">
          <header className="flex items-center gap-1.5 text-muted-foreground">
            <KeyRound className="h-3.5 w-3.5" />
            <h3 className="text-[11px] font-semibold uppercase tracking-[0.08em]">
              Add a collaborator directly
            </h3>
          </header>
          <p className="text-xs text-muted-foreground">
            Create the account yourself with an email and password, then hand
            them the credentials. Editors can manage all content; admins can
            also manage collaborators.
          </p>
          <AdminCreateCollaborator />
        </section>

        <section className="space-y-3 rounded-xl border border-border bg-card p-4">
          <header className="flex items-center gap-1.5 text-muted-foreground">
            <UserPlus className="h-3.5 w-3.5" />
            <h3 className="text-[11px] font-semibold uppercase tracking-[0.08em]">
              Or invite by link
            </h3>
          </header>
          <p className="text-xs text-muted-foreground">
            Enter their email, pick a role, and share the invite link — they
            set their own password.
          </p>
          <AdminEditorInvites invites={inviteRows} />
        </section>
      </div>
    </div>
  );
}

export default async function CmsSettingsPage() {
  const session = await getServerSession();
  const user = session?.user;
  if (!user) throw new Error("User not found");
  const isAdmin = await hasAdminAccess(user);

  return (
    <div className="space-y-8">
      <DocumentTitle title="Settings" />

      <div>
        <h1 className="font-serif text-xl tracking-tight">Settings</h1>
        <p className="mt-0.5 text-xs text-muted-foreground">
          Your profile and who can edit cms.coze.care.
        </p>
      </div>

      <section className="max-w-screen-sm space-y-3">
        <h2 className="font-serif text-sm tracking-tight">Profile</h2>
        <Profile name={user.name} email={user.email} />
      </section>

      <section className="space-y-3">
        <h2 className="font-serif text-sm tracking-tight">Team</h2>
        {isAdmin ? (
          <Collaborators currentUserId={user.id} />
        ) : (
          <div className="rounded-xl border border-dashed border-border px-4 py-8 text-center">
            <p className="text-sm text-muted-foreground">
              Everyone here can edit all content. Ask an admin to invite new
              collaborators or manage the team.
            </p>
          </div>
        )}
      </section>
    </div>
  );
}
