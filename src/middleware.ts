import { NextResponse, type NextRequest } from "next/server";

/**
 * Cheap first gate for /admin: no session cookie → login page. The real check
 * (signature / Supabase user + admin_users membership) runs in every admin page
 * and server action via requireAdmin().
 */
export function middleware(req: NextRequest) {
  if (req.nextUrl.pathname.startsWith("/admin/login")) return NextResponse.next();
  const hasSession = req.cookies.getAll().some((c) => c.name === "cf_admin" || (c.name.startsWith("sb-") && c.name.includes("auth-token")));
  if (!hasSession) return NextResponse.redirect(new URL("/admin/login", req.url));
  return NextResponse.next();
}

export const config = { matcher: ["/admin/:path*"] };
