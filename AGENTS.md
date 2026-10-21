# AGENTS.md — Flight Watch

Regras para agentes de IA (Claude Code, Codex, Orca…) e para quem trabalha com
eles. É o único arquivo lido em **toda** sessão: curto de propósito. O resto
está em `docs/` e é lido por seção, quando a tarefa pede (tabela abaixo).

Idioma do produto, do código voltado ao usuário e da documentação: **português
brasileiro**. Horário humano: `America/Campo_Grande`; banco, filas e logs: UTC.

## O produto

O Flight Watch observa o preço de passagens aéreas e avisa por e-mail quando
cai. Fonte de preços: Travelpayouts Data API (cache, um preço por dia e por
cidade — ADR-008). **Não** vende, reserva nem emite passagem; **não** raspa
sites; **não** promete "o menor preço do mercado". Acesso por convite pago,
com cota mensal de monitoramentos (SPEC-043).

## O que ler antes

| A tarefa toca…                         | Ler                                                                           |
| -------------------------------------- | ----------------------------------------------------------------------------- |
| qualquer funcionalidade                | a spec dela em `docs/specs/` (inteira) e as ADRs citadas                      |
| regra de negócio, estados, entidades   | `docs/DOMAIN.md`                                                              |
| banco, filas, cache, processos         | `docs/ARCHITECTURE.md`, `docs/ENGINEERING.md` §6–§9                           |
| variável de ambiente                   | `packages/config/src/processes.ts`, `.env.example`, `docs/ENGINEERING.md` §10 |
| tela, componente, CSS, texto do site   | `apps/web/AGENTS.md` e `docs/DESIGN-SYSTEM.md`                                |
| logs, métricas, health                 | `docs/ENGINEERING.md` §11, ADR-007                                            |
| deploy, servidor, backup               | `deploy/README.md`, SPEC-042                                                  |
| estado do projeto, bloqueios, decisões | `docs/ENGINEERING.md` §1                                                      |
| um erro estranho de build/teste        | `docs/ENGINEERING.md` §13 (H13–H15 são os mais comuns)                        |

Citações antigas a "`CLAUDE.md` §N" (em specs, ADRs e comentários de código)
valem para **`docs/ENGINEERING.md` §N** — a numeração foi mantida.

## Mapa do repositório

```text
apps/
  web/                  Next.js 16 (App Router), BFF: fala só com a API, nunca com o provedor
  api/                  NestJS + Fastify: HTTP, auth, admin (SPEC-043), cotas; src/cli/ = comando `admin`
  scheduler/            escolhe SearchTargets vencidos, sincroniza catálogos (lugares, companhias)
  price-worker/         consulta o provedor, grava PriceObservation (imutável)
  alert-worker/         avalia regras (LOW_PRICE, SPEC-039), cria AlertEvent
  notification-worker/  entrega e-mail (Resend) com chave idempotente
  e2e/                  Playwright: pilha completa simulada
packages/
  domain/         regras puras (sem dependências de framework, banco ou fila)
  contracts/      schemas Zod e tipos da API, eventos e jobs
  database/       Prisma, repositórios, migrações, outbox
  queue/          filas BullMQ
  providers/      porta FlightProvider + adapters (simulado, Travelpayouts)
  notifications/  porta de e-mail + adapters (simulado, Resend) e templates
  observability/  logger (com redação), métricas, servidor interno
  config/         leitura e validação de env (fonte de verdade das variáveis)
deploy/           produção num servidor (SPEC-042): compose, scripts, README
docs/             specs/, adr/, DOMAIN, ARCHITECTURE, ENGINEERING, DESIGN-SYSTEM, roadmap/
scripts/design/   pnpm check:design (tokens, contraste, textos, links de compra)
.local/           rascunho pessoal, fora do git
```

Testes ficam junto do código: `*.test.ts` (unitário), `*.integration.test.ts`
(banco real), `*.e2e.spec.ts` (API com Nest), `apps/e2e` (navegador).

## Regras de ouro

Cada regra diz o que a garante. "Revisão" = nenhuma verificação automática
ainda; o agente é a garantia.

| Regra                                                                                                   | Garantida por                                                              |
| ------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| Dinheiro em inteiro na menor unidade + moeda; nunca float; sem oferta nunca é zero                      | testes de domínio; revisão                                                 |
| `Watch` (intenção da pessoa) ≠ `SearchTarget` (busca compartilhada); buscas iguais viram um só target   | `fingerprint @unique` no banco + testes                                    |
| `PriceObservation` nunca é alterada; correção é um fato novo                                            | revisão                                                                    |
| Todo efeito repetível tem chave idempotente única (execução, alerta, entrega)                           | `@unique` no schema + testes de replay                                     |
| Efeito externo nasce de outbox na mesma transação do dado                                               | revisão + testes de integração                                             |
| `packages/domain` e `packages/contracts` não importam framework, ORM, fila, interface ou adapter        | lint (`no-restricted-imports`) + `package.json` do domain sem dependências |
| Nenhum import de arquivo interno de outro pacote (`@flight-watch/x/src/...`)                            | lint (`no-restricted-imports`)                                             |
| Log só pelo logger estruturado; `console` só em teste, script e no comando `admin`                      | lint (`no-console`)                                                        |
| JavaScript de cada página não passa do teto (primeiro carregamento, gzip)                               | `pnpm check:web-js` (catraca, no CI)                                       |
| Configuração só por `packages/config`; toda chave do `.env.example` é lida por um schema                | `env-example.test.ts`                                                      |
| Log e métrica sem e-mail, senha, token, chave de convite ou payload cru                                 | redação no logger (`observability`); revisão                               |
| Nenhuma rota responde 500 a entrada inválida nem vaza stack, SQL ou Prisma no erro                      | `route-hunt.e2e.spec.ts` (todas as rotas, 3 identidades)                   |
| `/metrics` nunca na porta pública; `/health` sem detalhe interno                                        | `route-hunt.e2e.spec.ts`                                                   |
| Texto do site: "menor preço observado", nunca "menor preço do mercado"/"garantido"                      | `pnpm check:design` (`check-copy`)                                         |
| Cor só por token; link de compra só pelo `PurchaseButton`                                               | `pnpm check:design`                                                        |
| Instante no banco em UTC; regra humana (cota do mês, cron) em `America/Campo_Grande`; relógio injetável | testes de domínio; revisão                                                 |

## Como trabalhar

1. `git fetch` e `git status --short`: ver o que é seu e o que é de outro (não
   mexer no que não é seu).
2. Ler a spec e o que a tabela "O que ler antes" indica. Não há spec? Escrever
   ou pedir uma — **não inventar requisito**. Lacuna que afeta contrato, dados,
   segurança, custo ou o usuário: parar e perguntar.
3. Branch nova a partir da `main`. Uma spec (ou uma correção) por PR.
4. Teste que falha pelo motivo certo → menor código que passa → refatorar.
   Bug sempre ganha teste de regressão.
5. Mudou tela? `pnpm screenshot /rota [/outra]` (com `--login` e
   `SCREENSHOT_EMAIL`/`SCREENSHOT_PASSWORD` para páginas logadas): tira o print
   em desktop e celular em `.local/screenshots/` e falha se houver erro no
   console, rolagem horizontal ou algo cobrindo o cabeçalho. Depois **olhar**
   os prints e anexar ao PR.
6. Rodar "Antes de terminar". Revisar o diff inteiro.
7. Atualizar a spec (evidência de implementação) e, se o mapa, as variáveis ou
   as regras mudaram, este arquivo ou `docs/ENGINEERING.md`.

## Antes de terminar

```sh
pnpm format:check && pnpm lint && pnpm typecheck   # sempre
pnpm test                 # sempre que mexer em código (inclui integração: precisa de Docker)
pnpm check:design         # se mexer em apps/web
pnpm screenshot /rota     # se mexer em tela (precisa do site rodando; ver "Como trabalhar")
pnpm build                # se mexer em web, contratos ou config
pnpm check:web-js        # depois do build, se mexer em apps/web (catraca do JS por página)
pnpm test:e2e             # se mexer em jornada do usuário (cadastro, monitoramento, compra, admin)
docker build --target web -t fw-web . && docker build --target api -t fw-api .
                          # se mexer em Dockerfile, deploy/, next.config.ts, turbo.json ou dependências
```

- Migração nova: `pnpm --filter @flight-watch/database prisma:migrate`
  (só aditiva; nunca editar migração publicada).
- Variável nova: `packages/config` + `.env.example` + `deploy/env.production.example`.
- Memória curta no Testcontainers: `npx turbo run test --concurrency=1`.
- Trocou de branch e o build ficou estranho: `docs/ENGINEERING.md` H13.

**Nunca** dizer que um comando passou sem ter rodado. Gate que não deu para
rodar é informado com o motivo.

## Agentes em paralelo

Mais de um agente trabalha neste repositório ao mesmo tempo (Claude Code e o
Orca, por exemplo).

- Cada agente na sua branch. `git fetch` antes de começar e antes do PR.
- `git add` **por nome de arquivo**, nunca `git add -A`/`.`; caminho apagado
  ou renomeado não entra na lista do `add` (aborta o comando). Conferir
  `git show --stat` antes do push.
- Não "consertar" arquivo de outro agente que quebrou o build: avisar e esperar.
- Arquivo compartilhado (`app.module.ts`, `schema.prisma`, `contracts/src/index.ts`,
  `.env.example`): reler antes de editar; edição pequena e cirúrgica.
- Decisão só vale registrada no repositório (spec, ADR ou este arquivo), não em
  conversa.

## Regras por área

Cada área tem o seu `AGENTS.md`, com a receita do trabalho mais comum e as
regras locais. Ler o da pasta antes de mexer nela:

| Pasta                | Receita                                             |
| -------------------- | --------------------------------------------------- |
| `apps/api`           | rota nova (contrato, pipe, guards, filtro, teste)   |
| `apps/web`           | página nova (dados, actions, estados, verificação)  |
| `packages/contracts` | contrato novo (schema estrito, erros, exportação)   |
| `packages/database`  | mudar o banco (migração aditiva) e repositório novo |

## Banco, integrações e segurança

- Migração só aditiva (expandir/contrair para mudança incompatível); backfill em
  lotes, reiniciável e observável; sem `cascade` sem decisão do domínio.
- Provedor e e-mail só pelas portas em `packages/providers` e
  `packages/notifications`; toda chamada com timeout, `correlationId` e erro
  classificado; retry só em falha temporária, respeitando `Retry-After`; teste
  nunca gasta cota real.
- Validar entrada em toda fronteira (HTTP, fila, provedor, template).
  Autorização por dono do recurso; recurso de outra pessoa responde como
  inexistente.
- Segredo nunca em código, fixture, commit, log, print ou mensagem de chat.
- Dependência nova: justificar necessidade, licença e manutenção.

## Autonomia e aprovação humana

| Nível | O agente pode                                        |
| ----- | ---------------------------------------------------- |
| 0     | analisar e explicar                                  |
| 1     | propor plano e diff, sem editar                      |
| 2     | criar/ajustar testes e documentação                  |
| 3     | implementar uma spec isolada em branch               |
| 4     | alterar vários módulos dentro de uma spec aprovada   |
| 5     | abrir PR e corrigir CI, sem merge                    |
| 6     | corrigir sozinho falhas classificadas de baixo risco |

**Sempre** exige aprovação explícita do owner: merge, produção, migração
destrutiva, segredos, cobrança, autenticação/autorização, provedor real,
privacidade e retenção, exclusão de dados, mudança contratual. Aprovação vale
para aquilo que foi aprovado, não para o próximo passo.

## Proibido

- Desligar teste, lint, typecheck ou gate; enfraquecer asserção para ficar verde.
- Capturar erro e seguir como sucesso; retry infinito.
- `any`, `@ts-ignore` ou supressão sem justificativa na linha.
- Editar migração já aplicada; acessar tabela de outro módulo contornando o repositório dele.
- Alerta ou entrega sem chave idempotente; regra de alerta decidida por LLM.
- Raspar site, copiar código, texto, marca ou imagem de outro produto
  (inspiração em comportamento é permitida); recurso de terceiro (fonte,
  imagem, dado) só com licença e listado em `ATTRIBUTION.md` no mesmo PR.
- Expor `/metrics` publicamente; logar segredo, e-mail completo ou payload cru.
- Refatoração ampla não pedida junto de uma feature.
- Apagar ou sobrescrever trabalho local de outra pessoa.
- Declarar pronto com gate falhando.

## Ao entregar

Dizer, com fatos verificáveis: spec atendida; o que mudou para o usuário;
arquivos principais; comandos rodados e resultado real; o que não foi rodado e
por quê; migração, rollout e rollback; riscos e pendências; docs atualizadas.

## Pronto quer dizer

Spec e critérios claros; testes e implementação concordam; invariantes
preservadas; gates aplicáveis verdes; segurança, idempotência, custo e
observabilidade avaliados; spec com evidência; rollout e rollback definidos;
nenhuma pendência crítica escondida.
