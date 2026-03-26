import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { SUPABASE_AUTH_COOKIE_KEY } from "./auth-cookie-key";

// Protect any page that requires authentication.
// This uses cookie presence as the first-line guard; Supabase RLS should
// still enforce access control at the database level.
export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // Public routes
  if (pathname === "/login") return NextResponse.next();

  // Next.js internals / assets (matcher should filter these, but keep safe)
  if (
    pathname.startsWith("/_next") ||
    pathname.startsWith("/api") ||
    pathname === "/favicon.ico" ||
    pathname === "/apple-touch-icon.png" ||
    pathname === "/apple-touch-icon-precomposed.png"
  ) {
    return NextResponse.next();
  }

  const cookie = req.cookies.get(SUPABASE_AUTH_COOKIE_KEY)?.value;
  if (cookie) return NextResponse.next();

  const url = req.nextUrl.clone();
  url.pathname = "/login";
  url.searchParams.set("redirect", pathname);
  return NextResponse.redirect(url);
}

export const config = {
  matcher: [
    // Protect everything except Next.js internals and explicitly public routes.
    "/((?!_next/|favicon.ico|apple-touch-icon\\.png|apple-touch-icon-precomposed\\.png|api/|login).*)",
  ],
};

