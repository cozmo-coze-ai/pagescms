import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { UserProvider } from "@/contexts/user-context";
import { User } from "@/types/user";
import { getServerSession } from "@/lib/session-server";
import { hasAdminAccess } from "@/lib/admin";

export default async function Layout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const requestHeaders = await headers();
  const session = await getServerSession();
  const returnTo = requestHeaders.get("x-return-to");
  const signInUrl =
    returnTo && returnTo !== "/sign-in"
      ? `/sign-in?redirect=${encodeURIComponent(returnTo)}`
      : "/sign-in";
  if (!session?.user) return redirect(signInUrl);

  const userWithAdmin = {
    ...session.user,
    isAdmin: hasAdminAccess(session.user as User),
  };

  return (
    <UserProvider user={userWithAdmin}>
      {children}
    </UserProvider>
  );
}
