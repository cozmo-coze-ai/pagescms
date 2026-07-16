import { createAuthClient } from "better-auth/react";

// Email+password only — the emailOTP client plugin went away with the
// server-side OTP flow (see lib/auth.ts).
const authClient = createAuthClient({});

export const {
  signIn,
  signOut,
  useSession,
  requestPasswordReset,
  resetPassword,
  changePassword,
} = authClient;
export { authClient };
