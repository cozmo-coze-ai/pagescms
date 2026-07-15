"use server";

/**
 * Editor invite flow ("set your password" link, flat permissions):
 * - Admin creates an invite for an email -> unique token link, emailed if a
 *   mail provider is configured (the link is always returned for copying,
 *   so email config is optional).
 * - Invitee opens /sign-up/invite/[token], picks a name + password ->
 *   `acceptEditorInvite` creates the account through better-auth's
 *   signUpEmail (the x-invite-token header satisfies the invite-only
 *   sign-up gate in lib/auth.ts) and signs them in.
 */

import crypto from "crypto";
import { revalidatePath } from "next/cache";
import { eq, sql } from "drizzle-orm";
import { render } from "@react-email/components";
import { db } from "@/db";
import { cmsEditorInviteTable, userTable } from "@/db/schema";
import { requireAdminSession } from "@/lib/admin";
import { auth } from "@/lib/auth";
import { getBaseUrl } from "@/lib/base-url";
import { sendEmail } from "@/lib/mailer";
import { InviteEmailTemplate } from "@/components/email/invite";

const INVITE_TTL_DAYS = 7;

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const inviteUrlFor = (token: string) => `${getBaseUrl()}/sign-up/invite/${token}`;

const createEditorInvite = async (email: string) => {
  const { user } = await requireAdminSession();

  const normalizedEmail = email.trim().toLowerCase();
  if (!EMAIL_REGEX.test(normalizedEmail)) {
    return { error: "Enter a valid email address." };
  }

  const existingUser = await db
    .select({ id: userTable.id })
    .from(userTable)
    .where(sql`lower(${userTable.email}) = ${normalizedEmail}`)
    .limit(1);
  if (existingUser.length > 0) {
    return { error: "That email already has an account." };
  }

  // One live invite per email: re-inviting replaces any previous one.
  await db
    .delete(cmsEditorInviteTable)
    .where(sql`lower(${cmsEditorInviteTable.email}) = ${normalizedEmail}`);

  const token = crypto.randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + INVITE_TTL_DAYS * 24 * 60 * 60 * 1000);

  await db.insert(cmsEditorInviteTable).values({
    token,
    email: normalizedEmail,
    invitedBy: user.id,
    expiresAt,
  });

  const inviteUrl = inviteUrlFor(token);

  // Email is best-effort: without a configured provider the admin can still
  // copy the link from the dashboard.
  let emailSent = false;
  try {
    const html = await render(
      InviteEmailTemplate({
        email: normalizedEmail,
        inviteUrl,
        invitedByName: user.name || user.email || "An admin",
      }),
    );
    await sendEmail({
      to: normalizedEmail,
      subject: "You're invited to edit Coze CMS",
      html,
    });
    emailSent = true;
  } catch (error) {
    console.warn("[editor-invite] could not send invite email", {
      error: error instanceof Error ? error.message : String(error),
    });
  }

  revalidatePath("/admin");
  return { success: true, inviteUrl, emailSent };
};

const revokeEditorInvite = async (id: number) => {
  await requireAdminSession();

  await db.delete(cmsEditorInviteTable).where(eq(cmsEditorInviteTable.id, id));

  revalidatePath("/admin");
  return { success: true };
};

// Public (no session): the token is the credential.
const acceptEditorInvite = async (token: string, name: string, password: string) => {
  const trimmedName = name.trim();
  if (!token || !trimmedName || !password) {
    return { error: "Name and password are required." };
  }

  const invite = (
    await db
      .select()
      .from(cmsEditorInviteTable)
      .where(eq(cmsEditorInviteTable.token, token))
      .limit(1)
  )[0];

  if (!invite || invite.acceptedAt) {
    return { error: "This invite link is invalid or was already used." };
  }
  if (invite.expiresAt.getTime() <= Date.now()) {
    return { error: "This invite link has expired. Ask an admin for a new one." };
  }

  try {
    // nextCookies (lib/auth.ts plugin) sets the session cookie from within
    // this server action, so the invitee lands signed in.
    await auth.api.signUpEmail({
      body: {
        email: invite.email,
        name: trimmedName,
        password,
      },
      headers: new Headers({ "x-invite-token": token }),
    });
  } catch (error) {
    return {
      error: error instanceof Error && error.message
        ? error.message
        : "Could not create your account.",
    };
  }

  await db
    .update(cmsEditorInviteTable)
    .set({ acceptedAt: new Date() })
    .where(eq(cmsEditorInviteTable.id, invite.id));

  return { success: true };
};

export { createEditorInvite, revokeEditorInvite, acceptEditorInvite };
