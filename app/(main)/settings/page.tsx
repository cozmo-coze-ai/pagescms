import Link from "next/link";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { MainRootLayout } from "../main-root-layout";
import { Profile } from "@/components/settings/profile";
import { DocumentTitle } from "@/components/document-title";
import { buttonVariants } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";
import { cn } from "@/lib/utils";

export default async function Page() {
  const session = await auth.api.getSession({
    headers: await headers(),
  });
  const user = session?.user;
  if (!user) throw new Error("User not found");

  return (
    <MainRootLayout>
      <DocumentTitle title="Settings" />
      <div className="max-w-screen-sm mx-auto p-4 md:p-6 space-y-6">
        <Link
          className={cn(
            buttonVariants({ variant: "outline", size: "xs" }),
            "inline-flex",
          )}
          href="/"
        >
          <ArrowLeft />
          Go home
        </Link>
        <header className="flex items-center mb-6">
          <h1 className="font-semibold tracking-tight text-lg md:text-2xl">
            Settings
          </h1>
        </header>
        <div className="flex flex-col relative flex-1 space-y-6">
          <Profile name={user.name} email={user.email} />
        </div>
      </div>
    </MainRootLayout>
  );
}
