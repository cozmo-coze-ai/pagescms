"use client";

// The collaborator list on /cms/settings, with admin actions per row:
// promote/demote (role lives on the user row in Postgres), force sign-out,
// and remove. The server actions enforce the real guard rails; the UI just
// hides actions that can never succeed (yourself, bootstrap admins).

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { MoreHorizontal, Shield, ShieldOff } from "lucide-react";
import { getInitialsFromName } from "@/lib/utils/avatar";
import { removeCollaborator, updateCollaboratorRole } from "@/lib/actions/collaborators";
import { logoutUserSessions } from "@/lib/actions/admin";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

type CollaboratorRole = "admin" | "editor" | "viewer";

type CollaboratorRow = {
  id: string;
  name: string;
  email: string;
  image: string | null;
  role: CollaboratorRole;
  isBootstrapAdmin: boolean;
  joinedAt: string;
};

const ROLE_LABELS: Record<CollaboratorRole, string> = {
  admin: "Admin",
  editor: "Editor",
  viewer: "Viewer",
};

// Roles an admin can switch someone to, in display order.
const ASSIGNABLE_ROLES: CollaboratorRole[] = ["admin", "editor", "viewer"];

const joinedLabel = (iso: string) =>
  new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });

export function CollaboratorManager({
  collaborators,
  currentUserId,
}: {
  collaborators: CollaboratorRow[];
  currentUserId: string;
}) {
  const router = useRouter();
  const [pendingRemove, setPendingRemove] = useState<CollaboratorRow | null>(null);

  const run = async (
    action: () => Promise<{ error?: string; success?: boolean }>,
    successMessage: string,
  ) => {
    const result = await action();
    if (result?.error) {
      toast.error(result.error);
      return;
    }
    toast.success(successMessage);
    router.refresh();
  };

  const handleRemove = async () => {
    if (!pendingRemove) return;
    const target = pendingRemove;
    setPendingRemove(null);
    await run(
      () => removeCollaborator(target.id),
      `Removed ${target.name || target.email}.`,
    );
  };

  return (
    <>
      <ul className="divide-y divide-border">
        {collaborators.map((person) => {
          const isSelf = person.id === currentUserId;
          const canManage = !isSelf && !person.isBootstrapAdmin;
          return (
            <li key={person.id} className="flex items-center gap-3 py-2.5">
              <Avatar className="h-8 w-8">
                {person.image && <AvatarImage src={person.image} alt="" />}
                <AvatarFallback className="bg-secondary text-xs">
                  {getInitialsFromName(person.name || person.email)}
                </AvatarFallback>
              </Avatar>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium leading-tight">
                  {person.name || person.email}
                  {isSelf && <span className="text-muted-foreground"> (you)</span>}
                </p>
                <p className="truncate text-xs text-muted-foreground">{person.email}</p>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                {person.isBootstrapAdmin ? (
                  <span className="studio-pill" title="Managed via ADMIN_EMAILS">
                    Owner
                  </span>
                ) : person.role === "admin" ? (
                  <span className="studio-pill">Admin</span>
                ) : (
                  <span className="studio-pill studio-pill-gray">
                    {ROLE_LABELS[person.role]}
                  </span>
                )}
                <span className="hidden text-[11px] text-muted-foreground sm:block">
                  Joined {joinedLabel(person.joinedAt)}
                </span>
                {canManage && (
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-xs"
                        className="text-muted-foreground hover:text-foreground"
                        aria-label={`Manage ${person.name || person.email}`}
                      >
                        <MoreHorizontal />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      {ASSIGNABLE_ROLES.filter((role) => role !== person.role).map(
                        (role) => (
                          <DropdownMenuItem
                            key={role}
                            onClick={() =>
                              run(
                                () => updateCollaboratorRole(person.id, role),
                                `${person.name || person.email} is now ${
                                  role === "editor" ? "an editor" : `a ${role}`
                                }.`,
                              )
                            }
                          >
                            {role === "admin" ? <Shield /> : <ShieldOff />}
                            Change to {ROLE_LABELS[role].toLowerCase()}
                          </DropdownMenuItem>
                        ),
                      )}
                      <DropdownMenuItem
                        onClick={() =>
                          run(
                            () => logoutUserSessions(person.id),
                            `Signed ${person.name || person.email} out everywhere.`,
                          )
                        }
                      >
                        Sign out everywhere
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem
                        variant="destructive"
                        onClick={() => setPendingRemove(person)}
                      >
                        Remove collaborator
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                )}
              </div>
            </li>
          );
        })}
      </ul>

      <AlertDialog
        open={pendingRemove !== null}
        onOpenChange={(open) => !open && setPendingRemove(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Remove {pendingRemove?.name || pendingRemove?.email}?
            </AlertDialogTitle>
            <AlertDialogDescription>
              Their account is deleted and they are signed out immediately.
              Content they created stays. You can invite them again later.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-white hover:bg-destructive/90"
              onClick={handleRemove}
            >
              Remove
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
