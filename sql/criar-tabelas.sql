-- Reuniões do Baleia: tabelas do banco de dados
-- Rode este arquivo inteiro no Supabase: SQL Editor > New query > colar > Run.
-- Pode rodar mais de uma vez sem problema.
--
-- Só o servidor do app acessa estas tabelas (com a chave secreta "service_role").
-- Por isso o RLS fica ligado e sem nenhuma regra de acesso público.

create table if not exists public.reunioes (
    id            text primary key,
    secao         text not null,
    dados         jsonb not null default '{}'::jsonb,   -- resumo e pontuação, embaralhados com a palavra-código da seção
    atualizado_em timestamptz not null default now()
);

create table if not exists public.formularios (
    id            text primary key,                      -- mesmo id da reunião
    secao         text not null,
    dados         jsonb not null default '{}'::jsonb,   -- formulário completo, embaralhado
    atualizado_em timestamptz not null default now()
);

create table if not exists public.jogos (
    id            text primary key,
    secao         text not null,                         -- seção que enviou o jogo
    dados         jsonb not null default '{}'::jsonb,   -- nome, tipo, descrição, material, eixos, intencionalidade (legível)
    atualizado_em timestamptz not null default now()
);

create index if not exists reunioes_secao_idx on public.reunioes (secao);
create index if not exists jogos_secao_idx on public.jogos (secao);

alter table public.reunioes    enable row level security;
alter table public.formularios enable row level security;
alter table public.jogos       enable row level security;

-- Nenhum acesso pela chave pública (anon/authenticated): só o servidor grava e lê.
revoke all on public.reunioes, public.formularios, public.jogos from anon, authenticated;

-- O servidor (chave secreta, papel service_role) precisa ler e gravar.
-- Projetos novos do Supabase não dão essa permissão sozinhos.
grant select, insert, update, delete on public.reunioes, public.formularios, public.jogos to service_role;

-- ---------- Plano de segurança (página /seguranca) ----------
create table if not exists public.planos_seguranca (
    id            text primary key,
    secao         text not null,
    dados         jsonb not null default '{}'::jsonb,   -- plano completo e resumo, embaralhados com a palavra-código da seção
    atualizado_em timestamptz not null default now()
);

create table if not exists public.base_seguranca (
    id            text primary key,                      -- local:..., apoio:..., config:diretoria
    secao         text not null default 'diretoria',
    dados         jsonb not null default '{}'::jsonb,   -- locais salvos, delegacias/hospitais e nomes da diretoria (legível)
    atualizado_em timestamptz not null default now()
);

create index if not exists planos_seguranca_secao_idx on public.planos_seguranca (secao);

alter table public.planos_seguranca enable row level security;
alter table public.base_seguranca   enable row level security;
revoke all on public.planos_seguranca, public.base_seguranca from anon, authenticated;
grant select, insert, update, delete on public.planos_seguranca, public.base_seguranca to service_role;
