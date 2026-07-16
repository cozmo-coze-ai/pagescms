import { redirect } from "next/navigation";

// The old admin panel is gone — collaborator management lives in the studio
// settings. Redirect kept for old links/bookmarks.
export default function AdminPage() {
  redirect("/cms/settings");
}
