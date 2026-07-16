"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { signIn } from "@/lib/auth-client";
import { getAuthCallbackURL, getSafeRedirect } from "@/lib/auth-redirect";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";
import { Eye, EyeOff, Loader } from "lucide-react";

// Only the email is remembered locally — never the password (the browser's
// own password manager handles that).
const REMEMBERED_EMAIL_KEY = "coze-cms-remembered-email";

export function SignIn() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(true);
  const [submittingMethod, setSubmittingMethod] = useState<"password" | null>(null);
  const isSubmitting = submittingMethod !== null;

  const searchParams = useSearchParams();
  const error = searchParams.get("error") || "";
  const redirectParam = searchParams.get("redirect") || "";
  const safeRedirect = getSafeRedirect(redirectParam);
  const callbackURL = getAuthCallbackURL(safeRedirect);

  useEffect(() => {
    if (error) toast.error(error, { duration: 12000 });
  }, [error]);

  useEffect(() => {
    const remembered = window.localStorage.getItem(REMEMBERED_EMAIL_KEY);
    if (remembered) setEmail(remembered);
  }, []);

  useEffect(() => {
    const email = searchParams.get("email");
    if (email) setEmail(email.trim().toLowerCase());
  }, [searchParams]);

  const handlePasswordSignIn = async () => {
    const normalizedEmail = email.trim().toLowerCase();
    if (!normalizedEmail || !password) {
      toast.error("Enter your email and password.");
      return;
    }

    setSubmittingMethod("password");
    try {
      const result = await signIn.email({
        email: normalizedEmail,
        password,
        callbackURL,
        // Unchecked -> session-only cookie, signed out when the browser closes.
        rememberMe,
      });

      if (result.error?.message) {
        toast.error(result.error.message);
        return;
      }

      if (rememberMe) {
        window.localStorage.setItem(REMEMBERED_EMAIL_KEY, normalizedEmail);
      } else {
        window.localStorage.removeItem(REMEMBERED_EMAIL_KEY);
      }

      window.location.assign(safeRedirect);
    } finally {
      setSubmittingMethod(null);
    }
  };

  // `.studio` on the wrapper pulls in the site's identity (paper, ink,
  // curator gold, Lora) — same theme class the /cms shell puts on <html>.
  return (
    <div className="studio flex min-h-screen items-center justify-center bg-background p-4 text-foreground md:p-6">
      <div className="w-full sm:max-w-[360px]">
        <div className="mb-6 text-center">
          <h1 className="font-serif text-2xl tracking-tight">
            Coze <span className="text-primary">CMS</span>
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            The studio behind coze.care
          </p>
        </div>

        <div className="rounded-xl border border-border bg-card p-6">
          <form
            className="space-y-4"
            onSubmit={async (event) => {
              event.preventDefault();
              await handlePasswordSignIn();
            }}
          >
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
            <div className="space-y-1.5">
              <label
                htmlFor="password"
                className="block text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground"
              >
                Password
              </label>
              <div className="relative">
                <Input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  name="password"
                  placeholder="••••••••"
                  autoComplete="current-password"
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
            <label className="flex cursor-pointer items-center gap-2 text-sm text-muted-foreground">
              <Checkbox
                checked={rememberMe}
                onCheckedChange={(checked) => setRememberMe(checked === true)}
                disabled={isSubmitting}
              />
              Remember me
            </label>
            <Button type="submit" className="w-full gap-2" disabled={isSubmitting}>
              Sign in
              {submittingMethod === "password" && (
                <Loader className="size-4 animate-spin" />
              )}
            </Button>
          </form>
        </div>

        <p className="mt-4 text-center text-xs text-muted-foreground">
          Invite-only — ask an admin if you need access.
        </p>
      </div>
    </div>
  );
}
