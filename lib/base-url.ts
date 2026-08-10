const DEV_PORT = "3000";

export const getBaseUrl = () => {
  const baseUrl = process.env.BASE_URL?.trim();

  if (baseUrl) {
    return baseUrl;
  }

  if (process.env.NODE_ENV !== "production") {
    // `next dev` picks the next free port when 3000 is busy and exports it as
    // PORT, so links generated server-side (password-reset emails, redirects)
    // point at the port the app is actually listening on.
    return `http://localhost:${process.env.PORT?.trim() || DEV_PORT}`;
  }

  throw new Error("Missing BASE_URL. Set BASE_URL in production.");
};
