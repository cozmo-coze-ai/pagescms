import "server-only";
import { createHttpError } from "@/lib/api-error";
import { HOME_COPY_FILES, HOME_PAGE_FILE, HOME_TEXT_FILES, SHARED_COPY_PATHS } from "@/lib/homepage-guard";
import { headCommit, listImages, readTextFiles, readText, SITE_URL } from "@/lib/homepage-git";

export async function getHomepageSnapshot() {
  const commit = await headCommit();
  const [files, images] = await Promise.all([readTextFiles(commit), listImages(commit)]);
  return {
    commit,
    liveUrls: ["/", "/ko/", "/ja/", "/zh/"].map((path) => `${SITE_URL}${path}`),
    files: [...files].map(([path, text]) => ({ path, bytes: new TextEncoder().encode(text).length,
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
  };
}

export async function getHomepageFileSnapshot(path: string) {
  if (!HOME_TEXT_FILES.includes(path)) throw createHttpError(`path must be one of: ${HOME_TEXT_FILES.join(", ")}`, 400);
  const commit = await headCommit();
  return { commit, path, content: await readText(path, commit) };
}
