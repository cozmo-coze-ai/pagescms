"use client";

import { useState } from "react";
import Link from "next/link";
import { requestPasswordReset } from "@/lib/auth-client";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { Loader, MailCheck } from "lucide-react";

export function ForgotPassword() {
  const [email, setEmail] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [sentTo, setSentTo] = useState<string | null>(null);

  const handleSubmit = async () => {
    const normalizedEmail = email.trim().toLowerCase();
    if (!normalizedEmail) {
      toast.error("Enter your email.");
      return;
    }

    setIsSubmitting(true);
    try {
      const result = await requestPasswordReset({
        email: normalizedEmail,
        redirectTo: "/reset-password",
      });

      if (result.error?.message) {
        toast.error(result.error.message);
        return;
      }

      // better-auth answers success for unknown emails too, so this screen
      // never reveals which accounts exist.
      setSentTo(normalizedEmail);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="studio flex min-h-screen items-center justify-center bg-background p-4 text-foreground md:p-6">
      <div className="w-full sm:max-w-[360px]">
        <div className="mb-6 text-center">
          <h1 className="font-serif text-2xl tracking-tight">
            Coze <span className="text-primary">CMS</span>
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Reset your password
          </p>
        </div>

        <div className="rounded-xl border border-border bg-card p-6">
          {sentTo ? (
            <div className="space-y-3 text-center">
              <MailCheck className="mx-auto h-6 w-6 text-primary" />
              <p className="text-sm">
                If an account exists for <strong>{sentTo}</strong>, a reset
                link is on its way. The link expires in 1 hour.
              </p>
              <p className="text-xs text-muted-foreground">
                Nothing arriving? Check spam, or ask an admin to reset it for
                you.
              </p>
            </div>
          ) : (
            <form
              className="space-y-4"
              onSubmit={async (event) => {
                event.preventDefault();
                await handleSubmit();
              }}
            >
              <p className="text-xs text-muted-foreground">
                Enter the email you sign in with and we&apos;ll send you a
                link to choose a new password.
              </p>
              <div className="space-y-1.5">
                <label
                  htmlFor="email"
                  className="block text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground"
                >
                  Email
                </label>
                <Input
                  id="email"
                  type="email"
                  name="email"
                  placeholder="you@coze.care"
                  autoComplete="email"
                  required
                  disabled={isSubmitting}
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                />
              </div>
              <Button type="submit" className="w-full gap-2" disabled={isSubmitting}>
                Send reset link
                {isSubmitting && <Loader className="size-4 animate-spin" />}
              </Button>
            </form>
          )}
        </div>

        <p className="mt-4 text-center text-xs text-muted-foreground">
          <Link href="/sign-in" className="underline hover:text-foreground">
            Back to sign in
          </Link>
        </p>
      </div>
    </div>
  );
}
