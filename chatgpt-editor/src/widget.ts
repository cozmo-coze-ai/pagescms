import { App } from "@modelcontextprotocol/ext-apps";

const app = new App({ name: "COZE homepage preview", version: "0.1.0" }, {});
const frame = document.querySelector<HTMLIFrameElement>("iframe")!;
const status = document.querySelector<HTMLElement>("#status")!;
const open = document.querySelector<HTMLAnchorElement>("#open")!;
let data: any;
let viewToken: string | undefined;
let loaded = false;

app.ontoolresult = result => {
  data = result.structuredContent; viewToken = result._meta?.viewToken as string | undefined;
  if(data?.kind === "itinerary") { data.previewUrl=result._meta?.previewUrl; data.commit=data.revision; }
  document.querySelector<HTMLSelectElement>("#locale")!.hidden = data?.kind === "itinerary";
  frame.title=data?.kind === "itinerary"?"COZE itinerary content preview":"COZE homepage design preview";
  if (data?.state !== "ready" || !data.previewUrl || !viewToken) {
    status.textContent = data?.state === "failed" ? "The preview could not build. Ask ChatGPT to check it." : "Your preview is being prepared. Ask ChatGPT to check its progress.";
    return;
  }
  const url = new URL(data.previewUrl);
  if (url.protocol !== "https:") return;
  status.textContent = "Loading your preview…";
  open.href = url.href; open.hidden = false;
  loaded = false;
  frame.src = url.href;
};
frame.addEventListener("load", () => {
  // An iframe load event also fires for browser error pages. The isolated
  // preview Worker sends a message containing its verified build commit.
  if (data?.state === "ready" && !loaded) status.textContent = "Waiting for the preview to finish loading…";
});
window.addEventListener("message", async event => {
  if (!data?.previewUrl || !viewToken || event.source !== frame.contentWindow || event.origin !== new URL(data.previewUrl).origin) return;
  if (event.data?.type !== "coze-preview-loaded" || event.data?.commit !== data.commit) return;
  loaded = true;
  try {
    const result = await app.callServerTool({ name: data.kind === "itinerary"?"markItineraryPreviewViewed":"markPreviewViewed", arguments: { changeId: data.changeId, viewToken } });
    status.textContent = result.isError ? "Could not confirm this preview. Ask ChatGPT to reload it." : "Preview ready. Tell ChatGPT what to adjust, or say yes when asked to publish.";
  } catch { status.textContent = "Connection interrupted. Ask ChatGPT to show this preview again."; }
});
document.querySelectorAll<HTMLButtonElement>("[data-width]").forEach(button => button.addEventListener("click", () => {
  frame.style.width = `${button.dataset.width}px`;
  document.querySelectorAll("[data-width]").forEach(b => b.setAttribute("aria-pressed", String(b === button)));
}));
document.querySelector<HTMLSelectElement>("#locale")!.addEventListener("change", event => {
  if (!data?.previewUrl) return;
  const locale = (event.target as HTMLSelectElement).value;
  frame.src = new URL(locale === "en" ? "/" : `/${locale}/`, data.previewUrl).href;
});
app.connect().catch(() => { status.textContent = "Open this preview using the connected COZE editor in ChatGPT."; });
