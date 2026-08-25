import {
  LayoutDashboard,
  Building2,
  CalendarDays,
  BarChart3,
  Map as MapIcon,
  MessageCircle,
  UserMinus,
  Plug,
  Boxes,
  Settings,
  ListTodo,
  Eye,
  KeyRound,
  type LucideIcon,
} from "lucide-react";

export type NavItem = {
  href: string;
  label: string;
  icon: LucideIcon;
  gestorOnly?: boolean;
};

// Fonte única das páginas principais — consumida pela sidebar (app-nav) e pela
// paleta de busca (Ctrl+K, seção "Ir para"). Mudou a navegação num lugar, mudou
// nos dois.
export const navItems: NavItem[] = [
  { href: "/", label: "Início", icon: LayoutDashboard },
  { href: "/clinicas", label: "Clínicas", icon: Building2 },
  { href: "/mensal", label: "Mensal", icon: CalendarDays },
  { href: "/comparativo", label: "Comparativo", icon: BarChart3 },
  { href: "/tarefas", label: "Tarefas", icon: ListTodo },
  { href: "/acompanhamentos", label: "Acompanhamentos", icon: Eye },
  { href: "/mapa", label: "Mapa", icon: MapIcon },
  { href: "/whatsapp", label: "Gerenciador de grupos", icon: MessageCircle },
  { href: "/churns", label: "Churns", icon: UserMinus },
  // Sistemas: estado de integração da carteira (ADR 0007). Distinto de
  // /configuracoes, que é regra da plataforma.
  { href: "/sistemas", label: "Sistemas", icon: Boxes },
  { href: "/helena", label: "Contas Helena", icon: Plug },
  // Cofre: devs também acessam — veem só os itens que o gestor compartilhou
  // (filtro por visible_to_devs no servidor).
  { href: "/cofre", label: "Cofre", icon: KeyRound },
  { href: "/configuracoes", label: "Configurações", icon: Settings },
];
