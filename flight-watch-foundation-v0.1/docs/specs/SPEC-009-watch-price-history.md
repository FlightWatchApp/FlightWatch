# SPEC-009 — Histórico básico de preço por monitoramento

Status: draft para aprovação
Versão: 0.1
Owner: Monitoring
Dependências: SPEC-001, SPEC-004, SPEC-007

## 1. Objetivo

Permitir que o usuário autenticado veja o histórico de preço de um Watch específico: último preço, menor preço já observado, série temporal, data da última consulta e estado atual — exatamente o que `PRODUCT.md` §7.3 pede e que hoje não existe (`GET /v1/watches` lista, mas não detalha um Watch; `lastObservation` na resposta de criação é sempre `null`, `packages/contracts/src/watches/create-watch.ts:190`).

## 2. Fora do escopo

- histórico de alertas disparados para o Watch (`AlertHistoryItem`, já modelado como tipo de view no frontend em `apps/web/src/lib/api/types.ts`, mas sem citação em `PRODUCT.md` §7.3 — não inventar esse requisito aqui; fica para uma spec própria se o produto decidir expor isso);
- dados do canal de notificação do Watch (`NotificationChannelView`, mesma observação acima);
- agregações estatísticas (média móvel, previsão de tendência) — só a série bruta;
- exportação (CSV/imagem) do histórico;
- paginação — ver §6 sobre o limite fixo adotado neste primeiro corte.

## 3. Pré-condições

- usuário autenticado (`SessionAuthGuard`);
- Watch pertence ao usuário autenticado.

## 4. Entrada

```
GET /v1/watches/:id
```

`:id` é o UUID do Watch.

## 5. Validação

Idêntica a SPEC-008 §5: `:id` precisa ser UUID sintaticamente válido; o Watch precisa existir e pertencer ao usuário autenticado, com o mesmo erro para os dois casos (não expor a existência de Watch de outro usuário).

## 6. Comportamento

1. Autenticar.
2. Buscar o Watch por id, igual a SPEC-008 §6 passo 2 (`WATCH_NOT_FOUND` se não existir ou não pertencer ao usuário).
3. Buscar as mesmas informações já usadas em `GET /v1/watches` (último preço, menor preço, última execução concluída — `packages/database/src/watch-listing-repository.ts`).
4. Buscar a série de `PriceObservation` do `SearchTarget` do Watch, restrita a `observedAt >= watch.startsAt` (mesmo corte já usado para "menor preço" na listagem — preço observado antes do Watch existir não é história deste monitoramento, mesmo que o `SearchTarget` seja compartilhado com outro Watch mais antigo), ordenada por `observedAt` crescente, limitada a 500 pontos mais recentes dentro da janela.

   500 é um teto de engenharia (evitar resposta ilimitada para um Watch muito antigo com checagem frequente), não um requisito de produto — reavaliar se a paginação virar necessária de verdade.

## 7. Resposta de sucesso

Status `200 OK`.

```json
{
  "id": "uuid",
  "status": "ACTIVE",
  "origin": "DOU",
  "destination": "GRU",
  "tripType": "ONE_WAY",
  "departureDate": "2026-12-20",
  "returnDate": null,
  "currency": "BRL",
  "currentPrice": { "amountMinor": 95000, "currency": "BRL" },
  "lowestPrice": { "amountMinor": 92000, "currency": "BRL" },
  "targetAmountMinor": 80000,
  "lastCheck": { "at": "RFC3339", "outcome": "succeeded" },
  "createdAt": "RFC3339",
  "expiresAt": "RFC3339",
  "priceHistory": [
    { "id": "uuid", "observedAt": "RFC3339", "amountMinor": 98000, "currency": "BRL" }
  ]
}
```

Os campos até `expiresAt` repetem exatamente `watchListItemSchema` (`packages/contracts/src/watches/list-watches.ts`) — o mesmo formato que a listagem já devolve, só que para um Watch e com `priceHistory` a mais.

## 8. Erros

Reaproveita os mesmos códigos de SPEC-008 §8, porque são erros de resolução do recurso Watch, não específicos de uma ação de ciclo de vida:

| Status | Código             | Situação                                     |
| -----: | ------------------ | -------------------------------------------- |
|    400 | `INVALID_WATCH_ID` | `:id` não é um UUID válido                   |
|    401 | `UNAUTHENTICATED`  | sessão ausente/inválida                      |
|    404 | `WATCH_NOT_FOUND`  | Watch inexistente ou não pertence ao usuário |

## 9. Idempotência e concorrência

Leitura pura, sem efeito colateral — não há questão de idempotência. Nenhuma trava é necessária.

## 10. Eventos

Nenhum — endpoint de leitura.

## 11. Critérios de aceitação

- AC-001: Watch sem nenhuma observação retorna `200` com `priceHistory: []`, `currentPrice: null`, `lowestPrice: null`.
- AC-002: Watch com observações retorna a série ordenada por `observedAt` crescente.
- AC-003: observação anterior a `watch.startsAt` (de um `SearchTarget` compartilhado com um Watch mais antigo) não aparece em `priceHistory`.
- AC-004: Watch de outro usuário retorna `404`, nunca `403`.
- AC-005: `:id` mal formado retorna `400` antes de qualquer consulta ao banco.
- AC-006: campos até `expiresAt` são byte-a-byte iguais ao que o mesmo Watch mostraria em `GET /v1/watches`.

## 12. Testes e evals

- e2e (Testcontainers) cobrindo AC-001 a AC-006, mesmo padrão de `watches.e2e.spec.ts`;
- `EVAL-SEC-002` (isolamento entre usuários), reaproveitando o padrão já usado em SPEC-008.

## 13. Observabilidade

- contador `watch_detail_fetch_total{result}` — `result` ∈ `success`/`not_found`;
- log com `watch_id` e resultado, sem dado pessoal.

Mesma lacuna declarada em SPEC-008 §13: sem `correlation_id` por requisição HTTP até existir a infraestrutura própria para isso.

## 14. Performance

Mesma meta de SPEC-001 §14. A consulta de série é por `search_target_id` com corte de data — já existe índice equivalente usado pelo scheduler (`packages/database/prisma/schema.prisma`); confirmar no plano de execução se o teto de 500 linhas se mostrar insuficiente sob uso real.

## 15. Rollout e rollback

Sem migração de schema. Sem feature flag — mesmo módulo de Watches já em produção.
