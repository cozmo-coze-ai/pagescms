import { requireGptAction } from "@/lib/gpt-action-auth";
import { toErrorResponse } from "@/lib/api-error";
import { checkHomepageChange } from "@/lib/homepage-changes";
import { parseHomepageChange } from "@/lib/homepage-request";

// Dry run: validate a change and summarize it for the designer. Writes nothing.
export async function POST(request: Request) {
  const denied = await requireGptAction(request, "homepage");
  if (denied) return denied;
  try {
    const input = await parseHomepageChange(request, { requireConfirmation: false });
    const result = await checkHomepageChange(input);
    return Response.json({
      ...result,
      next: "Show the user this summary in plain words and ask them to confirm the deploy. Only after an explicit yes, call applyHomepageChange with the same body plus confirmedByUser: true.",
    });
  } catch (error) {
    return toErrorResponse(error);
  }
}
