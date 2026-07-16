import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { APIError, createAuthMiddleware } from "better-auth/api";
import { nextCookies } from "better-auth/next-js";
import { render } from "@react-email/components";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import * as schema from "@/db/schema";
import { getBaseUrl } from "@/lib/base-url";
import { sendEmail } from "@/lib/mailer";
import { ResetPasswordEmailTemplate } from "@/components/email/reset-password";

// Email+password only — GitHub OAuth and email-OTP were removed once content
// storage moved off GitHub (nothing needs a GitHub identity/token anymore),
// and OTP added complexity with no remaining use case for this app's small,
// flat editor-permission model.
export const auth = betterAuth({
  baseURL: getBaseUrl(),
  secret: (process.env.AUTH_SECRET || process.env.BETTER_AUTH_SECRET) as string,
  emailAndPassword: {
    enabled: true,
    // Self-service "forgot password": better-auth generates the token and
    // appends it to the /reset-password redirect URL; we only deliver it.
    // Requests for unknown emails never reach here, so nothing leaks about
    // which accounts exist.
    resetPasswordTokenExpiresIn: 60 * 60, // 1 hour — matches the email copy
    sendResetPassword: async ({ user, url }) => {
      const html = await render(
        ResetPasswordEmailTemplate({ email: user.email, resetUrl: url }),
      );
      await sendEmail({
        to: user.email,
        subject: "Reset your Coze CMS password",
        html,
        text: `Reset your Coze CMS password: ${url} (link expires in 1 hour)`,
      });
    },
  },
  hooks: {
    // Sign-up is invite-only: this is an internal tool with flat permissions
    // (any account can edit content), so the public email+password sign-up
    // endpoint must not allow self-registration. The accept-invite server
    // action (lib/actions/editor-invite.ts) passes the invite token via the
    // x-invite-token header when it calls auth.api.signUpEmail.
    before: createAuthMiddleware(async (ctx) => {
      if (ctx.path !== "/sign-up/email") return;

      const token = ctx.headers?.get("x-invite-token") ?? "";
      const body = (ctx.body ?? {}) as Record<string, unknown>;
      const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";

      const invite = token
        ? (
            await db
              .select()
              .from(schema.cmsEditorInviteTable)
              .where(eq(schema.cmsEditorInviteTable.token, token))
              .limit(1)
          )[0]
        : undefined;

      const isValid =
        invite &&
        !invite.acceptedAt &&
        invite.expiresAt.getTime() > Date.now() &&
        invite.email.trim().toLowerCase() === email;

      if (!isValid) {
        throw new APIError("FORBIDDEN", {
          message: "Sign-up is invite-only. Ask an admin for an invite link.",
        });
      }
    }),
  },
  database: drizzleAdapter(db, {
    provider: "pg",
    schema: {
      user: schema.userTable,
      session: schema.sessionTable,
      account: schema.accountTable,
      verification: schema.verificationTable,
    },
  }),
  plugins: [nextCookies()],
});
