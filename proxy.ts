import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

function isAllowedOrigin(originHeader: string, hostHeader: string): boolean {
	try {
		const originUrl = new URL(originHeader);
		return originUrl.host.toLowerCase() === hostHeader.toLowerCase();
	} catch {
		return false;
	}
}

export function proxy(request: NextRequest) {
	const pathname = request.nextUrl.pathname;
	const isStaticAsset =
		pathname.startsWith("/_next/") ||
		pathname === "/favicon.ico" ||
		/\.[^/]+$/.test(pathname);

	if (isStaticAsset) {
		return NextResponse.next();
	}

	// GPT Actions use a dedicated bearer token, not browser cookies. Their
	// server-to-server POST has no same-origin browser Origin header; each agent
	// route authenticates the bearer token before reading or writing anything.
	if (pathname.startsWith("/api/") && !pathname.startsWith("/api/agent/") && request.method !== "GET") {
		const originHeader = request.headers.get("Origin");
		const hostHeader = request.headers.get("Host");
		if (!originHeader || !hostHeader || !isAllowedOrigin(originHeader, hostHeader)) {
			return new NextResponse(null, {
				status: 403
			});
		}
	}

	const requestHeaders = new Headers(request.headers);
	const returnTo = `${request.nextUrl.pathname}${request.nextUrl.search}`;
	requestHeaders.set("x-return-to", returnTo);

	return NextResponse.next({
		request: {
			headers: requestHeaders,
		},
	});
}

export const config = {
	matcher: "/:path*"
}
