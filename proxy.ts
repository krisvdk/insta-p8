import { NextRequest, NextResponse } from "next/server"
import { adminCookieName, verifyAdminSession } from "@/lib/admin-auth"

const PUBLIC_MACHINE_ROUTES = [
  "/api/instagram/webhook",
  "/api/instagram/publish/scheduled",
  "/api/cron/",
  "/api/v1/",
]

function isMachineRoute(pathname: string): boolean {
  return PUBLIC_MACHINE_ROUTES.some((route) =>
    route.endsWith("/") ? pathname.startsWith(route) : pathname === route,
  )
}

export async function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl
  if (
    pathname === "/admin-login" ||
    pathname === "/api/admin/login" ||
    isMachineRoute(pathname)
  ) {
    return NextResponse.next()
  }

  const authenticated = await verifyAdminSession(request.cookies.get(adminCookieName)?.value)
  if (authenticated) return NextResponse.next()

  if (pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "Admin authentication required" }, { status: 401 })
  }

  const loginUrl = new URL("/admin-login", request.url)
  loginUrl.searchParams.set("next", `${pathname}${search}`)
  return NextResponse.redirect(loginUrl)
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|icon.svg|icon-light-32x32.png|icon-dark-32x32.png|apple-icon.png).*)"],
}
