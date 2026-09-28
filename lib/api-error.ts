type ErrorLike = {
  status?: number;
  statusCode?: number;
  code?: string;
  message?: string;
  headers?: HeadersInit;
  cause?: unknown;
};

const createHttpError = (message: string, status: number, headers?: HeadersInit) => {
  const error = new Error(message) as Error & { status: number; headers?: HeadersInit };
  error.status = status;
  error.headers = headers;
  return error;
};

const errorChain = (error: unknown) => {
  const chain: ErrorLike[] = [];
  let current = error;
  for (let depth = 0; depth < 5 && current && typeof current === "object"; depth++) {
    const item = current as ErrorLike;
    chain.push(item);
    current = item.cause;
  }
  return chain;
};

const isDatabaseCapacityError = (error: unknown) =>
  errorChain(error).some((item) => {
    const code = item.code?.toUpperCase();
    const message = item.message?.toLowerCase() ?? "";
    return (
      code === "EMAXCONNSESSION"
      || code === "53300"
      || message.includes("max clients reached")
      || message.includes("too many clients already")
    );
  });

const getErrorMessage = (error: unknown): string => {
  if (isDatabaseCapacityError(error)) {
    return "The CMS database is busy. Please try again in a moment.";
  }
  if (error instanceof Error && error.message) return error.message;
  if (error && typeof error === "object" && "message" in error) {
    const message = (error as ErrorLike).message;
    if (typeof message === "string" && message.length > 0) return message;
  }
  return "Internal server error.";
};

const getErrorStatus = (error: unknown): number => {
  if (error && typeof error === "object") {
    const { status, statusCode } = error as ErrorLike;
    const explicitStatus = typeof status === "number" ? status : statusCode;
    if (typeof explicitStatus === "number" && explicitStatus >= 400 && explicitStatus <= 599) {
      return explicitStatus;
    }
  }

  if (isDatabaseCapacityError(error)) return 503;

  const message = getErrorMessage(error).toLowerCase();

  if (
    message.includes("permission")
    || message.includes("no access")
    || message.includes("forbidden")
    || message.includes("only github users")
  ) return 403;
  if (message.includes("not found")) return 404;
  if (message.includes("unauthorized") || message.includes("not signed in")) return 401;
  if (message.includes("conflict") || message.includes("changed since you last loaded")) return 409;
  if (message.includes("rate limit")) return 429;
  if (
    message.includes("invalid")
    || message.includes("required")
    || message.includes("validation failed")
  ) return 400;

  return 500;
};

const toErrorResponse = (error: unknown) => {
  const status = getErrorStatus(error);
  const headers = new Headers(
    error && typeof error === "object" ? (error as ErrorLike).headers : undefined,
  );
  if (isDatabaseCapacityError(error) && !headers.has("Retry-After")) {
    headers.set("Retry-After", "3");
  }

  return Response.json(
    {
      status: "error",
      message: getErrorMessage(error),
    },
    { status, headers },
  );
};

export { createHttpError, toErrorResponse };
