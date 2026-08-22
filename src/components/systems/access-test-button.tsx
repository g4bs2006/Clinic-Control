"use client";

// Botão "Testar acesso" — reporta passo a passo, não um sim/não.
//
// "Não abriu" é diagnóstico ruim. O link do Aniversariantes pode falhar porque
// o gate caiu, porque o segredo divergiu entre os dois projetos, ou porque o
// escopo vazou — três consertos diferentes com o mesmo sintoma. Cada passo
// aparece separado para que a tela diga QUAL deles quebrou.

import { useState, useTransition } from "react";
import { CheckCircle2, XCircle, Loader2, PlayCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  testAniversariantesAccess,
  testDashboardAccess,
  type AccessTestResult,
} from "@/lib/systems/access-test";

export function AccessTestButton({
  clinicId,
  sistema,
  label = "Testar acesso",
}: {
  clinicId: string;
  sistema: "aniversariantes" | "dashboard";
  label?: string;
}) {
  const [res, setRes] = useState<AccessTestResult | null>(null);
  const [pending, start] = useTransition();

  function run() {
    start(async () => {
      const r =
        sistema === "aniversariantes"
          ? await testAniversariantesAccess(clinicId)
          : await testDashboardAccess(clinicId);
      setRes(r);
    });
  }

  return (
    <div className="flex flex-col gap-2">
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={pending}
        onClick={run}
        className="w-fit gap-1.5"
      >
        {pending ? <Loader2 className="size-3.5 animate-spin" /> : <PlayCircle className="size-3.5" />}
        {label}
      </Button>

      {res && !res.ok && <p className="text-xs text-destructive">{res.error}</p>}

      {res?.ok && (
        <ul className="flex flex-col gap-1.5">
          {res.steps.map((s) => (
            <li key={s.label} className="flex items-start gap-2 text-xs">
              {s.ok ? (
                <CheckCircle2 className="mt-0.5 size-3.5 shrink-0 text-emerald-400" />
              ) : (
                <XCircle className="mt-0.5 size-3.5 shrink-0 text-red-400" />
              )}
              <span>
                <span className={s.ok ? "text-foreground" : "font-medium text-red-400"}>
                  {s.label}
                </span>
                <span className="text-muted-foreground"> — {s.detail}</span>
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
