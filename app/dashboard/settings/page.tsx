"use client"

import { LogOut, Settings } from "lucide-react"
import { useState } from "react"
import { useRouter } from "next/navigation"

export default function SettingsPage() {
    const router = useRouter()
    const [locking, setLocking] = useState(false)

    async function lockWorkspace() {
        setLocking(true)
        await fetch("/api/admin/login", { method: "DELETE" })
        router.replace("/admin-login")
        router.refresh()
    }

    return (
        <div className="flex flex-col items-center justify-center min-h-[60vh] text-center p-8 animate-in fade-in duration-700">
            <div className="w-20 h-20 rounded-2xl bg-muted border border-border flex items-center justify-center mb-6">
                <Settings className="w-10 h-10 text-muted-foreground" />
            </div>
            <h1 className="font-serif-display text-4xl text-foreground mb-2">System Settings</h1>
            <p className="text-muted-foreground max-w-md mx-auto mb-8">
                Configure your account preferences, notifications, and integration settings here.
            </p>
            <button
                type="button"
                onClick={lockWorkspace}
                disabled={locking}
                className="inline-flex items-center gap-2 px-5 py-3 rounded-xl bg-foreground text-background text-xs font-bold uppercase tracking-widest disabled:opacity-50"
            >
                <LogOut className="w-4 h-4" />
                {locking ? "Locking…" : "Lock workspace"}
            </button>
        </div>
    )
}
