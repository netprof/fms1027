import { NextResponse, type NextRequest } from "next/server";

// Optimistic check only: sends visitors without a session cookie to the
// login page. The real check is requireEmployee() in each page and action.
export function proxy(request: NextRequest) {
  if (!request.cookies.has("fms_session")) {
    const login = new URL("/login", request.url);
    login.searchParams.set("next", request.nextUrl.pathname);
    return NextResponse.redirect(login);
  }
  return NextResponse.next();
}

export const config = {
  matcher: "/admin/:path*",
};
