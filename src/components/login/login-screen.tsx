"use client";

import { useEffect, useState } from "react";
import { signIn } from "@/lib/auth/actions";

/**
 * Tela de login: uma placa de instrumento.
 *
 * A hierarquia da página é a de uma placa de equipamento — fabricante
 * (Contact.IA), modelo (Clinic Control), controles (os campos) e faixa de
 * estado na base. Nenhum desses elementos é enfeite: cada um diz uma coisa
 * verdadeira, e a faixa mostra dado de verdade (em qual implantação você está,
 * quanto dura a sessão, que horas são no servidor).
 *
 * Sem card, sem sombra, sem gradiente. O único acento colorido é a seta do
 * botão e o traço que responde ao foco — num visual assim a precisão do
 * espaçamento e da escala é que carrega a personalidade, então qualquer
 * decoração a mais tira em vez de somar.
 *
 * O traço sob o wordmark é a única peça móvel: ele desenha na entrada e vira
 * a barra de progresso enquanto o servidor confere a senha.
 *
 * `pending` é estado local no submit, não useFormStatus: `signIn` termina em
 * redirect (sucesso vai para "/", falha volta para /login?error=…), então a
 * página é sempre substituída e o estado se reinicia na navegação.
 */
export function LoginScreen({
  error,
  deploy,
  sessionDays,
}: {
  error: "locked" | "invalid" | null;
  deploy: string | null;
  sessionDays: number;
}) {
  const [pending, setPending] = useState(false);
  const clock = useServerClock();
  const state = pending ? "pending" : error ? "error" : "idle";

  return (
    <main className="login" data-state={state}>
      <div className="login-plate">
        <p className="login-maker">Contact.IA</p>

        {/* As duas linhas são justificadas à MESMA largura (ver .login-name no
            CSS), o que exige as letras como elementos próprios. O bloco vira um
            retângulo de tipo em vez de duas palavras com a direita irregular. */}
        <h1 className="login-name">
          {["Clinic", "Control"].map((word) => (
            <span key={word} className="login-line">
              {[...word].map((letter, i) => (
                <span key={`${word}-${i}`}>{letter}</span>
              ))}
            </span>
          ))}
        </h1>

        {/* Desenha na entrada; vira barra de progresso no submit. */}
        <div className="login-rule" />

        <form action={signIn} onSubmit={() => setPending(true)} className="login-form">
          <div className="login-field" data-invalid={error ? "" : undefined}>
            <label className="login-label" htmlFor="email">
              E-mail
            </label>
            <input
              className="login-input"
              id="email"
              name="email"
              type="email"
              required
              autoComplete="email"
              autoFocus
              disabled={pending}
            />
          </div>

          <div className="login-field" data-invalid={error ? "" : undefined}>
            <label className="login-label" htmlFor="password">
              Senha
            </label>
            <input
              className="login-input"
              id="password"
              name="password"
              type="password"
              required
              autoComplete="current-password"
              disabled={pending}
            />
          </div>

          {error && (
            <p className="login-error" role="alert">
              {error === "locked"
                ? "Muitas tentativas seguidas. Aguarde alguns minutos e tente de novo."
                : "E-mail ou senha não conferem."}
            </p>
          )}

          <button className="login-submit" type="submit" disabled={pending}>
            {pending ? "Entrando" : "Entrar"}
            <span className="login-arrow" aria-hidden="true">
              →
            </span>
          </button>
        </form>

        <p className="login-help">
          Esqueceu a senha? Peça uma redefinição ao gestor — o acesso é criado e
          reposto por lá.
        </p>
      </div>

      <footer className="login-strip">
        {deploy && <span>{deploy}</span>}
        <span>Sessão de {sessionDays} dias</span>
        <span className="login-clock">{clock ?? "--:--:--"}</span>
      </footer>
    </main>
  );
}

/**
 * Relógio de parede em BRT, o único movimento contínuo da tela. Começa nulo e
 * só liga depois da montagem: renderizar a hora no servidor daria divergência
 * de hidratação garantida, já que o relógio anda entre o HTML e o cliente.
 */
function useServerClock() {
  const [now, setNow] = useState<string | null>(null);
  useEffect(() => {
    const tick = () =>
      setNow(
        new Date().toLocaleTimeString("pt-BR", {
          timeZone: "America/Sao_Paulo",
          hour12: false,
        }),
      );
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, []);
  return now;
}
