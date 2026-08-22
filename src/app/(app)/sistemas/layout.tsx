// Layout de /sistemas com slot paralelo `@modal` — ADR 0007.
//
// A configuração de um sistema abre como modal SOBRE a matriz, mas com URL de
// verdade (`/sistemas/<clinicId>/<sistema>`). Isso resolve quatro coisas que um
// <Dialog> de estado local não resolve:
//   · a URL é compartilhável — dá para mandar a configuração de uma clínica
//     específica para um colega;
//   · F5 não fecha o modal, renderiza a página cheia (não se perde o que estava
//     sendo feito);
//   · Voltar fecha o modal em vez de sair da página; avançar reabre;
//   · a matriz continua montada atrás, então filtro e busca sobrevivem.
//
// A interceptação só acontece em navegação SUAVE. Em carga direta ou F5 o slot
// `@modal` não casa e cai no `default.tsx`, enquanto `children` renderiza a
// página cheia — é por isso que os dois arquivos existem.
export default function SistemasLayout({
  children,
  modal,
}: {
  children: React.ReactNode;
  modal: React.ReactNode;
}) {
  return (
    <>
      {children}
      {modal}
    </>
  );
}
