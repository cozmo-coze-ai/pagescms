import { requireGptAction } from "@/lib/gpt-action-auth";
import { createHttpError, toErrorResponse } from "@/lib/api-error";
import { HOME_TEXT_FILES } from "@/lib/homepage-guard";
import { headCommit, readText } from "@/lib/homepage-git";

// One file per call keeps each response under ChatGPT's size limit.
export async function GET(request: Request) {
  const denied = await requireGptAction(request);
  if (denied) return denied;
  try {
    const path = new URL(request.url).searchParams.get("path") ?? "";
    if (!HOME_TEXT_FILES.includes(path)) throw createHttpError(`path must be one of: ${HOME_TEXT_FILES.join(", ")}`, 400);
    const commit = await headCommit();
    return Response.json({ commit, path, content: await readText(path, commit) });
  } catch (error) {
    return toErrorResponse(error);
  }
}
