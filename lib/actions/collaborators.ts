"use server";

/**
 * Collaborator management (admin-only), backing the Team section of
 * /cms/settings. Roles live on the user row ("admin" | "editor") in the
 * Supabase Postgres the app already uses through Drizzle.
 *
 * Guard rails:
 * - You can't change or remove your own account (so there is always at
 *   least one admin left — the actor).
 * - Bootstrap admins (ADMIN_EMAILS) can't be demoted or removed from the
 *   UI; their access is managed in the environment config.
 */

import { revalidatePath } from "next/cache";
import { eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { collaboratorTable, userTable } from "@/db/schema";
import { auth } from "@/lib/auth";
import {
  isBootstrapAdminEmail,
  isCollaboratorRole,
  requireAdminSession,
} from "@/lib/admin";

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MIN_PASSWORD_LENGTH = 8;

const findUser = async (userId: string) =>
  (
    await db
      .select({ id: userTable.id, email: userTable.email })
      .from(userTable)
      .where(eq(userTable.id, userId))
      .limit(1)
  )[0];

/**
 * Create a collaborator account directly (email + password chosen by the
 * admin, to hand over out-of-band) — the alternative to the invite-link
 * flow for people who won't set their own password.
 *
 * Uses better-auth's internal adapter instead of auth.api.signUpEmail:
 * signUpEmail signs the new user in, which (via the nextCookies plugin)
 * would replace the acting admin's own session cookie. The internal
 * adapter creates the user + credential account rows with better-auth's
 * own password hashing, no session involved.
 */
const createCollaboratorAccount = async (input: {
  email: string;
  name: string;
  password: string;
  role: string;
}) => {
  await requireAdminSession();

  const email = input.email.trim().toLowerCase();
  const name = input.name.trim() || email.split("@")[0];
  const { password, role } = input;

  if (!EMAIL_REGEX.test(email)) {
    return { error: "Enter a valid email address." };
  }
  if (!isCollaboratorRole(role)) {
    return { error: "Unknown role." };
  }
  if (password.length < MIN_PASSWORD_LENGTH) {
    return { error: `Password must be at least ${MIN_PASSWORD_LENGTH} characters.` };
  }

  const existing = (
    await db
      .select({ id: userTable.id })
      .from(userTable)
      .where(sql`lower(${userTable.email}) = ${email}`)
      .limit(1)
  )[0];
  if (existing) {
    return { error: "That email already has an account." };
  }

  try {
    const ctx = await auth.$context;
    const hashedPassword = await ctx.password.hash(password);
    const created = await ctx.internalAdapter.createUser({ email, name });
    await ctx.internalAdapter.linkAccount({
      userId: created.id,
      providerId: "credential",
      accountId: created.id,
      password: hashedPassword,
    });
    if (role !== "editor") {
      await db
        .update(userTable)
        .set({ role, updatedAt: new Date() })
        .where(eq(userTable.id, created.id));
    }
  } catch (error) {
    console.error("[collaborators] could not create account", {
      error: error instanceof Error ? error.message : String(error),
    });
    return { error: "Could not create the account." };
  }

  revalidatePath("/cms/settings");
  return { success: true };
};

const updateCollaboratorRole = async (userId: string, role: string) => {
  const { user: actor } = await requireAdminSession();

  if (!isCollaboratorRole(role)) {
    return { error: "Unknown role." };
  }
  if (actor.id === userId) {
    return { error: "You can't change your own role." };
  }

  const target = await findUser(userId);
  if (!target) {
    return { error: "Account not found." };
  }
  if (isBootstrapAdminEmail(target.email)) {
    return {
      error:
        "This account is a bootstrap admin (ADMIN_EMAILS) — its access is managed in the environment config.",
    };
  }

  await db
    .update(userTable)
    .set({ role, updatedAt: new Date() })
    .where(eq(userTable.id, userId));

  revalidatePath("/cms/settings");
  return { success: true };
};

const removeCollaborator = async (userId: string) => {
  const { user: actor } = await requireAdminSession();

  if (actor.id === userId) {
    return { error: "You can't remove your own account." };
  }

  const target = await findUser(userId);
  if (!target) {
    return { error: "Account not found." };
  }
  if (isBootstrapAdminEmail(target.email)) {
    return {
      error:
        "This account is a bootstrap admin (ADMIN_EMAILS) — its access is managed in the environment config.",
    };
  }

  // Legacy GitHub-era collaborator rows reference user without ON DELETE
  // CASCADE; clear them first so the user delete can't hit an FK error.
  await db.delete(collaboratorTable).where(eq(collaboratorTable.userId, userId));
  await db
    .update(collaboratorTable)
    .set({ invitedBy: null })
    .where(eq(collaboratorTable.invitedBy, userId));

  // Sessions and credential accounts cascade with the user row, so removal
  // both revokes access immediately and cleans up sign-in state.
  await db.delete(userTable).where(eq(userTable.id, userId));

  revalidatePath("/cms/settings");
  return { success: true };
};

export { createCollaboratorAccount, removeCollaborator, updateCollaboratorRole };
