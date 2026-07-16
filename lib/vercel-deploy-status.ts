// Live status for the coze_client site build, used by
// /api/cms/deploy-status to replace the old fixed-time guess with the
// actual Vercel deployment state.

const COZE_CLIENT_PROJECT_ID = "prj_DmpLuZHFu8Hu9d9o3azAAH27q1IW";
const COZE_CLIENT_TEAM_ID = "team_FDOC5YuqXKM1u5suic9W2kFn";

export type DeploymentState = "QUEUED" | "BUILDING" | "READY" | "ERROR" | "CANCELED" | null;

type VercelDeployment = {
  uid: string;
  readyState: DeploymentState;
  created: number;
  target?: string | null;
};

// Finds the coze_client production deployment that corresponds to a given
// trigger time (the most recent one created at/after it — the build Vercel
// started in response to that hook call) and returns its real state.
// Returns null if no Vercel token is configured, so the caller can fall
// back to the old estimate-based behavior.
export const getCozeClientDeploymentState = async (
  triggeredAt: Date,
): Promise<{ state: DeploymentState; createdAt: string } | null> => {
  const token = process.env.VERCEL_API_TOKEN;
  if (!token) return null;

  const params = new URLSearchParams({
    projectId: COZE_CLIENT_PROJECT_ID,
    teamId: COZE_CLIENT_TEAM_ID,
    target: "production",
    limit: "5",
  });

  const response = await fetch(`https://api.vercel.com/v6/deployments?${params}`, {
    headers: { Authorization: `Bearer ${token}` },
    // Always hit Vercel directly; this is polled every 15s and must reflect
    // the current build state, not a cached one.
    cache: "no-store",
  });
  if (!response.ok) {
    console.warn("[vercel-deploy-status] Vercel API request failed", {
      status: response.status,
      statusText: response.statusText,
    });
    return null;
  }

  const json = (await response.json()) as { deployments?: VercelDeployment[] };
  const deployments = json.deployments ?? [];

  // The deployment Vercel started for our trigger is the most recent one
  // created at/after triggeredAt (allowing a little slack for clock drift
  // between our DB write and Vercel receiving the hook).
  const triggeredAtMs = triggeredAt.getTime() - 5_000;
  const match = deployments
    .filter((d) => d.created >= triggeredAtMs)
    .sort((a, b) => a.created - b.created)[0];

  if (!match) {
    // Hook was called but Vercel hasn't registered the deployment yet.
    return { state: "QUEUED", createdAt: triggeredAt.toISOString() };
  }

  return { state: match.readyState, createdAt: new Date(match.created).toISOString() };
};
