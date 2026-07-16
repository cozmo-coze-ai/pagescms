"use client";

// Change-password card on the settings page, styled like the Profile card
// next to it. Uses better-auth's change-password endpoint, which verifies
// the current password server-side and revokes other sessions on success.

import { useState } from "react";
import { toast } from "sonner";
import { Eye, EyeOff, Loader, LockKeyhole } from "lucide-react";
import { changePassword } from "@/lib/auth-client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export function ChangePassword() {
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPasswords, setShowPasswords] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  const canSave =
    currentPassword.length > 0 &&
    newPassword.length > 0 &&
    confirmPassword.length > 0 &&
    !isSaving;

  const handleSave = async () => {
    if (newPassword.length < 8) {
      toast.error("New password must be at least 8 characters.");
      return;
    }
    if (newPassword !== confirmPassword) {
      toast.error("New passwords don't match.");
      return;
    }

    setIsSaving(true);
    try {
      const result = await changePassword({
        currentPassword,
        newPassword,
        revokeOtherSessions: true,
      });

      if (result.error?.message) {
        toast.error(result.error.message);
        return;
      }

      toast.success("Password changed. Other devices were signed out.");
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
    } finally {
      setIsSaving(false);
    }
  };

  const inputType = showPasswords ? "text" : "password";

  return (
    <section className="space-y-3 rounded-xl border border-border bg-card p-4">
      <header className="flex items-center justify-between text-muted-foreground">
        <div className="flex items-center gap-1.5">
          <LockKeyhole className="h-3.5 w-3.5" />
          <h3 className="text-[11px] font-semibold uppercase tracking-[0.08em]">
            Change password
          </h3>
        </div>
        <button
          type="button"
          tabIndex={-1}
          onClick={() => setShowPasswords((prev) => !prev)}
          aria-label={showPasswords ? "Hide passwords" : "Show passwords"}
          className="transition-colors hover:text-foreground"
        >
          {showPasswords ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
        </button>
      </header>
      <p className="text-xs text-muted-foreground">
        Changing your password signs you out everywhere else.
      </p>
      <form
        className="space-y-2"
        onSubmit={(event) => {
          event.preventDefault();
          void handleSave();
        }}
      >
        <Input
          type={inputType}
          name="current-password"
          aria-label="Current password"
          placeholder="Current password"
          autoComplete="current-password"
          value={currentPassword}
          onChange={(event) => setCurrentPassword(event.target.value)}
          disabled={isSaving}
          required
        />
        <Input
          type={inputType}
          name="new-password"
          aria-label="New password"
          placeholder="New password (8+ characters)"
          autoComplete="new-password"
          value={newPassword}
          onChange={(event) => setNewPassword(event.target.value)}
          disabled={isSaving}
          required
        />
        <Input
          type={inputType}
          name="confirm-new-password"
          aria-label="Confirm new password"
          placeholder="Repeat the new password"
          autoComplete="new-password"
          value={confirmPassword}
          onChange={(event) => setConfirmPassword(event.target.value)}
          disabled={isSaving}
          required
        />
        <Button type="submit" className="gap-2" disabled={!canSave}>
          {isSaving && <Loader className="h-4 w-4 animate-spin" />}
          Change password
        </Button>
      </form>
    </section>
  );
}
