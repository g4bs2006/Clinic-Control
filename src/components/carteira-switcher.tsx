"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { setCarteira } from "@/lib/users/actions";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const ALL = "__all__";

/**
 * Seletor global de carteira (só gestor). Grava a escolha no cookie via
 * `setCarteira` e recarrega para todas as páginas reagirem ao novo escopo.
 */
export function CarteiraSwitcher({
  options,
  selected,
  onOpenChange,
}: {
  options: { id: string; name: string }[];
  selected: string | null;
  /** Avisa a sidebar quando o dropdown abre/fecha, p/ ela não recolher no hover. */
  onOpenChange?: (open: boolean) => void;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function onChange(value: string) {
    const devId = value === ALL ? null : value;
    startTransition(async () => {
      await setCarteira(devId);
      router.refresh();
    });
  }

  return (
    <Select
      value={selected ?? ALL}
      onOpenChange={onOpenChange}
      items={{
        [ALL]: "Todas as carteiras",
        ...Object.fromEntries(options.map((o) => [o.id, o.name])),
      }}
      onValueChange={(v) => onChange(v ?? ALL)}
    >
      <SelectTrigger
        className="h-8 w-full text-xs"
        size="sm"
        disabled={pending}
        aria-label="Filtrar por carteira"
      >
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={ALL}>Todas as carteiras</SelectItem>
        {options.map((o) => (
          <SelectItem key={o.id} value={o.id}>
            {o.name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
