// Etapas do provisionamento Helena (módulo puro — importável de client e server).

export const PROVISION_STEPS = [
  "account",
  "token",
  "owner_user",
  "teams",
  "tags",
  "panel",
] as const;

export type ProvisionStep = (typeof PROVISION_STEPS)[number];

export type ProvisionRow = {
  step: ProvisionStep;
  status: "pending" | "done" | "error" | "manual";
  detail: string | null;
  executed_at: string | null;
};
