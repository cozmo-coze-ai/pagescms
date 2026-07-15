"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { signIn } from "@/lib/auth-client";
import { getAuthCallbackURL, getSafeRedirect } from "@/lib/auth-redirect";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { Loader } from "lucide-react";

export function SignIn() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
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
      });

      if (result.error?.message) {
        toast.error(result.error.message);
        return;
      }

      window.location.assign(safeRedirect);
    } finally {
      setSubmittingMethod(null);
    }
  };

  const legalCopy = (
    <p className="text-sm text-muted-foreground">
      By clicking continue, you agree to our{" "}
      <a
        className="underline hover:decoration-muted-foreground/50"
        href="https://pagescms.org/terms"
        target="_blank"
      >
        Terms of Service
      </a>{" "}
      and{" "}
      <a
        className="underline hover:decoration-muted-foreground/50"
        href="https://pagescms.org/privacy"
        target="_blank"
      >
        Privacy Policy
      </a>
      .
    </p>
  );

  return (
    <div className="min-h-screen p-4 md:p-6 flex justify-center items-center">
      <div className="sm:max-w-[340px] w-full">
        <div className="space-y-6">
          <h1 className="text-lg font-medium tracking-tight text-center">
            Sign in to Coze CMS
          </h1>
          <form
            className="space-y-2"
            onSubmit={async (event) => {
              event.preventDefault();
              await handlePasswordSignIn();
            }}
          >
            <Input
              type="email"
              name="email"
              placeholder="Email"
              required
              disabled={isSubmitting}
              value={email}
              onChange={(event) => setEmail(event.target.value)}
            />
            <Input
              type="password"
              name="password"
              placeholder="Password"
              required
              disabled={isSubmitting}
              value={password}
              onChange={(event) => setPassword(event.target.value)}
            />
            <Button type="submit" className="w-full" disabled={isSubmitting}>
              Sign in
              {submittingMethod === "password" && (
                <Loader className="size-4 animate-spin" />
              )}
            </Button>
          </form>
          {legalCopy}
        </div>
      </div>
    </div>
  );
}
