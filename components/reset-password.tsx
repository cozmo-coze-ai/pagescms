"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { resetPassword } from "@/lib/auth-client";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { Eye, EyeOff, Loader } from "lucide-react";

// better-auth appends ?token=... to the redirect URL from the reset email,
// or ?error=INVALID_TOKEN when the link is expired or already used.
export function ResetPassword() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get("token") || "";
  const tokenError = searchParams.get("error") || "";

  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const linkIsBroken = !token || Boolean(tokenError);

  const handleSubmit = async () => {
    if (password.length < 8) {
      toast.error("Password must be at least 8 characters.");
      return;
    }
    if (password !== confirmPassword) {
      toast.error("Passwords don't match.");
      return;
    }

    setIsSubmitting(true);
    try {
      const result = await resetPassword({
        newPassword: password,
        token,
      });

      if (result.error?.message) {
        toast.error(result.error.message);
        return;
      }

      toast.success("Password updated — sign in with your new password.");
      router.push("/sign-in");
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
            Choose a new password
          </p>
        </div>

        <div className="rounded-xl border border-border bg-card p-6">
          {linkIsBroken ? (
            <div className="space-y-3 text-center">
              <p className="text-sm">
                This reset link is invalid or has expired.
              </p>
              <Button asChild className="w-full">
                <Link href="/forgot-password">Request a new link</Link>
              </Button>
            </div>
          ) : (
            <form
              className="space-y-4"
              onSubmit={async (event) => {
                event.preventDefault();
                await handleSubmit();
              }}
            >
              <div className="space-y-1.5">
                <label
                  htmlFor="password"
                  className="block text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground"
                >
                  New password
                </label>
                <div className="relative">
                  <Input
                    id="password"
                    type={showPassword ? "text" : "password"}
                    name="password"
                    placeholder="8+ characters"
                    autoComplete="new-password"
                    required
                    disabled={isSubmitting}
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    className="pr-10"
                  />
                  <button
                    type="button"
                    tabIndex={-1}
                    onClick={() => setShowPassword((prev) => !prev)}
                    aria-label={showPassword ? "Hide password" : "Show password"}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground transition-colors hover:text-foreground"
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>
              <div className="space-y-1.5">
                <label
                  htmlFor="confirm-password"
                  className="block text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground"
                >
                  Confirm password
                </label>
                <Input
                  id="confirm-password"
                  type={showPassword ? "text" : "password"}
                  name="confirm-password"
                  placeholder="Repeat the new password"
                  autoComplete="new-password"
                  required
                  disabled={isSubmitting}
                  value={confirmPassword}
                  onChange={(event) => setConfirmPassword(event.target.value)}
                />
              </div>
              <Button type="submit" className="w-full gap-2" disabled={isSubmitting}>
                Set new password
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
