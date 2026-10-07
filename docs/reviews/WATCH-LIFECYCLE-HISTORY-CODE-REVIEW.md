# Code Review — SPEC-008 e SPEC-009

Data: 2026-09-21  
Escopo: ciclo de vida do Watch, detalhe/histórico de preço, API, persistência,
observabilidade, frontend e testes.

## Veredito

**FAIL para release neste estado.**

A implementação principal está funcional e a concorrência da transição foi
tratada de forma melhor que uma simples sequência “ler e depois escrever”. O
gate falha, porém, por divergências objetivas entre a especificação e o código:

1. os logs obrigatórios de lifecycle/detail não existem;
2. os valores emitidos pela métrica de lifecycle não são os valores definidos
   pela SPEC;
3. a tela de detalhe não garante atualização visual após uma ação de lifecycle;
4. o caminho de leitura introduz fan-out/N+1 não medido;
5. os testes não cobrem todos os critérios de aceitação e não puderam ser
   executados neste ambiente por falta de acesso ao runtime de containers.

## O que foi implementado corretamente

- `GET /v1/watches/:id` e os três endpoints de ação estão protegidos por
  `SessionAuthGuard`.
- A consulta sempre filtra `userId`, mantendo o isolamento entre usuários e
  retornando `WATCH_NOT_FOUND` em vez de confirmar um Watch de terceiros.
- UUID inválido é rejeitado no pipe antes da consulta ao banco.
- A tabela de transições está coerente com a SPEC: `ACTIVE → PAUSED`,
  `PAUSED → ACTIVE` e `ACTIVE/PAUSED → CANCELLED`.
- A escrita usa `UPDATE` condicional com `status IN (...)` e incremento de
  `version` na mesma operação.
- Repetição da mesma ação no estado de destino é idempotente e não incrementa
  `version`.
- O histórico filtra `observedAt >= watch.startsAt`, limita a 500 pontos e
  devolve a série em ordem crescente após selecionar os pontos mais recentes.
- O índice `PriceObservation(searchTargetId, observedAt DESC)` suporta o corte
  temporal principal do histórico.
- A resposta de detalhe reaproveita os campos do item de listagem e o teste de
  paridade existente verifica essa intenção.
- A implementação não cancela nem altera o agendamento do `SearchTarget` ao
  pausar ou encerrar um Watch, respeitando o escopo da SPEC-008.

## Findings

### [HIGH] F-001 — Logs obrigatórios de lifecycle e detalhe não foram implementados

Arquivos: `apps/api/src/watches/watches.service.ts:235-259`  
Contrato: `SPEC-008 §13` e `SPEC-009 §13`

As duas specs exigem um log estruturado contendo correlação, `watch_id` e
resultado. O serviço apenas incrementa métricas; não chama `logEvent` em
`getWatchDetail`, `transitionWatch`, nem nos caminhos de erro.

Além disso, a afirmação da SPEC de que existe um `correlation_id` gerado pelo
pipeline HTTP não corresponde ao código atual: não há middleware/interceptor de
correlação para as requisições da API. O logger existente trabalha com a chave
`correlationId`, enquanto as specs e `AGENTS.md` usam `correlation_id` como
contrato operacional.

Impacto:

- não é possível correlacionar uma ação do usuário com o request nos logs;
- falhas de transição e acessos a Watch inexistente ficam sem evento auditável;
- o gate G11 de observabilidade não está atendido;
- a correção de nomenclatura não deve ser feita apenas no call site: primeiro é
  preciso decidir um formato canônico e propagar a correlação desde a entrada
  HTTP.

Correção recomendada:

- adicionar middleware/interceptor que leia ou gere um correlation ID por
  request, sem aceitar valores perigosos ou excessivamente grandes;
- definir se o JSON canônico será `correlation_id` ou `correlationId` e alinhar
  ADR, logger, specs e jobs;
- emitir eventos de sucesso, `idempotent_noop`, `not_found` e
  `invalid_transition` com `watch_id` e resultado;
- testar os eventos sem registrar token, e-mail ou dados de rota.

### [MEDIUM] F-002 — Labels de resultado da métrica não seguem a SPEC

Arquivo: `apps/api/src/watches/watches.service.ts:251-258`  
Contrato: `SPEC-008 §13`

A SPEC define estes valores para `result`:

```text
success | idempotent_noop | not_found | invalid_transition
```

No caminho de erro, o código usa o código de erro inteiro em lowercase:

```ts
error.errorCode.toLowerCase();
```

Assim, a API emite `watch_not_found` e `invalid_watch_transition`, que não são
os labels documentados. Em erros inesperados ainda emite `internal_error`,
também fora do conjunto definido.

Impacto: dashboards, alertas e consultas que procuram `not_found` ou
`invalid_transition` ficam silenciosamente incompletos. O nome da métrica está
correto, mas a semântica do label não está.

Correção recomendada: mapear explicitamente os códigos para os resultados da
SPEC, por exemplo `WATCH_NOT_FOUND → not_found` e
`INVALID_WATCH_TRANSITION → invalid_transition`. Para exceções inesperadas,
decidir se `internal_error` será formalizado na SPEC ou se será registrada em
uma métrica separada; não introduzir um valor informal no contrato atual.

Também falta teste que leia o registry e valide cada combinação esperada de
labels.

### [MEDIUM] F-003 — A ação pode deixar a rota de detalhe visualmente obsoleta

Arquivos: `apps/web/src/app/watches/actions.ts:27-55`,
`apps/web/src/components/watches/watch-lifecycle-actions.tsx:30-39`

As três Server Actions invalidam apenas `/`. Entretanto, os mesmos botões são
renderizados em `/watches/:id`. O componente cliente ignora o Watch retornado
pela API e não altera o status local nem chama `router.refresh()`.

Consequência provável: depois de pausar ou encerrar na tela de detalhe, o
usuário pode continuar vendo `ACTIVE`, o botão antigo e o gráfico/estado da
renderização anterior até navegar ou atualizar manualmente. A invalidação da
home pode atualizar a listagem quando ela for visitada, mas não é uma garantia
de revalidação da rota dinâmica atual.

Correção recomendada: revalidar também `/watches/${watchId}` e atualizar a
rota atual com `router.refresh()`, ou manter o novo status no estado do
componente. Adicionar teste de componente/integração para os três caminhos e
para a resposta de conflito concorrente.

### [MEDIUM] F-004 — Fan-out/N+1 não está compatível com o gate de performance

Arquivo: `packages/database/src/watch-listing-repository.ts:30-85`

`enrichWatch` dispara três consultas por Watch. A listagem executa esse trabalho
sequencialmente em um `for...of`; com `N` Watches, o endpoint faz a consulta
principal mais aproximadamente `3N` consultas adicionais. A transição também
enriquece o Watch antes e depois do `UPDATE`, apesar de o contrato da ação
precisar apenas identificar o estado e devolver a projeção final.

O detalhe acrescenta uma quarta consulta de histórico. O limite de 500 evita uma
resposta ilimitada, mas não elimina o custo das consultas repetidas nem há
benchmark/p95 que comprove a meta de 500 ms da SPEC.

Impacto: latência cresce com a quantidade de Watches do usuário e a listagem
fica vulnerável a degradação por fan-out. O comentário no código considera a
escala aceitável, mas não há evidência para essa decisão e o QUALITY-GATES G8
explicitamente exige ausência de N+1 ou justificativa medida.

Correção recomendada:

- buscar latest/lowest/last execution em consultas batch por conjunto de
  `searchTargetId`, ou usar projeções SQL agregadas;
- evitar o enriquecimento prévio completo na transição, fazendo uma leitura
  mínima de estado e uma projeção final;
- adicionar benchmark com 1, 20 e uma quantidade realista de Watches
  históricos, medindo p50/p95, número de queries e payload.

### [MEDIUM] F-005 — “Última consulta” é ordenada por criação, não por conclusão

Arquivo: `packages/database/src/watch-listing-repository.ts:45-53`

O campo `lastCheck` é descrito como a última execução concluída, mas a busca
usa:

```ts
orderBy: {
  createdAt: 'desc';
}
```

Em presença de execução atrasada, retry ou reconciliação, uma execução mais
recente pode ser criada antes de uma execução mais antiga terminar. Nesse caso,
`createdAt` não representa a última consulta concluída, enquanto o campo
retornado usa `completedAt` como o horário apresentado.

Correção recomendada: ordenar por `completedAt DESC` para estados terminais,
com desempate determinístico por `id`, e criar um teste com duas execuções em
que a ordem de conclusão difere da ordem de criação. Se a semântica desejada
for “última tentativa criada”, alterar explicitamente a documentação e o nome
do campo; hoje o contrato diz “última consulta concluída”.

### [MEDIUM] F-006 — Cobertura dos critérios de aceitação está incompleta

Arquivo: `apps/api/src/watches/watches.e2e.spec.ts`

Há 32 testes declarados no arquivo e os cenários principais estão presentes,
incluindo concorrência da mesma ação, ownership, UUID inválido e histórico
anterior ao `startsAt`. Ainda faltam evidências para:

- ações sobre `COMPLETED` (a suíte testa `EXPIRED`, mas não `COMPLETED`);
- `pause` em `CANCELLED` e todas as combinações exigidas por AC-005;
- concorrência entre ações diferentes, por exemplo `pause` e `cancel`;
- corte real de 500 pontos e comportamento no limite;
- labels das métricas de lifecycle/detail;
- logs obrigatórios e presença da correlação;
- Server Actions, atualização da rota de detalhe e gráfico no frontend.

Isso não prova que cada caminho está quebrado, mas impede concluir que AC-005,
observabilidade e a entrega full-stack foram validados.

### [LOW] F-007 — Ordenação do histórico não é determinística em empate

Arquivo: `packages/database/src/watch-listing-repository.ts:145-153`

O histórico ordena apenas por `observedAt`. Duas observações podem compartilhar
o mesmo timestamp, especialmente quando são inseridas por jobs próximos. Nesse
caso o banco pode escolher uma ordem arbitrária e o conjunto selecionado na
fronteira dos 500 pontos também pode variar.

Correção recomendada: usar `observedAt DESC, id DESC` na seleção dos 500 e
reverter a lista; aplicar desempate equivalente em queries de “última
observação” quando o valor exibido depender da ordem.

## Decisões de domínio que precisam ser explicitadas

### Preço atual fora da janela do Watch

`latestObservation` em `enrichWatch` não filtra por `watch.startsAt`, enquanto
`lowestObservation` e `priceHistory` filtram. Como `SearchTarget` é compartilhado,
um Watch recém-criado pode mostrar um `currentPrice` observado antes de começar
e, ao mesmo tempo, ter `priceHistory: []`.

Isso pode ser uma decisão válida — preço atual do SearchTarget global — mas não é
óbvio para o usuário e difere da semântica “histórico deste monitoramento”. A
SPEC-009 exige paridade com a listagem, então a decisão deve ser documentada e
testada nos dois endpoints, em vez de ficar implícita no repositório.

## Segurança e autorização

Nenhum bypass de ownership foi encontrado nos novos endpoints. A busca por
`id + userId` e a escrita condicional por `id + userId` são adequadas para não
revelar Watches de terceiros. O erro de UUID ocorre antes do acesso ao banco.

O risco operacional principal é observabilidade incompleta, não exposição de
dados. Os logs existentes possuem sanitização, mas ela não compensa a ausência
dos eventos requeridos.

## Testes executados nesta revisão

| Comando                                                                         | Resultado                                                                        |
| ------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| `./apps/api/node_modules/.bin/tsc -p apps/api/tsconfig.json`                    | PASS                                                                             |
| `./apps/web/node_modules/.bin/tsc -p apps/web/tsconfig.json --noEmit`           | PASS                                                                             |
| `./node_modules/.bin/eslint apps/api/src`                                       | PASS                                                                             |
| `./node_modules/.bin/eslint apps/web/src`                                       | PASS                                                                             |
| `cd apps/api && ./node_modules/.bin/vitest run src/watches/watches.e2e.spec.ts` | **NÃO EXECUTADO: bloqueado antes dos testes por falta de runtime de containers** |

Erro observado no e2e: `Could not find a working container runtime
strategy`; adicionalmente, o acesso direto ao Docker falhou com `permission
denied` em `/var/run/docker.sock`. Portanto, não há evidência local nesta
revisão de que os testes Testcontainers realmente passaram.

## Riscos herdados da revisão anterior

Fora do escopo direto de SPEC-008/009, continuam relevantes os blockers já
registrados em `OBSERVABILITY-CODE-REVIEW-ROUND-2.md`:

- ausência de fencing/ownership para impedir escrita tardia de um
  `SearchExecution` reconciliado enquanto o worker original ainda está vivo;
- estado `NotificationDelivery.SENDING` potencialmente órfão após crash entre o
  envio externo e a confirmação no banco.

Esses problemas continuam impedindo um veredito global de produção mesmo que os
findings desta revisão sejam corrigidos.

## Plano mínimo antes de aprovar

1. Implementar correlação HTTP e os logs de lifecycle/detail com contrato
   canônico.
2. Corrigir o mapeamento dos resultados da métrica e adicionar assertions no
   registry.
3. Corrigir a atualização da rota de detalhe após uma Server Action.
4. Resolver ou medir o fan-out da listagem e da transição.
5. Corrigir a ordenação de `lastCheck` e tornar empates determinísticos.
6. Completar os e2e e testes de frontend listados acima.
7. Executar novamente todos os gates com Docker/Testcontainers disponível e
   revisar o diff final.

**Conclusão:** boa base funcional para os estados e o histórico, mas ainda não
é uma implementação pronta para aprovação/release porque os requisitos
operacionais e parte da evidência de qualidade não foram atendidos.
