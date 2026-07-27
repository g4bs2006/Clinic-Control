-- Contatos dos parceiros do ecossistema (estrategistas e gestores de tráfego).
-- Antes as listas viviam só em código (strategists.ts / traffic-managers.ts);
-- agora vira tabela para poder anexar e-mail + telefone a cada pessoa e
-- gerenciar tudo pela tela (Configurações → Equipe & Conta). A clínica continua
-- guardando o NOME (clinics.strategist / clinics.traffic_manager) — a busca de
-- contato é por (role, name). `active` esconde da seleção sem apagar histórico.
set search_path to clinic_control, public;

create table if not exists partner_contacts (
  id uuid primary key default gen_random_uuid(),
  role text not null check (role in ('strategist', 'traffic_manager')),
  name text not null,
  email text,
  phone text,
  position int not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (role, name)
);

-- Seed com as listas que existiam em código, preservando a ordem.
insert into partner_contacts (role, name, position) values
  ('strategist', 'Ana Paula e Guilherme Battistella', 0),
  ('strategist', 'Ana Paula', 1),
  ('strategist', 'Ana Flávia', 2),
  ('strategist', 'Schumacher', 3),
  ('strategist', 'Rodrigo', 4),
  ('strategist', 'Gui Ferreira', 5),
  ('strategist', 'Thalia', 6),
  ('strategist', 'Amanda', 7),
  ('traffic_manager', 'Filipe e Rani', 0),
  ('traffic_manager', 'Ranielle', 1),
  ('traffic_manager', 'João Lucas', 2),
  ('traffic_manager', 'Rodrigo', 3)
on conflict (role, name) do nothing;
