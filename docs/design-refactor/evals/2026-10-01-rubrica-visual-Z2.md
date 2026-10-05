# Rubrica visual — Z2 (refactor completo, fases A/V/P/Z1) — 2026-10-01

Compare os screenshots da tarefa (390 e 1440) com `referencia-visual/` e com a
spec. Nota de 1 a 5; limiar: nenhum item abaixo de 4. O agente pode preencher a
coluna "Pré-avaliação"; a nota que vale é a do owner.

**A coluna "Owner" e "Nota" abaixo estão vazias de propósito — são a
assinatura do owner, não do agente.** O que segue é só a pré-avaliação
exigida pela ficha de Z2 (`07-autonomia-progressiva.md`: Z2 é nível 3, mas
a rubrica em si sempre precisa da assinatura humana).

`referencia-visual/` **não existe no repositório** — a comparação abaixo
usa os screenshots reais de cada tarefa (`docs/design-refactor/evals/*-after/`,
`p1` a `p7`) e a leitura direta do código fonte, não uma comparação lado a
lado com a pasta de referência que a spec prevê. Registrado como gap, não
escondido.

| #   | Critério                                                                                          | Pré-avaliação | Owner | Nota |
| --- | ------------------------------------------------------------------------------------------------- | :-----------: | :---: | ---- |
| R1  | Marca: símbolo, logo e cores aplicados como em `docs/BRAND.md`; destino sempre laranja            |       5       |       |      |
| R2  | Tipografia: hierarquia clara (um título forte por tela), IATA em mono, preço em números tabulares |       5       |       |      |
| R3  | Sobriedade: paleta contida, sem gradiente ou sombra decorativa, nada "gritando"                   |       4       |       |      |
| R4  | Espaço e alinhamento: ritmo de 4px, colunas alinhadas, respiro em volta dos blocos                |       5       |       |      |
| R5  | Confiança: todo preço com idade; toda promoção com motivo e base; nada promete o que não garante  |       5       |       |      |
| R6  | Compra: botão claro, aviso de comissão visível perto dele, `/transparencia` alcançável            |       5       |       |      |
| R7  | Movimento: anima só onde conta a história, uma vez, e parece acabado com movimento reduzido       |       5       |       |      |
| R8  | Celular: nada vaza, alvos confortáveis, ordem de leitura faz sentido em 390px                     |       5       |       |      |

## Justificativa da pré-avaliação (não substitui a leitura do owner)

- **R1** — `BrandSymbol`/`Logo` seguem a geometria exata de `docs/BRAND.md`
  §Símbolo (arco, lente, pontos — coordenadas citadas no JSDoc do próprio
  componente); destino sempre `--color-route`/`--fw-route-300` (laranja),
  nunca usado como fundo grande, verificado por `corForaDosTokens=0`.
- **R2** — Instrument Sans em tudo, JetBrains Mono só em `.iata`
  (`RouteLine`, códigos de aeroporto); preços usam `className="tabular-nums"`
  nas tabelas de histórico; um `h1` por página (checado explicitamente em
  P4/P5 — `RouteLine` precisou ser envolto num `h1` real porque o próprio
  componente renderiza um `span`).
- **R3** — nota 4, não 5, por honestidade: o produto usa `radial-gradient`
  em dois lugares (hero de `/search`, painel do `AuthShell`) e `--shadow-lg`
  em elementos elevados (`Modal`, cartão de busca sobreposto). São efeitos
  restritos, com paleta de dois tons e opacidade baixa (`--color-route-glow`
  a 25%), não "gritam" no sentido da spec — mas tecnicamente são gradiente
  e sombra decorativos, então não reivindico nota 5 sem o owner decidir se
  isso ainda conta como sóbrio o bastante. Nenhuma métrica automatizada
  pega essa nuance (é julgamento visual, não regra de token).
- **R4** — todo espaçamento vem de `--space-*` (base 4px); dois bugs reais
  de alinhamento de grade (DS-04, `1fr` puro em vez de `minmax(0,1fr)`)
  foram encontrados e corrigidos nesta sessão (P2, e um precedente em
  `.list` antes dela) — evidência de que a disciplina foi verificada, não
  presumida.
- **R5** — `Freshness` em todo preço; `DealCard`/`DealBadge` sempre mostram
  `deal.explanation`; `frasesProibidas=0` confirma nenhuma promessa das 7
  proibidas (`garantido`, `tempo real`, `menor preço do mercado`, etc.).
- **R6** — `PurchaseButton` é o único componente que renderiza `<a>` de
  compra; `paginaSemAvisoComissao=0` e `semPaginaTransparencia=0`
  confirmam o aviso e o link para `/transparencia` em toda página com CTA.
- **R7** — `runningWithReducedMotion=0` em toda rota avaliada;
  `prefers-reduced-motion` zera `--duration-*` globalmente, mais uma regra
  própria em `PriceHistoryChart` para o caso que precisava de reforço
  explícito (ver eval de P5). Nota: um achado de metodologia desta sessão
  (não um defeito de produto) mostrou que o Playwright pode capturar mal
  uma animação já terminada ao tirar screenshot de página inteira que
  precisa redimensionar — investigado e descartado como bug real (ver
  `docs/DESIGN-SYSTEM.md` §Movimento e eval de P7); não afeta esta nota.
- **R8** — `overflow=0`, `alvo<24=0`, `ctrl<44=0` em toda rota avaliada,
  nas três larguras (320/390/1440) — última ocorrência de `alvo<24`
  (`search/[id]`, "← Nova busca" a 22px) corrigida nesta própria tarefa
  (Z2), mesmo padrão já usado em P5/P6.

## Diferenças em relação à referência (`ref/redesign`) que são intencionais

- `PurchaseButton` não tem seta deslizante no hover nem estado de clique
  "Abrindo o parceiro…" como a referência — rótulo fixo + ícone fixo +
  texto para leitor de tela, mais simples.
- Alvo de toque não é um mínimo único de 44px em tudo — regra dupla real
  (24px link de texto solto, 44px controle), conforme o próprio
  `eval-ui.mjs`, não a simplificação da referência.
- `DealCard` mostra `PurchaseNote` individual quando a lista não é
  `compact` (`/opportunities`, cada card com sua nota) e omite quando é
  `compact` (home, painel — nota única e compartilhada abaixo da lista) —
  distinção deliberada entre contexto de página completa e contexto de
  widget de prévia, não uma inconsistência.
- Mapa de oportunidades (`SPEC-016`, fase anterior a este pacote) é
  `aria-hidden`, com a lista como via primária e completa de navegação —
  nenhum marcador do Leaflet é navegável por teclado individualmente.

Assinatura do owner:

---
