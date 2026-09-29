import { requireGptAction } from "@/lib/gpt-action-auth";
import { toErrorResponse } from "@/lib/api-error";
import { getHomepageFileSnapshot } from "@/lib/homepage-read";

// One file per call keeps each response under ChatGPT's size limit.
export async function GET(request: Request) {
  const denied = await requireGptAction(request, "homepage");
  if (denied) return denied;
  try {
    const path = new URL(request.url).searchParams.get("path") ?? "";
    return Response.json(await getHomepageFileSnapshot(path));
  } catch (error) {
    return toErrorResponse(error);
  }
}
