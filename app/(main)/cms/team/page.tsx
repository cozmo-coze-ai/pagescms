import { redirect } from "next/navigation";

// Team management moved into /cms/settings (profile + collaborators live
// together now). Kept as a redirect so old links and bookmarks still work.
export default function TeamPage() {
  redirect("/cms/settings");
}
