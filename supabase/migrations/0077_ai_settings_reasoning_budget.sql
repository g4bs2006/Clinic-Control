-- max_tokens de 1600 era orçamento de modelo NÃO-raciocinante.
--
-- O `max_tokens` original (0038) foi calibrado para o `deepseek-chat`, que
-- escreve a resposta direto. Quando o modelo passou a `deepseek-v4-pro`
-- (2026-08-03, via a tela de Configurações), o mesmo teto virou insuficiente:
-- modelo de raciocínio gasta tokens PENSANDO antes de escrever, e o corte
-- acontece no meio do raciocínio — a API devolve 200 com `content` VAZIO.
--
-- Medido no `?preview=1` (2026-08-17): com max_tokens=4000, a mesma clínica
-- retornava `completion_tokens: 4000` e `content` de comprimento 0; com 8000,
-- retorna o resumo completo.
--
-- Sintoma que isso causava: "resposta do modelo não é o JSON esperado" em
-- parte das clínicas — as de conversa mais longa, onde o raciocínio é maior.
-- Intermitente, e por isso confundido com instabilidade da IA. Os resumos que
-- passavam ficavam colados no teto (completion_tokens 1574, 1543, 1497…).
--
-- Se um dia o modelo voltar a ser não-raciocinante, este valor pode cair de
-- novo — mas alto é seguro: `max_tokens` é teto, não consumo garantido.
set search_path to clinic_control, public;

update ai_settings set max_tokens = 8000 where id = true and max_tokens < 8000;
