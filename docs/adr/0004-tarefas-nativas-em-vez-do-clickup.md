# 0004 — Tarefas nativas para substituir o ClickUp

- **Status:** Aceito
- **Registrado em:** 2026-08-18 (frente em execução desde ~junho/2026)

## Contexto

A operação da carteira estava espalhada por planilhas, ClickUp, grupos de
WhatsApp e CRM. O Clinic Control já detecta sinais (resumos de IA, snapshots,
churn) mas, sem um destino para eles, cada sinal virava trabalho manual de
transcrever para o ClickUp.

Opções: integrar com a API do ClickUp, ou implementar tarefas nativas.

## Decisão

Implementar tarefas nativas até a equipe não precisar mais do ClickUp. O ciclo
que justifica isso:

```
detecta (proatividade) → vira tarefa → notifica → equipe age → rastreia
```

Integrar com o ClickUp resolveria o transporte, mas não o ciclo: a tarefa criada
lá perderia o vínculo com a clínica, o snapshot e a conversa que a originaram —
que é justamente o que torna o "rastreia" possível.

## Consequências

- Reimplementamos coisas que o ClickUp já tinha: board, recorrência, seleção
  múltipla, agenda pessoal, arquivamento. Custo aceito conscientemente.
- Ficou pendente **dependências entre tarefas** (`task_dependencies`), o último
  item que ainda prende alguém ao ClickUp.
- **Lembretes de prazo** dependem da frente de Notificações — a "Minha semana"
  cobre o aviso in-app, mas não alcança quem não abre o sistema.
- O vínculo tarefa↔clínica↔sinal é o ativo criado aqui. Qualquer migração futura
  para ferramenta externa perde esse vínculo.
