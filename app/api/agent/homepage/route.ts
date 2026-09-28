import { requireGptAction } from "@/lib/gpt-action-auth";
import { toErrorResponse } from "@/lib/api-error";
import { HOME_COPY_FILES, HOME_PAGE_FILE, SHARED_COPY_PATHS } from "@/lib/homepage-guard";
import { headCommit, listImages, readTextFiles, SITE_URL } from "@/lib/homepage-git";

// Start here: the commit to base a change on, what can be edited, and the rules.
export async function GET(request: Request) {
  const denied = await requireGptAction(request, "homepage");
  if (denied) return denied;
  try {
    const commit = await headCommit();
    const [files, images] = await Promise.all([readTextFiles(commit), listImages(commit)]);
    return Response.json({
      commit,
      liveUrls: ["/", "/ko/", "/ja/", "/zh/"].map((path) => `${SITE_URL}${path}`),
      files: [...files].map(([path, text]) => ({
        path,
        bytes: new TextEncoder().encode(text).length,
        role: path === HOME_PAGE_FILE ? "layout, markup and CSS (Astro)" : `copy (${path.split("/").pop()?.slice(0, 2)})`,
      })),
      images,
      rules: [
        "Read a file with getHomepageFile before editing it; base every change on this commit.",
        `All visible text lives in ${Object.values(HOME_COPY_FILES).join(", ")}; change all four languages together with the same keys and list lengths.`,
        `Do not change these shared sections (other pages use them): ${SHARED_COPY_PATHS.join(", ")}.`,
        "Van prices must show the same figures in every language. Keep <tags> and {placeholders} identical across languages.",
        `${HOME_PAGE_FILE}: rearrange existing sections or edit CSS; executable frontmatter, data expressions and direct visible text are locked. Keep <BaseLayout>; no scripts, client directives, event handlers, external URLs or stylesheets.`,
        "New images: attach them in ChatGPT and name them (lowercase-dashes.jpg/png/webp, max 2 MB, max 4000 px); they are saved to /home/<name>.",
      ],
    });
  } catch (error) {
    return toErrorResponse(error);
  }
}
