export type DeploymentState = "QUEUED" | "BUILDING" | "READY" | "ERROR" | "CANCELED";
type Build = {
  build_uuid: string;
  created_on: string;
  build_outcome?: string | null;
  build_trigger_metadata?: { branch?: string; branch_name?: string };
  trigger_uuid?: string;
  trigger?: { trigger_uuid?: string };
};

export function selectProductionBuild(builds: Build[], triggeredAt: Date, triggerId: string) {
  return builds.filter(build => (build.trigger?.trigger_uuid ?? build.trigger_uuid) === triggerId &&
    Date.parse(build.created_on) >= triggeredAt.getTime())
    .sort((a, b) => Date.parse(b.created_on) - Date.parse(a.created_on))[0];
}

export function buildState(build: Build): DeploymentState {
  if (build.build_outcome === "success") return "READY";
  if (build.build_outcome === "cancelled" || build.build_outcome === "canceled") return "CANCELED";
  if (build.build_outcome && build.build_outcome !== "unknown") return "ERROR";
  return "BUILDING";
}

export const getCozeClientDeploymentState = async (triggeredAt: Date): Promise<{
  state: DeploymentState; createdAt: string;
} | null> => {
  const token = process.env.CLOUDFLARE_API_TOKEN;
  const account = process.env.CLOUDFLARE_ACCOUNT_ID;
  const workerTag = process.env.COZE_CLIENT_WORKER_TAG;
  const triggerId = process.env.COZE_CLIENT_BUILD_TRIGGER_ID;
  if (!token || !account || !workerTag || !triggerId) return null;
  try {
    const response = await fetch(`https://api.cloudflare.com/client/v4/accounts/${account}/builds/workers/${workerTag}/builds?per_page=100`, {
      headers: { Authorization: `Bearer ${token}` }, cache: "no-store", signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) return null;
    const body = await response.json() as { success: boolean; result?: Build[] };
    if (!body.success || !Array.isArray(body.result)) return null;
    const build = selectProductionBuild(body.result, triggeredAt, triggerId);
    return build ? { state: buildState(build), createdAt: build.created_on }
      : { state: "QUEUED", createdAt: triggeredAt.toISOString() };
  } catch {
    return null;
  }
};
