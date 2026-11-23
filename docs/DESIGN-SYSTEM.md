# Workspace Premium · design system

Regras visuais do Workspace 2.0. **A identidade é a da agência:** preto, branco e o vermelho institucional, mais os tokens de `src/app/globals.css`. Não há cores novas. Marcas só pelos componentes de `src/components/brand/` (na versão de portfólio, marcadores de texto neutros).

## Materiais: um para cada função

| Material | Quando usar | Como |
|---|---|---|
| **Surface** | Conteúdo de leitura e escrita: cartões, formulários, listas, briefings | `rounded-card border border-hairline bg-paper` (`Card` em `primitives.tsx`). Sem sombra. |
| **Ink surface** | Destaques de identidade: cabeçalho do perfil, cabeçalho do "Gerenciar", código de convite | `bg-ink text-paper` com `brand-grid` fino e, no máximo, uma luz vermelha radial **contida** (`overflow-hidden`) |
| **Glass** | Elementos secundários sobre conteúdo: abas do mural, chips | **Só vidro escuro** (ajuste 5): `glass-dark` sobre preto/vermelho e `glass-ink` sobre fundo claro. O `glass` claro saiu de uso |
| **Liquid Glass** | **Só** em elementos flutuantes e especiais: dock, menu "Mais", card do login | Componente `LiquidGlass` (`src/components/ui/liquid-glass.tsx`): refração no Chromium desktop, vidro fosco no Safari e no celular, sólido com "reduzir transparência" |
| **Overlay** | Sheets, modais e menus acima do conteúdo | Véu `bg-ink/50 backdrop-blur-[3px]`. Painel **sólido** (`bg-paper`) com `shadow-overlay`. Componente `Sheet` |

Regras:
- **Nunca** coloque vidro refrativo atrás de blocos grandes de texto, nem dentro de campos.
- **Nada animado atrás de vidro**, porque o navegador refaria o desfoque a cada quadro.
- **Um material por camada.** Não empilhe vidro sobre vidro.

## Capas de página (`PageHero`)

Início, Equipe e Clientes abrem com `PageHero` (`src/components/ui/page-hero.tsx`): `rounded-card`, traço vermelho no topo e `brand-grid-diagonal` bem sutil.
- **Tom claro** (`tone="paper"`, `traces={1|2}`): os TRAÇADOS oficiais ficam numa faixa própria, apoiados na borda de baixo, nunca atrás do texto.
- **Tom preto** (`tone="ink"`): luz vermelha contida e marcas **negativas** no `aside`.

## Sombras (tokens `@theme`)

- `shadow-float`: o que flutua sobre o conteúdo (dock, menus).
- `shadow-overlay`: painéis e sheets.
- `shadow-brand`: brilho do botão vermelho principal.

Cartões planos não têm sombra; a separação vem da borda `hairline`.

## Botões (`src/components/ui/button.ts`)

`buttonClass(variant, size)`:

| Variante | Uso |
|---|---|
| `primary` | Vermelho: **a** ação principal da área (uma por área) |
| `dark` | Preto: ação forte secundária |
| `outline` | Ações neutras: Cancelar, Gerenciar |
| `ghost` | Ações discretas |
| `danger` | Ações destrutivas. **Sempre** com confirmação (ex.: desativar em 2 passos) |

Tamanhos: `sm` (36px), `md` (44px, o padrão), `lg` (48px). No celular, a área de toque mínima é de 40 a 44px.

## Campos

`fieldLabel` e `fieldInput` (`sheet.tsx`): rótulo de 10px em caixa alta. O campo tem 16px no celular (evita o zoom do iOS), hover sutil e foco com anel de 4px.

## Forma

- `rounded-card` (10px): cartões e painéis.
- `rounded-tile` (6px): elementos internos e botões.
- `rounded-full`: pílulas, avatares e itens do dock.
- Raio grande (24 a 30px): só sheets no celular e superfícies Liquid Glass.

## Tipografia

- Títulos: `<Light>` + peso 800, com a palavra-chave em `<Accent>` e `<Dot />` no fim.
- Rótulos: 10–11px, bold, caixa alta, `tracking` largo.
- Números: `font-light tabular-nums`.
- Nada abaixo de 10px.

## Movimento (`motion/react`)

- Curva da marca: `[0.22, 1, 0.36, 1]` (token `ease-brand`).
- Entradas de 0,3 a 0,6 s; molas para painéis (rigidez 300 a 420, amortecimento 30 a 38).
- Destaques ativos deslizam (`layoutId`): `dock-active` e `sidebar-active`.
- Toque: `whileTap` com escala de 0,94 a 0,98. Nada pisca nem fica pulando.
- `MotionConfig reducedMotion="user"` já está no shell; decorações têm `motion-reduce:hidden`.

## Ícones

Só **Lucide** (`lucide-react`), com `strokeWidth` 2,2 na navegação. Não misture famílias.

## Estados vazios

Uma frase curta (`font-light text-muted`) dentro de uma borda tracejada (`border-dashed border-ink/15`), opcionalmente com uma ação. Nunca use números ou indicadores fictícios.
