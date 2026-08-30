"use client"

import { FormEvent, useState } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { KeyRound, Loader2, LockKeyhole } from "lucide-react"

export default function AdminLoginPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [code, setCode] = useState("")
  const [error, setError] = useState("")
  const [loading, setLoading] = useState(false)

  async function unlock(event: FormEvent) {
    event.preventDefault()
    if (!code || loading) return
    setLoading(true)
    setError("")

    try {
      const response = await fetch("/api/admin/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code }),
      })
      const result = await response.json()
      if (!response.ok) throw new Error(result.error || "Could not unlock the site")

      const requested = searchParams.get("next") || "/dashboard"
      const destination = requested.startsWith("/") && !requested.startsWith("//")
        ? requested
        : "/dashboard"
      router.replace(destination)
      router.refresh()
    } catch (cause: any) {
      setError(cause?.message || "Could not unlock the site")
    } finally {
      setLoading(false)
    }
  }

  return (
    <main className="min-h-screen bg-[#090909] text-white grid place-items-center p-6">
      <div className="w-full max-w-sm">
        <div className="mb-8">
          <div className="w-12 h-12 rounded-2xl bg-[#ffe14d] text-black grid place-items-center mb-6">
            <LockKeyhole className="w-5 h-5" />
          </div>
          <p className="font-mono-ui text-[10px] uppercase tracking-[0.3em] text-neutral-500 mb-3">Private workspace</p>
          <h1 className="font-serif-display text-5xl leading-none">Admin access</h1>
          <p className="text-sm text-neutral-500 mt-4 leading-relaxed">
            Enter your private code to open InstaAuto. Access stays unlocked on this device for 30 days.
          </p>
        </div>

        <form onSubmit={unlock} className="space-y-3">
          <label htmlFor="admin-code" className="sr-only">Secret admin code</label>
          <div className="relative">
            <KeyRound className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-600" />
            <input
              id="admin-code"
              type="password"
              value={code}
              onChange={(event) => setCode(event.target.value)}
              autoComplete="current-password"
              autoFocus
              placeholder="Secret admin code"
              className="w-full h-13 rounded-xl border border-white/10 bg-white/[0.04] pl-11 pr-4 text-sm outline-none focus:border-[#ffe14d]/60 focus:ring-2 focus:ring-[#ffe14d]/10"
            />
          </div>
          {error && <p className="text-sm text-red-400" role="alert">{error}</p>}
          <button
            type="submit"
            disabled={!code || loading}
            className="h-13 w-full rounded-xl bg-[#ffe14d] text-black font-mono-ui text-xs font-bold disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {loading && <Loader2 className="w-4 h-4 animate-spin" />}
            Unlock workspace
          </button>
        </form>
      </div>
    </main>
  )
}
