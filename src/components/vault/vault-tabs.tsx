"use client"

import { useState } from "react"
import { KeyRound, Files } from "lucide-react"
import { cn } from "@/lib/utils"
import { VaultManager } from "@/components/vault/vault-manager"
import { VaultFiles } from "@/components/vault/vault-files"
import type { CredentialSummary } from "@/lib/vault/actions"
import type { VaultStoredFile, VaultFileMeta } from "@/lib/storage/vault-files"

type Tab = "senhas" | "arquivos"

export function VaultTabs({
  credentials,
  files,
  filesMeta,
  isGestor,
}: {
  credentials: CredentialSummary[]
  files: VaultStoredFile[]
  filesMeta: Record<string, VaultFileMeta>
  isGestor: boolean
}) {
  const [tab, setTab] = useState<Tab>("senhas")

  const tabs: { key: Tab; label: string; icon: typeof KeyRound }[] = [
    { key: "senhas", label: "Senhas", icon: KeyRound },
    { key: "arquivos", label: "Arquivos", icon: Files },
  ]

  return (
    <div className="space-y-5">
      <div className="flex gap-1 border-b border-border">
        {tabs.map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            type="button"
            onClick={() => setTab(key)}
            className={cn(
              "-mb-px flex items-center gap-1.5 border-b-2 px-3 py-2 text-sm font-medium transition-colors",
              tab === key
                ? "border-primary text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground",
            )}
          >
            <Icon className="size-4" />
            {label}
          </button>
        ))}
      </div>

      {tab === "senhas" ? (
        <VaultManager initialCredentials={credentials} isGestor={isGestor} />
      ) : (
        <VaultFiles files={files} meta={filesMeta} isGestor={isGestor} />
      )}
    </div>
  )
}
