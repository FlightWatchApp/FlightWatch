# SPEC-039 — Alerta de preço baixo pelo histórico (fim do preço desejado)

Status: draft — aguardando revisão do owner
Owner: Alerting
Dependências: SPEC-005 (avaliação de alertas), SPEC-006 (notificação),
SPEC-008 (ciclo do Watch), SPEC-014 (Watch a partir de oferta), SPEC-031
(calendário de preços), SPEC-032 (mediana das datas próximas), SPEC-035
(regras do lançamento — **substituída por esta spec**)
Decisões do owner: conversa de 2026-10-14 (ver "Decisões")

## Objetivo

Quem monitora uma passagem não precisa adivinhar um preço. O sistema sabe
qual é o **preço normal** daquela viagem e avisa quando aparece um preço
**bem abaixo do normal** ou **o menor já observado** — por exemplo, uma
queda de madrugada.

## Problema que resolve

- O campo **preço desejado** abre brecha: a pessoa digita R$ 1, o alerta
  nunca dispara e o produto parece não funcionar; ou digita um valor alto e
  recebe avisos sem valor.
- O **novo menor preço observado** de hoje (`NEW_OBSERVED_LOW`) compara só
  com o que foi visto **desde a criação do Watch**: o primeiro preço vira a
  referência e qualquer centavo abaixo dele gera aviso, sem dizer se o preço
  está bom de verdade.

## Decisões do owner (2026-10-14)

- **D1** O preço desejado sai **completamente**: da tela, da API de criação
  e dos Watches existentes.
- **D2** O alerta dispara em dois casos: preço **pelo menos 15% abaixo do
  preço normal**, ou **abaixo do menor preço já observado**.
- **D3** O usuário **não escolhe** a porcentagem; ela é fixa no sistema
  (configurável só pela operação).
- **D4** Ao criar o monitoramento, a pessoa vê o histórico (gráfico), o
  preço normal e o menor preço já observado.

## Fora do escopo

- Regras escolhidas pelo usuário (porcentagem, valor, tipo de alerta).
- Previsão de preço ou IA (CLAUDE.md §2.2): a regra é um cálculo fixo e
  explicável.
- Aumentar a frequência de consulta por Watch (fica para o piloto com dados
  reais; ver "Limites").
- Remover do banco os tipos antigos (`TARGET_PRICE`, `PERCENTAGE_DROP`,
  `ABSOLUTE_DROP`, `NEW_OBSERVED_LOW`): continuam no enum para auditoria dos
  alertas já enviados.

## Comportamento

### Conceitos

Para um `SearchTarget` (a viagem compartilhada: origem, destino, datas,
passageiros — ADR-005), no momento de cada observação:

- **Preço normal** (`typicalAmountMinor`):
  1. **histórico próprio**: mediana do **menor preço de cada dia** das
     observações válidas do `SearchTarget` nos últimos **30 dias**, se houver
     pelo menos **5 dias** com observação;
  2. senão, **datas próximas**: a mediana das datas vizinhas no calendário da
     fonte (mesmo cálculo da SPEC-032, `medianMinor` no domínio), gravada no
     Watch na criação (ver "Linha de base");
  3. senão, **sem preço normal**: só o caso "menor já observado" vale.
- **Menor já observado** (`lowestAmountMinor`): o menor preço válido do
  `SearchTarget` nos últimos **90 dias**, de **qualquer** Watch — não só
  desde a criação deste. Sem nenhuma observação anterior, não existe.

A observação que está sendo avaliada nunca entra na própria referência.
Observações com moeda diferente da do Watch são ignoradas (CLAUDE.md §8.1).

### Regra `LOW_PRICE`

Novo tipo de regra, o **único** criado para Watches novos. Dispara quando
qualquer um dos casos vale:

| Motivo            | Condição (inteiros, sem ponto flutuante — H03) |
| ----------------- | ---------------------------------------------- |
| `BELOW_TYPICAL`   | `atual × 100 ≤ normal × (100 − 15)`            |
| `LOWEST_OBSERVED` | `atual < menor já observado`                   |

- Os dois motivos podem valer juntos; vira **um** alerta e **um** e-mail,
  com os dois motivos.
- Os 15% ficam gravados na regra (`dropPercent`) na criação, vindos de
  `ALERT_LOW_PRICE_DROP_PERCENT` (padrão 15, inteiro de 5 a 50), lida pela API
  em `packages/config` e documentada no `.env.example`. Mudar a variável vale só para
  Watches novos; os existentes mantêm o valor com que foram criados
  (auditável — SPEC-005 §9).

### Sem spam

1. **Só cai mais**: depois de um alerta, o próximo só dispara se o preço
   atual for **menor que o preço do último alerta enviado** da mesma regra.
   Preço que sobe e volta ao mesmo valor não gera aviso repetido.
2. **Cooldown** de 12 h, como hoje (SPEC-035): um alerta que passa a regra
   dentro da janela fica `SUPPRESSED` (`COOLDOWN_ACTIVE`).
3. Avaliação não elegível por (1) registra `not_triggered` com motivo
   `NOT_BELOW_LAST_ALERT` na justificativa, para auditoria.

### Linha de base na criação

- Ao criar o Watch, a API calcula a mediana das **datas próximas** pelo
  calendário em cache (SPEC-031/032; mesmo orçamento e cache, sem chamada
  extra quando o cache está fresco) e grava na regra:
  `baselineAmountMinor`, `baselineSource` (`NEARBY_DATES`) e
  `baselineComputedAt`.
- Sem calendário (fonte fora, rota sem dados, ida e volta sem calendário),
  a linha de base fica vazia; o Watch é criado normalmente.
- A linha de base não é recalculada: assim que houver 5 dias de histórico
  próprio, ele passa a valer (item 1 do preço normal).

### Tela de criação (`/watches/new` e "Monitorar" a partir de oferta)

- **Sai** o campo "Preço desejado".
- **Entra** um resumo antes do botão:
  > São Paulo → Brasília · 20/11
  > Preço normal **R$ 450** · Menor já observado **R$ 380** · Hoje **R$ 470**
  > [gráfico de preço]
  > Vamos avisar quando observarmos um preço pelo menos 15% abaixo do normal
  > ou o menor preço já observado pelo Flight Watch.
- Gráfico: histórico próprio, se houver; senão, preço por data das datas
  próximas (`PriceByDateChart`, o mesmo da página da rota e da SPEC-038).
- Sem dados: "Ainda não temos histórico desta viagem. Vamos acompanhar e
  avisar quando o preço cair." O botão continua habilitado.
- Texto obrigatório: "menor preço já observado pelo Flight Watch", nunca
  "menor preço do mercado" (CLAUDE.md §2.3).

### Página do monitoramento (`/watches/[id]`)

- Mostra preço normal, menor já observado e preço atual, com uma linha do
  preço normal no gráfico (`PriceHistoryChart`).
- Diz de onde vem o preço normal: "do histórico dos últimos 30 dias" ou
  "das datas próximas".

### E-mail

Template novo para `LOW_PRICE` (versão nova do template, SPEC-006):

> **R$ 360** para São Paulo → Brasília em 20/11
> 20% abaixo do preço normal (R$ 450) · o menor preço já observado pelo
> Flight Watch
> Preço visto em 14/10 às 03:12. Pode mudar até a compra.

Os motivos aparecem só quando valem. O e-mail leva à página do
monitoramento.

## Contrato da API

- `POST /v1/watches` e `POST /v1/offers/:id/watch`: o campo `alertRules`
  **deixa de ser aceito** do cliente. A API cria sempre uma regra
  `LOW_PRICE`. Requisição com `alertRules` → `400`
  (`ALERT_RULES_NOT_ACCEPTED`), para nenhum cliente achar que escolheu algo.
  Mudança incompatível dentro de `v1`, aceita porque o único cliente é o
  web (BFF) e os dois sobem juntos.
- `GET /v1/watches/preview?origin&destination&departureDate&returnDate&adults`
  (autenticado, rate limit `pages`): `typicalAmountMinor`,
  `typicalSource` (`HISTORY` | `NEARBY_DATES` | `NONE`),
  `lowestAmountMinor`, `currentAmountMinor`, `currency`, série do gráfico e
  `dropPercent`. Não cria nada.
- `GET /v1/watches/:id`: ganha `typicalAmountMinor`, `typicalSource`,
  `lowestAmountMinor` (aditivo).
- Schemas Zod em `packages/contracts`.

## Persistência e migração

Migração **só aditiva**:

- `AlertRuleType` ganha `LOW_PRICE`.
- `AlertRule` ganha `baselineAmountMinor Int?`, `baselineSource String?`,
  `baselineComputedAt DateTime?`. `dropPercent` (já existe) guarda os 15%.
- Índice para as consultas de referência, se o plano de execução pedir:
  `price_observations (search_target_id, observed_at)` (conferir o que já
  existe antes de criar).

**Watches existentes** (backfill, script limitado, reiniciável e
idempotente — CLAUDE.md §19):

- para cada Watch `ACTIVE` ou `PAUSED`: as regras antigas ficam
  `enabled = false` (não são apagadas: os alertas já enviados apontam para
  elas) e é criada uma regra `LOW_PRICE`, sem linha de base;
- Watches terminais não mudam;
- rodar duas vezes não cria regra duplicada (tipo único por Watch,
  `assertUniqueAlertRuleTypes`);
- precisa de aprovação do owner antes de rodar em produção (CLAUDE.md §21).

## Idempotência e concorrência

- Igual à SPEC-005: `deduplicationKey` por observação e regra; trava da
  linha da `AlertRule` antes do cooldown.
- A regra "só cai mais" lê o último `AlertEvent` `QUEUED`/`NOTIFIED` dentro
  da mesma transação da trava, para duas observações simultâneas não
  passarem as duas.

## Desempenho

- Preço normal e menor já observado são **uma consulta por `SearchTarget`
  por observação**, não por Watch: o fan-out (H09) reaproveita o resultado
  para todos os Watches da mesma viagem. Por Watch, só a linha de base (já
  carregada com a regra) e o último alerta.
- Benchmark existente de fan-out continua valendo; a consulta nova entra
  nele.

## Observabilidade

- `alert_rules_evaluated_total{type,result}` passa a ter `type="LOW_PRICE"`.
- `alert_low_price_reason_total{reason}` — `below_typical`,
  `lowest_observed`, `both`.
- `alert_low_price_reference_total{source}` — `history`, `nearby_dates`,
  `none` (mostra quantos Watches ainda dependem da linha de base).
- Justificativa do `AlertEvent`: preço normal, fonte, menor já observado,
  limiar calculado, motivos, último alerta comparado.

## Limites (dizer ao usuário a verdade)

- Os preços vêm de cache da fonte (SPEC-030): uma queda que dure pouco pode
  não aparecer, ou aparecer com atraso de algumas horas. O site **não
  promete** pegar toda promoção relâmpago; o texto é "avisamos quando
  observarmos…".
- A frequência de consulta é a do scheduler; aumentar é decisão de custo,
  fora desta spec.

## Critérios de aceitação

- **AC-1** Não existe campo de preço desejado em nenhuma tela; a API recusa
  `alertRules` do cliente.
- **AC-2** Watch novo tem exatamente uma regra, `LOW_PRICE`, com 15%.
- **AC-3** Preço 15% ou mais abaixo do normal dispara; 14% abaixo não
  dispara (borda exata testada em centavos).
- **AC-4** Preço abaixo do menor já observado (de qualquer Watch da mesma
  viagem, 90 dias) dispara; igual não dispara.
- **AC-5** Os dois motivos juntos geram um alerta e um e-mail.
- **AC-6** Depois de um alerta, preço igual ou maior que o do alerta não
  gera outro; menor gera (respeitando o cooldown).
- **AC-7** Preço normal usa o histórico com 5+ dias; com menos, a linha de
  base; sem nenhum, só o menor já observado.
- **AC-8** A tela de criação mostra preço normal, menor já observado,
  preço de hoje e gráfico, ou o estado "sem histórico".
- **AC-9** Backfill: Watches ativos e pausados ficam só com `LOW_PRICE`
  ativa; regras antigas desativadas, não apagadas; rodar de novo não muda
  nada.
- **AC-10** Replay da mesma observação três vezes gera um alerta só (H05).

## Testes e evals

- Domínio (puro): `evaluateLowPriceRule` — bordas de 15% em centavos,
  menor já observado (igual/menor), motivos combinados, "só cai mais",
  sem referência; `typicalPrice` (mediana do menor por dia, mínimo de 5
  dias, janela de 30 dias, troca para a linha de base).
- Alert-worker (integração, Postgres real): fan-out com vários Watches na
  mesma viagem; cooldown; concorrência de duas observações; replay 3×.
- API (e2e): criação sem `alertRules`; `400` com `alertRules`; preview com
  histórico, só datas próximas e sem dados.
- Backfill: idempotência e Watches terminais intocados.
- Web/E2E: criação sem o campo, resumo e gráfico; página do monitoramento.
- Eval de alerta existente adaptado para `LOW_PRICE` (docs/evals).

## Rollout, rollback e kill switch

1. Migração aditiva.
2. Deploy de API, workers e web juntos (a API deixa de aceitar
   `alertRules`).
3. Backfill dos Watches existentes, com aprovação.

Rollback: reverter o deploy; reativar as regras antigas (`enabled = true`)
e desativar `LOW_PRICE` com o mesmo script em modo inverso. Nada é apagado.
`ALERT_LOW_PRICE_DROP_PERCENT` ajusta a sensibilidade para Watches novos.

## Perguntas em aberto

1. Janelas de 30 dias (preço normal), 90 dias (menor já observado) e
   mínimo de 5 dias: valores iniciais, a revisar com os dados do beta.
2. Ida e volta: a fonte tem calendário de ida e volta para a linha de base?
   (Se não tiver, esses Watches começam só com "menor já observado".)

## Evidência de implementação

Ainda não implementada.
