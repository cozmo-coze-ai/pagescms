"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Copy, Loader, Trash2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { createEditorInvite, revokeEditorInvite } from "@/lib/actions/editor-invite";

type InviteRow = {
  id: number;
  email: string;
  inviteUrl: string;
  expiresAt: string;
  acceptedAt: string | null;
  createdAt: string;
};

const statusFor = (invite: InviteRow) => {
  if (invite.acceptedAt) return "accepted";
  if (new Date(invite.expiresAt).getTime() <= Date.now()) return "expired";
  return "pending";
};

export function AdminEditorInvites({ invites }: { invites: InviteRow[] }) {
  const [email, setEmail] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [lastInviteUrl, setLastInviteUrl] = useState<string | null>(null);

  const handleCreate = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!email.trim()) return;

    setIsSubmitting(true);
    try {
      const result = await createEditorInvite(email);
      if ("error" in result && result.error) {
        toast.error(result.error);
        return;
      }
      if ("inviteUrl" in result && result.inviteUrl) {
        setLastInviteUrl(result.inviteUrl);
        setEmail("");
        toast.success(
          result.emailSent
            ? "Invite created and emailed."
            : "Invite created — email not configured, copy the link below.",
        );
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCopy = async (url: string) => {
    await navigator.clipboard.writeText(url);
    toast.success("Invite link copied.");
  };

  const handleRevoke = async (invite: InviteRow) => {
    await revokeEditorInvite(invite.id);
    if (lastInviteUrl === invite.inviteUrl) setLastInviteUrl(null);
    toast.success(`Invite for ${invite.email} removed.`);
  };

  return (
    <div className="space-y-4">
      <form onSubmit={handleCreate} className="flex gap-2">
        <Input
          type="email"
          placeholder="editor@example.com"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          disabled={isSubmitting}
        />
        <Button type="submit" className="gap-2 shrink-0" disabled={isSubmitting || !email.trim()}>
          {isSubmitting && <Loader className="h-4 w-4 animate-spin" />}
          Invite
        </Button>
      </form>

      {lastInviteUrl && (
        <div className="flex items-center gap-2 rounded-md border bg-muted/50 px-3 py-2">
          <code className="text-xs break-all flex-1">{lastInviteUrl}</code>
          <Button
            type="button"
            variant="ghost"
            size="icon-xs"
            onClick={() => handleCopy(lastInviteUrl)}
            aria-label="Copy invite link"
          >
            <Copy />
          </Button>
        </div>
      )}

      {invites.length > 0 ? (
        <ul className="divide-y rounded-md border">
          {invites.map((invite) => {
            const status = statusFor(invite);
            return (
              <li key={invite.id} className="flex items-center gap-2 px-3 py-2">
                <div className="flex-1 min-w-0">
                  <p className="text-sm truncate">{invite.email}</p>
                  <p className="text-xs text-muted-foreground">
                    {status === "accepted"
                      ? `Accepted ${new Date(invite.acceptedAt!).toLocaleDateString()}`
                      : status === "expired"
                        ? "Expired"
                        : `Expires ${new Date(invite.expiresAt).toLocaleDateString()}`}
                  </p>
                </div>
                {status === "pending" && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-xs"
                    onClick={() => handleCopy(invite.inviteUrl)}
                    aria-label={`Copy invite link for ${invite.email}`}
                  >
                    <Copy />
                  </Button>
                )}
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-xs"
                  className="text-muted-foreground hover:text-destructive"
                  onClick={() => handleRevoke(invite)}
                  aria-label={`Remove invite for ${invite.email}`}
                >
                  <Trash2 />
                </Button>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="text-sm text-muted-foreground">No invites yet.</p>
      )}
    </div>
  );
}
