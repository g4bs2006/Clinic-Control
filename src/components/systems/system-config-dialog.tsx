"use client";

// Casca de modal para a rota interceptada — ADR 0007.
//
// Fechar chama `router.back()` em vez de setar estado: a URL é a fonte da
// verdade do que está aberto, então fechar é desfazer a navegação. É o que faz
// o botão Voltar do browser fechar o modal e o Avançar reabrir.
//
// `onOpenChange` cobre Esc e clique no backdrop pelo mesmo caminho — três
// gestos de fechar, um único efeito.
import { useRouter } from "next/navigation";
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";

export function SystemConfigDialog({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle: string;
  children: React.ReactNode;
}) {
  const router = useRouter();

  return (
    <Dialog open onOpenChange={(v) => !v && router.back()}>
      <DialogContent className="max-h-[85vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{subtitle}</DialogDescription>
        </DialogHeader>
        {children}
      </DialogContent>
    </Dialog>
  );
}
