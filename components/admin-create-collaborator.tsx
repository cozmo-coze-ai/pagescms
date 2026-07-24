"use client";

// "Add directly" card on /cms/settings: the admin creates the account with
// an email + password and hands the credentials over out-of-band — the
// alternative to the invite-link flow for people who won't set their own
// password. Server side: createCollaboratorAccount (lib/actions/collaborators).

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Copy, Dices, Loader } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { createCollaboratorAccount } from "@/lib/actions/collaborators";

// Unambiguous alphabet (no 0/O, 1/l/I) — these get read aloud or retyped.
const PASSWORD_ALPHABET = "abcdefghjkmnpqrstuvwxyzABCDEFGHJKMNPQRSTUVWXYZ23456789";
const PASSWORD_LENGTH = 14;

const generatePassword = () => {
  const values = new Uint32Array(PASSWORD_LENGTH);
  crypto.getRandomValues(values);
  return Array.from(values, (value) => PASSWORD_ALPHABET[value % PASSWORD_ALPHABET.length]).join("");
};

export function AdminCreateCollaborator() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState("editor");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!email.trim() || !password) return;

    setIsSubmitting(true);
    try {
      const result = await createCollaboratorAccount({ email, name, password, role });
      if (result?.error) {
        toast.error(result.error);
        return;
      }
      toast.success(`Account created for ${email.trim().toLowerCase()} — share the credentials with them.`);
      setName("");
      setEmail("");
      setPassword("");
      setRole("editor");
      router.refresh();
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-2">
      <div className="flex gap-2">
        <Input
          placeholder="Name"
          value={name}
          onChange={(event) => setName(event.target.value)}
          maxLength={120}
          disabled={isSubmitting}
        />
        <Select value={role} onValueChange={setRole} disabled={isSubmitting}>
          <SelectTrigger className="w-28 shrink-0" aria-label="Role">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="editor">Editor</SelectItem>
            <SelectItem value="viewer">Viewer</SelectItem>
            <SelectItem value="admin">Admin</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <Input
        type="email"
        placeholder="person@example.com"
        value={email}
        onChange={(event) => setEmail(event.target.value)}
        disabled={isSubmitting}
      />
      <div className="flex gap-2">
        <Input
          type="text"
          autoComplete="off"
          placeholder="Password (min. 8 characters)"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          disabled={isSubmitting}
          className="font-mono"
        />
        <Button
          type="button"
          variant="outline"
          size="icon"
          className="shrink-0"
          onClick={() => setPassword(generatePassword())}
          disabled={isSubmitting}
          aria-label="Generate password"
          title="Generate password"
        >
          <Dices />
        </Button>
        <Button
          type="button"
          variant="outline"
          size="icon"
          className="shrink-0"
          onClick={async () => {
            if (!password) return;
            await navigator.clipboard.writeText(password);
            toast.success("Password copied.");
          }}
          disabled={isSubmitting || !password}
          aria-label="Copy password"
          title="Copy password"
        >
          <Copy />
        </Button>
      </div>
      <Button
        type="submit"
        className="w-full gap-2"
        disabled={isSubmitting || !email.trim() || password.length < 8}
      >
        {isSubmitting && <Loader className="h-4 w-4 animate-spin" />}
        Create account
      </Button>
    </form>
  );
}
