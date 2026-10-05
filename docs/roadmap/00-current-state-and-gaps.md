# Estado atual e lacunas

## Resumo executivo

O projeto já possui a base operacional de um monitor de preços:

- monorepo pnpm/Turborepo;
- API NestJS e frontend Next.js;
- PostgreSQL como fonte de verdade;
- autenticação por sessão;
- `Watch`, `SearchTarget`, regras de alerta e histórico de observações;
- scheduler, price worker, alert worker e notification worker;
- idempotência, outbox, métricas e contratos compartilhados;
- SPEC-010 de confirmação de e-mail, com token opaco, reenvio e migração
  aditiva no estado atual do trabalho;
- SPEC-008 para lifecycle;
- SPEC-009 para detalhe e histórico básico.

O frontend atual, porém, é uma aplicação autenticada de gerenciamento de
monitoramentos. A próxima etapa precisa criar o produto de descoberta sem
forçar o conceito de Watch a representar uma busca pontual ou um pacote.

## O que existe hoje

### Backend

| Área         | Estado atual                                | Consequência para a próxima fase                                 |
| ------------ | ------------------------------------------- | ---------------------------------------------------------------- |
| Auth         | registro, login, sessão e ownership         | pode sustentar área pública + área autenticada                   |
| Watches      | criar, listar, pausar, reativar, cancelar   | manter como fluxo de monitoramento                               |
| SearchTarget | deduplicação de intenções de busca          | reutilizar para checks recorrentes, não para cada oferta exibida |
| Pricing      | execução, observação, normalização simulada | adicionar uma camada de consulta sob demanda                     |
| Alerts       | regras, eventos e notificações              | conectar “monitorar esta oferta” ao Watch                        |
| Providers    | abstração e provider simulado               | decisão de provedor licenciado é pré-requisito                   |
| Packages     | não há modelo de pacote de viagem           | criar como agregado separado                                     |
| Map data     | inexistente                                 | começar com geodados de aeroportos e rotas agregadas             |

### Frontend

O frontend já tem tokens, tipografia, componentes de formulário, cards, estados
de foco e páginas de login, cadastro, criação de Watch, lista e detalhe. A
direção atual usa navy/paper, Fraunces, Public Sans e IBM Plex Mono.

As lacunas de produto são:

- home sem conteúdo público quando o usuário não tem Watch;
- nenhum campo de busca de passagens;
- lista curta e hardcoded de aeroportos no formulário;
- nenhum resultado de oferta com preço, companhia, duração ou conexão;
- nenhum mapa;
- nenhuma exploração por origem, destino, região ou datas flexíveis;
- nenhuma classificação de promoção baseada em referência observada;
- nenhum pacote de voo + hospedagem/atividade;
- nenhuma distinção visual entre preço ao vivo, preço observado e preço expirado;
- os dados já possuem `PriceObservation.deeplink`, mas o endpoint de Watches não
  projeta esse link e os cards não oferecem uma ação de compra;
- ausência de testes de frontend para a jornada de busca.

O projeto também já começou a fechar uma lacuna importante do MVP com
confirmação de e-mail. Essa feature deve ser finalizada e validada antes de
usar busca pública como principal aquisição, porque Watch e canal de alerta
dependem de uma identidade verificável.

## Evidência no código atual

- `apps/web/src/app/page.tsx` renderiza a lista de Watches e um estado vazio;
- `apps/web/src/app/watches/new/new-watch-form.tsx` ainda usa uma lista local de
  aeroportos suportados e cria somente a regra `TARGET_PRICE`;
- `apps/web/src/app/watches/[id]/page.tsx` já mostra detalhe, histórico e ações
  de lifecycle;
- `apps/api/src/watches/watches.controller.ts` expõe o CRUD/lifecycle atual,
  mas ainda não possui endpoint de busca de ofertas;
- `packages/database/src/watch-listing-repository.ts` projeta dados de Watch e
  observações, mas hoje não projeta `deeplink`, validade e fonte da observação
  mais recente para o card;
- `packages/providers` contém a fronteira para fontes externas, mas a
  descoberta de ofertas ainda não está modelada como fluxo de produto;
- `packages/database/prisma/schema.prisma` possui Watches, SearchTargets,
  execuções, observações, alertas e notificações — e já possui `deeplink` em
  `PriceObservation` — mas não `FlightSearch`, `FlightOffer`, `Deal` ou
  `PackageOffer`.

## Gaps de qualidade que devem entrar no plano

Os findings da revisão `docs/reviews/WATCH-LIFECYCLE-HISTORY-CODE-REVIEW.md` continuam
relevantes antes de ampliar o tráfego:

1. implementar logs de lifecycle/detail e correlação HTTP;
2. alinhar labels da métrica de lifecycle com a SPEC;
3. atualizar a rota de detalhe após ações de lifecycle;
4. resolver ou medir o fan-out/N+1 da listagem;
5. completar os e2e de estados e observabilidade;
6. resolver os riscos herdados de fencing de `SearchExecution` e recuperação de
   `NotificationDelivery.SENDING`.

Esses itens não precisam bloquear o trabalho de discovery em ambiente local,
mas bloqueiam uma promoção real com usuários e dados externos.

## Diagnóstico de produto

O produto atual responde bem à pergunta:

> “Quero acompanhar esta viagem e ser avisado quando atingir uma condição.”

O produto desejado precisa responder também:

> “Ainda não sei exatamente para onde ou quando ir; mostre boas oportunidades,
> explique as opções e deixe-me monitorar uma delas.”

Essa segunda pergunta exige um fluxo de entrada público e exploratório. A
ausência de Watches não pode resultar em uma tela vazia; deve resultar em
descobertas úteis, com limites claros sobre fonte, validade e cobertura.

## Princípios de evolução

- Separar oferta instantânea, promoção calculada, pacote e observação histórica.
- Construir busca/lista antes do mapa.
- Fazer o mapa aumentar compreensão, não apenas decorar a tela.
- Usar dados reais ou simulados explicitamente identificados; nunca fabricar
  disponibilidade para parecer completa.
- Fazer toda oferta ter `source`, `observedAt`, `expiresAt` e link de origem.
- Fazer todo Watch mostrar a última oferta observada com ação de compra quando
  houver deep link válido, sem afirmar que o preço está garantido.
- Permitir “monitorar” a partir de uma oferta com uma única ação.
- Manter o monitoramento determinístico e auditável.
