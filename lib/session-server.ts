import { cache } from "react";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { hasWriteAccess } from "@/lib/admin";

const getServerSession = cache(async () => {
  return auth.api.getSession({
    headers: await headers(),
  });
});

const requireApiUserSession = async () => {
  const session = await auth.api.getSession({
    headers: await headers(),
  });
  if (!session?.user) {
    return { response: new Response(null, { status: 401 }) };
  }

  return { user: session.user };
};

// Like requireApiUserSession, but additionally rejects read-only "viewer"
// accounts — use it on every content-mutating handler (POST/PUT/DELETE).
const requireApiWriteAccess = async () => {
  const session = await auth.api.getSession({
    headers: await headers(),
  });
  if (!session?.user) {
    return { response: new Response(null, { status: 401 }) };
  }
  if (!(await hasWriteAccess(session.user))) {
    return {
      response: Response.json(
        { status: "error", message: "Read-only access — this account cannot make changes." },
        { status: 403 },
      ),
    };
  }

  return { user: session.user };
};

export { getServerSession, requireApiUserSession, requireApiWriteAccess };
