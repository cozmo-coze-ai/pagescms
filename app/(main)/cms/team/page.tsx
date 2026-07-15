// Team — who can edit cms.coze.care and inviting new editors. Reuses the
// invite-only sign-up flow (lib/actions/editor-invite.ts + better-auth
// sign-up hook): an admin creates an invite, the editor opens the link,
// sets their own password, and gets a full editor account in the database.
// Permissions are flat — every account can edit all content — so there is
// no role picker; only admins (ADMIN_EMAILS) can manage the team.

import { desc } from "drizzle-orm";
import { UserPlus, Users } from "lucide-react";
import { db } from "@/db";
import { cmsEditorInviteTable, userTable } from "@/db/schema";
import { getServerSession } from "@/lib/session-server";
import { hasAdminAccess, getAdminEmails } from "@/lib/admin";
import { getBaseUrl } from "@/lib/base-url";
import { getInitialsFromName } from "@/lib/utils/avatar";
import { DocumentTitle } from "@/components/document-title";
import { AdminEditorInvites } from "@/components/admin-editor-invites";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import type { User } from "@/types/user";

const joinedLabel = (value: Date) =>
  value.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });

export default async function TeamPage() {
  const session = await getServerSession();
  const isAdmin = hasAdminAccess(session?.user as User | undefined);

  if (!isAdmin) {
    return (
      <div className="rounded-xl border border-dashed border-border py-16 text-center">
        <p className="font-serif text-lg">Admins only</p>
        <p className="mx-auto mt-1 max-w-sm text-sm text-muted-foreground">
          Ask an admin to invite editors or manage the team.
        </p>
      </div>
    );
  }

  const adminEmails = getAdminEmails();
  const [editors, invites] = await Promise.all([
    db
      .select({
        id: userTable.id,
        name: userTable.name,
        email: userTable.email,
        image: userTable.image,
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

  const inviteRows = invites.map((invite) => ({
    id: invite.id,
    email: invite.email,
    inviteUrl: `${getBaseUrl()}/sign-up/invite/${invite.token}`,
    expiresAt: invite.expiresAt.toISOString(),
    acceptedAt: invite.acceptedAt?.toISOString() ?? null,
    createdAt: invite.createdAt.toISOString(),
  }));

  return (
    <div className="space-y-6">
      <DocumentTitle title="Team" />

      <div>
        <h1 className="font-serif text-xl tracking-tight">Team</h1>
        <p className="mt-0.5 text-xs text-muted-foreground">
          Everyone here can edit all content on cms.coze.care.
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="space-y-3 rounded-xl border border-border bg-card p-4">
          <header className="flex items-center gap-1.5 text-muted-foreground">
            <Users className="h-3.5 w-3.5" />
            <h2 className="text-[11px] font-semibold uppercase tracking-[0.08em]">
              Editors · {editors.length}
            </h2>
          </header>
          <ul className="divide-y divide-border">
            {editors.map((editor) => (
              <li key={editor.id} className="flex items-center gap-3 py-2.5">
                <Avatar className="h-8 w-8">
                  {editor.image && <AvatarImage src={editor.image} alt="" />}
                  <AvatarFallback className="bg-secondary text-xs">
                    {getInitialsFromName(editor.name || editor.email)}
                  </AvatarFallback>
                </Avatar>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium leading-tight">
                    {editor.name || editor.email}
                  </p>
                  <p className="truncate text-xs text-muted-foreground">{editor.email}</p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  {adminEmails.has(editor.email.trim().toLowerCase()) && (
                    <span className="studio-pill">Admin</span>
                  )}
                  <span className="hidden text-[11px] text-muted-foreground sm:block">
                    Joined {joinedLabel(editor.createdAt)}
                  </span>
                </div>
              </li>
            ))}
          </ul>
        </section>

        <section className="space-y-3 self-start rounded-xl border border-border bg-card p-4">
          <header className="flex items-center gap-1.5 text-muted-foreground">
            <UserPlus className="h-3.5 w-3.5" />
            <h2 className="text-[11px] font-semibold uppercase tracking-[0.08em]">
              Invite an editor
            </h2>
          </header>
          <p className="text-xs text-muted-foreground">
            Enter their email to create an invite link. They open it, set a
            password, and can start editing right away.
          </p>
          <AdminEditorInvites invites={inviteRows} />
        </section>
      </div>
    </div>
  );
}
