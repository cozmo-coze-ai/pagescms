import { redirect } from "next/navigation";

// Settings lives in the studio now. Redirect kept for old links/bookmarks.
export default function SettingsPage() {
  redirect("/cms/settings");
}
