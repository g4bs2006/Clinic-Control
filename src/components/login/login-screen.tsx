"use client";

import { useState } from "react";
import { Activity, AlertTriangle } from "lucide-react";
import { signIn } from "@/lib/auth/actions";

/**
 * Tela de login.
 *
 * A ideia: o app inteiro existe para mover um card de "Leads" para
 * "Agendados" (a taxa de agendamento é a métrica central da carteira). Então
 * a tela ENCENA isso — o card de login fica na coluna Leads e atravessa para
 * Agendados enquanto o servidor confere a senha, com a coluna de destino
 * acendendo junto. O vocabulário do board é o mesmo que a equipe lê o dia
 * inteiro, então a metáfora se explica sozinha para quem usa.
 *
 * O board só aparece a partir de 1280px: abaixo disso as colunas ficariam
 * estreitas demais para os campos, e a tela vira um card centrado — a
 * travessia então é uma subida curta (mesma intenção, escala menor).
 *
 * `pending` é estado local no submit, não useFormStatus: `signIn` é uma
 * Server Action que termina em redirect (sucesso vai para "/", falha volta
 * para /login?error=…), então a página é sempre substituída e o estado se
 * reinicia sozinho na navegação.
 */

// Duas colunas, não o funil inteiro: a tese do produto é a travessia de Leads
// para Agendados. "Fechados" só acrescentaria uma coluna vazia à composição.
const COLUMNS = ["Leads", "Agendados"];

// Traço de ECG do divisor — a marca do app (ícone Activity) desenhada por
// extenso. pathLength=100 no SVG deixa o dasharray independente destes números.
const PULSE =
  "M0 10 H52 l5 -7 l5 14 l5 -11 l4 4 H132 l6 -5 l4 9 l5 -4 H206 l5 -8 l5 15 l5 -7 H300";

export function LoginScreen({ error }: { error: "locked" | "invalid" | null }) {
  const [pending, setPending] = useState(false);
  const state = pending ? "pending" : error ? "error" : "idle";

  return (
    <main className="login-root">
      <div className="login-grid" data-state={state}>
        {COLUMNS.map((name, i) => (
          <div key={name} className="login-col" aria-hidden="true">
            <span className="login-col-label">{name}</span>
            {/* Slot vago em Agendados: diz para onde o card vai antes de ele ir. */}
            {i === 1 && <span className="login-slot" />}
          </div>
        ))}

        <form action={signIn} onSubmit={() => setPending(true)} className="login-card">
          <div className="flex items-center gap-3">
            <span className="login-mark">
              <Activity className="size-[1.15rem]" strokeWidth={2.25} />
            </span>
            <span className="flex flex-col gap-0.5">
              <span className="login-wordmark">Clinic Control</span>
              <span className="login-sub">Contact.IA · carteira de clínicas</span>
            </span>
          </div>

          <svg
            className="login-pulse my-5"
            viewBox="0 0 300 20"
            preserveAspectRatio="none"
            aria-hidden="true"
          >
            <defs>
              <linearGradient id="login-pulse-grad" x1="0" y1="0" x2="1" y2="0">
                <stop offset="0%" stopColor="#7C3AED" />
                <stop offset="50%" stopColor="#C026D3" />
                <stop offset="100%" stopColor="#DC2626" />
              </linearGradient>
            </defs>
            <path className="login-pulse-base" d={PULSE} pathLength={100} />
            <path className="login-pulse-live" d={PULSE} pathLength={100} />
          </svg>

          <div className="space-y-3.5">
            <div className="login-field">
              <label className="login-label" htmlFor="email">
                E-mail
              </label>
              <input
                className="login-input"
                id="email"
                name="email"
                type="email"
                placeholder="voce@contactia.com.br"
                required
                autoComplete="email"
                autoFocus
                disabled={pending}
              />
            </div>

            <div className="login-field">
              <label className="login-label" htmlFor="password">
                Senha
              </label>
              <input
                className="login-input"
                id="password"
                name="password"
                type="password"
                placeholder="••••••••"
                required
                autoComplete="current-password"
                disabled={pending}
              />
            </div>
          </div>

          {error && (
            <p className="login-error mt-4" role="alert">
              <AlertTriangle className="mt-px size-3.5 shrink-0" />
              {error === "locked"
                ? "Muitas tentativas seguidas. Aguarde alguns minutos e tente de novo."
                : "E-mail ou senha não conferem."}
            </p>
          )}

          <button className="login-submit mt-5" type="submit" disabled={pending}>
            {pending ? "Entrando…" : "Entrar"}
          </button>

          <p className="login-note mt-4">
            Esqueceu a senha? Peça uma redefinição ao gestor — o acesso é criado e
            reposto por lá.
          </p>
        </form>
      </div>
    </main>
  );
}
