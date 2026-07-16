import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { ForgotPassword } from "@/components/forgot-password";

export default async function Page() {
  const requestHeaders = await headers();
  const session = await auth.api.getSession({
    headers: requestHeaders,
  });
  if (session?.user) return redirect("/");

  return <ForgotPassword />;
}
