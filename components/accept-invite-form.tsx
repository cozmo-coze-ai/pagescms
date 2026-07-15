"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Loader } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { acceptEditorInvite } from "@/lib/actions/editor-invite";

export function AcceptInviteForm({ token }: { token: string }) {
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!name.trim() || !password) {
      toast.error("Enter your name and a password.");
      return;
    }
    if (password.length < 8) {
      toast.error("Password must be at least 8 characters.");
      return;
    }

    setIsSubmitting(true);
    try {
      const result = await acceptEditorInvite(token, name, password);
      if ("error" in result && result.error) {
        toast.error(result.error);
        return;
      }
      // acceptEditorInvite signs the new user in (session cookie set
      // server-side), so we can land straight in the editor.
      window.location.assign("/cms");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <Input
        type="text"
        placeholder="Your name"
        value={name}
        onChange={(event) => setName(event.target.value)}
        autoComplete="name"
        disabled={isSubmitting}
      />
      <Input
        type="password"
        placeholder="Password (8+ characters)"
        value={password}
        onChange={(event) => setPassword(event.target.value)}
        autoComplete="new-password"
        disabled={isSubmitting}
      />
      <Button type="submit" className="w-full gap-2" disabled={isSubmitting}>
        {isSubmitting && <Loader className="h-4 w-4 animate-spin" />}
        Create account
      </Button>
    </form>
  );
}
