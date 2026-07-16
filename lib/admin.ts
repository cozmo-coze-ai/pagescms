import "server-only";

import { headers } from "next/headers";
import { eq } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { db } from "@/db";
import { userTable } from "@/db/schema";
import { createHttpError } from "@/lib/api-error";
import type { User } from "@/types/user";

type CollaboratorRole = "admin" | "editor";

const COLLABORATOR_ROLES: readonly CollaboratorRole[] = ["admin", "editor"];

const isCollaboratorRole = (value: unknown): value is CollaboratorRole =>
  typeof value === "string" && (COLLABORATOR_ROLES as readonly string[]).includes(value);

const getAdminEmails = () => {
  return new Set(
    (process.env.ADMIN_EMAILS || "")
      .split(",")
      .map((email) => email.trim().toLowerCase())
      .filter(Boolean),
  );
};

// Bootstrap admins (ADMIN_EMAILS env var) are admins no matter what their
// database row says, so the owners can never be locked out from the UI.
const isBootstrapAdminEmail = (email: string | null | undefined) => {
  if (!email) return false;
  return getAdminEmails().has(email.trim().toLowerCase());
};

// Role lives in the database (user.role, "admin" | "editor") and is managed
// from /cms/settings; the env list is only the bootstrap/lockout escape hatch.
const hasAdminAccess = async (
  user: Pick<User, "id" | "email"> | null | undefined,
) => {
  if (!user) return false;
  if (isBootstrapAdminEmail(user.email)) return true;

  const row = (
    await db
      .select({ role: userTable.role })
      .from(userTable)
      .where(eq(userTable.id, user.id))
      .limit(1)
  )[0];
  return row?.role === "admin";
};

const requireAdminSession = async () => {
  const session = await auth.api.getSession({
    headers: await headers(),
  });
  const user = session?.user;

  if (!user) {
    throw createHttpError("Not signed in.", 401);
  }

  if (!(await hasAdminAccess(user))) {
    throw createHttpError("Admin access required.", 403);
  }

  return { session, user };
};

export {
  getAdminEmails,
  hasAdminAccess,
  isBootstrapAdminEmail,
  isCollaboratorRole,
  requireAdminSession,
};
export type { CollaboratorRole };
