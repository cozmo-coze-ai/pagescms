"use client";

// Profile card on the settings pages, styled like the other studio cards
// (compact section with an icon + uppercase header) so it doesn't stand out
// from the Team cards next to it.

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader, UserRound } from "lucide-react";
import { getInitialsFromName } from "@/lib/utils/avatar";
import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type ProfileProps = {
  name?: string | null;
  email: string;
};

export function Profile({ name, email }: ProfileProps) {
  const router = useRouter();
  const [displayName, setDisplayName] = useState(name?.trim() || "");
  const [isSaving, setIsSaving] = useState(false);

  const initialName = name?.trim() || "";
  const canSave = displayName.trim().length > 0 && displayName.trim() !== initialName && !isSaving;
  const avatarLabel = displayName.trim() || email;

  const handleSave = async () => {
    const nextName = displayName.trim();
    if (!nextName) return;

    setIsSaving(true);
    try {
      const response = await fetch("/api/auth/update-user", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: nextName }),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok || !payload?.status) {
        throw new Error(payload?.message || "Failed to update profile.");
      }

      toast.success("Profile updated.");
      router.refresh();
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to update profile.";
      toast.error(message);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <section className="space-y-3 rounded-xl border border-border bg-card p-4">
      <header className="flex items-center gap-1.5 text-muted-foreground">
        <UserRound className="h-3.5 w-3.5" />
        <h3 className="text-[11px] font-semibold uppercase tracking-[0.08em]">
          Your profile
        </h3>
      </header>
      <p className="text-xs text-muted-foreground">
        How your name appears to other collaborators. Signed in as {email}.
      </p>
      <form
        className="flex items-center gap-3"
        onSubmit={(event) => {
          event.preventDefault();
          void handleSave();
        }}
      >
        <Avatar className="h-9 w-9 shrink-0">
          <AvatarImage
            src={`https://unavatar.io/${email}?fallback=false`}
            alt={avatarLabel}
          />
          <AvatarFallback className="bg-secondary text-xs">
            {getInitialsFromName(avatarLabel)}
          </AvatarFallback>
        </Avatar>
        <Input
          name="name"
          aria-label="Display name"
          placeholder="Display name"
          value={displayName}
          onChange={(event) => setDisplayName(event.target.value)}
          maxLength={120}
          disabled={isSaving}
        />
        <Button type="submit" className="shrink-0 gap-2" disabled={!canSave}>
          {isSaving && <Loader className="h-4 w-4 animate-spin" />}
          Save
        </Button>
      </form>
    </section>
  );
}
