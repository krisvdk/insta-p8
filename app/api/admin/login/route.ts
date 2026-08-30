import { NextRequest, NextResponse } from "next/server"
import {
  adminCodeMatches,
  adminCookieName,
  adminSessionMaxAge,
  createAdminSession,
} from "@/lib/admin-auth"

export async function POST(request: NextRequest) {
  if (!process.env.ADMIN_CODE) {
    return NextResponse.json({ error: "ADMIN_CODE is not configured on the server" }, { status: 503 })
  }

  const body = await request.json().catch(() => ({}))
  if (!(await adminCodeMatches(typeof body.code === "string" ? body.code : ""))) {
    return NextResponse.json({ error: "That admin code is not valid" }, { status: 401 })
  }

  const response = NextResponse.json({ success: true })
  response.cookies.set(adminCookieName, await createAdminSession(), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: adminSessionMaxAge,
  })
  return response
}

export async function DELETE() {
  const response = NextResponse.json({ success: true })
  response.cookies.set(adminCookieName, "", { httpOnly: true, path: "/", maxAge: 0 })
  return response
}
