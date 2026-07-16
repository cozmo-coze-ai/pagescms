import { Suspense } from "react";
import { ResetPassword } from "@/components/reset-password";

// No signed-in redirect here: an admin who is logged in may still open a
// reset link (e.g. testing one they generated for a collaborator), and the
// token in the URL is the only thing that grants the reset anyway.
export default function Page() {
  return (
    <Suspense>
      <ResetPassword />
    </Suspense>
  );
}
