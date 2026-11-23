# Workspace de Agência — versão de portfólio

Plataforma web **mobile-first** de gestão interna, criada para uma agência de comunicação e marketing
e usada em produção pela equipe no dia a dia.

> **Sobre esta versão.** É uma cópia do código preparada para estudo e apresentação. Ficaram de fora:
> logotipos e arquivos da identidade visual (marcas registradas da agência), fotos e nomes da equipe,
> documentação interna e o histórico do Git. No lugar das marcas há marcadores de texto neutros
> ("Workspace", "W"). Nenhum dado real e nenhuma chave acompanham o repositório.

## O problema

A agência organizava tarefas, aprovações, briefings e gravações em grupos de WhatsApp e planilhas.
Ninguém sabia com certeza o que estava atrasado, quem era responsável pelo quê ou em que etapa cada
entrega estava. O objetivo era centralizar tudo num app que funcionasse bem no celular.

## Funcionalidades

| Área | O que faz |
|---|---|
| **Início** (`/dashboard`) | Saudação, "sua próxima entrega", minhas tarefas, itens que pedem atenção e prazos |
| **Mural** (`/tarefas`) | Quadro kanban (A fazer → Em produção → Em revisão → Ajustes → Aprovado → Entregue), post-its, checklists e **calendário** |
| **Tarefas** | Responsáveis, prioridade, prazo, checklist, comentários, links, histórico e "cobrar" uma tarefa atrasada |
| **Briefings** (`/briefings`) | Briefings ligados a clientes, com participantes |
| **Gravações** (`/gravacoes`) | Agenda de gravações com equipe, status e local |
| **Clientes e projetos** (`/clientes`) | Cadastro feito pela administração; tarefas e gravações se ligam a eles |
| **Equipe e perfis** | Perfil com foto (armazenamento privado), funções profissionais e carga de trabalho |
| **Avisos** | Sininho com o que outras pessoas fizeram nas suas tarefas + **notificações push** no celular |
| **Administração** (`/admin`) | Convites por código de ativação, níveis de acesso, ativar/desativar contas, link de nova senha |
| **App instalável** | Manifesto PWA ("Adicionar à tela de início") |

## Arquitetura

```
Navegador (React 19)
   │  Server Actions / Route Handlers
   ▼
Next.js 16 (App Router, Cache Components) ── proxy.ts: sessão + proteção de rotas (falha fechada)
   │  cliente Supabase com a sessão do usuário
   ▼
Supabase (Postgres + Auth + Storage)
   ├─ RLS em todas as tabelas: cada pessoa só lê o que pode
   ├─ Gravações SÓ por funções SQL (task_*, briefing_*, recording_*, admin_* …),
   │  que conferem quem chama e aplicam as regras de negócio
   └─ access_audit: registro de toda mudança de privilégio
```

Decisões que valem a pena discutir:

- **Regras de negócio no banco.** O cliente não grava direto nas tabelas: chama funções SQL que
  validam permissão e estado (por exemplo, só o responsável move a própria tarefa). Assim a segurança
  não depende do front-end.
- **Espelho das regras no front.** `src/lib/mural/model.ts` repete as regras para a interface
  esconder botões que o banco recusaria. Ele é coberto por testes de unidade.
- **Sem cadastro público.** Contas nascem por convite com código. O nível de acesso não é editável
  pela API (permissão por coluna + RLS), e um gatilho impede que o sistema fique sem administrador.
- **Chave secreta com privilégio mínimo.** Mesmo a chave do servidor não lê as tabelas diretamente:
  usa funções específicas.
- **Push sem cache offline.** O service worker (`public/sw.js`) só trata push e clique, de propósito,
  para não guardar dados internos no aparelho.
- **Avisos derivados do histórico.** Não existe tabela de mensagens: os avisos são calculados a partir
  de `task_events`, e só o "visto" é gravado.

## Stack

Next.js 16 · React 19 · TypeScript estrito · Tailwind CSS 4 · Motion for React · Supabase
(Postgres, Auth, Storage, RLS) · Web Push · Vitest · Playwright · Netlify (hospedagem e função agendada)

## Estrutura

```
src/
  app/             rotas: (app)/ área logada · (auth)/ telas de acesso
  components/      shell (sidebar + tab bar), views (uma por tela), tasks, mural, ui …
  lib/
    mural/         model.ts (regras + tipos, testado) · queries.ts (leitura) · actions.ts (gravação)
    auth/ admin/ profile/ push/ supabase/
  proxy.ts         sessão e proteção de rotas
supabase/migrations/   esquema do banco, RLS e funções (SQL versionado)
tests/
  unit/            regras puras (Vitest)
  integration/     RLS contra um banco real
  e2e/             navegador em iPhone, Android e desktop (Playwright)
docs/DESIGN-SYSTEM.md  materiais, sombras, botões, forma e movimento
```

## Como rodar

Requisitos: Node.js 20+ e uma conta gratuita no [Supabase](https://supabase.com).

```bash
npm install
npm test            # testes de unidade: funcionam sem banco
```

Para abrir o app:

1. Crie um projeto no Supabase e copie `.env.example` para `.env.local`, preenchendo
   `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` e `SUPABASE_SECRET_KEY`.
   Sem essas variáveis, o site responde 503 (falha fechada, de propósito).
2. Aplique o esquema:
   ```bash
   npx supabase login
   npx supabase link --project-ref <ref-do-projeto>
   npx supabase db push
   ```
3. Crie um usuário em **Authentication → Users** e, no **SQL Editor**, torne-o administrador:
   ```sql
   select private.bootstrap_principal('seu-email@exemplo.com');
   ```
4. `npm run dev` e abra http://localhost:3000.

| Comando | O que faz |
|---|---|
| `npm run dev` | Servidor de desenvolvimento |
| `npm run build` | Build de produção (inclui checagem de tipos) |
| `npm run lint` | ESLint |
| `npm test` | Testes de unidade |
| `npm run test:db` | Testes de RLS no banco (exigem `TEST_USER_EMAIL`/`TEST_USER_PASSWORD` de um colaborador) |
| `npm run test:e2e` | Testes no navegador (Playwright) |

## Direitos

O código é apresentado para fins de estudo. A identidade visual, o nome e os dados da agência
não fazem parte deste repositório e não podem ser usados.
