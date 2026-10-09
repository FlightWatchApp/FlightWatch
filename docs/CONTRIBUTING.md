# Contribuindo com o Flight Watch

Este projeto prioriza mudanças pequenas, rastreáveis e testáveis. As regras
obrigatórias estão em [`AGENTS.md`](../AGENTS.md) e [`CLAUDE.md`](../CLAUDE.md);
este guia resume o fluxo para uma pessoa colaboradora.

## Antes de codificar

1. Verifique `git status --short`.
2. Leia a spec aplicável inteira.
3. Leia [`DOMAIN.md`](./DOMAIN.md) e os ADRs relacionados.
4. Localize implementação e testes existentes.
5. Liste arquivos permitidos/afetados e riscos.
6. Declare conflitos, lacunas e decisões pendentes antes de escolher um
   comportamento que altere contrato, dados, segurança, custo ou experiência.

Para documentação, use `n/a — docs` no campo de spec quando não houver
mudança de comportamento. Ainda assim, confirme os fatos no código e marque
informações históricas como históricas.

## Loop de implementação

```text
Ler → Red → Green → Refactor → Eval → Review → Registrar
```

- **Red:** teste ou eval falha pelo motivo esperado;
- **Green:** menor implementação possível;
- **Refactor:** nomes, fronteiras e duplicações, sem alterar comportamento;
- **Eval:** gates aplicáveis e cenários de regressão;
- **Review:** releitura adversarial do diff;
- **Registrar:** spec, evidências, riscos, rollout e pendências no PR/documento.

Não desative lint, typecheck, teste ou gate para obter verde. Não adicione
`any`, ignore ou dependência nova sem justificativa localizada.

## Onde cada mudança deve ficar

| Mudança                     | Local esperado             |
| --------------------------- | -------------------------- |
| regra pura de negócio       | `packages/domain`          |
| schema de entrada/saída/job | `packages/contracts`       |
| persistência e migração     | `packages/database`        |
| fila/outbox/Redis           | `packages/queue`           |
| integração de voos          | `packages/providers`       |
| e-mail e templates          | `packages/notifications`   |
| configuração                | `packages/config`          |
| HTTP e autorização          | `apps/api`                 |
| interface/BFF               | `apps/web`                 |
| scheduler/consumidores      | `apps/scheduler` e workers |

O domínio não importa ORM, fila, Redis, SDK de provedor, NestJS ou React.

## Testes

Teste comportamento, não detalhes frágeis. Use:

- unitários para regras puras, dinheiro, datas, estados e chaves;
- integração para PostgreSQL, Redis, constraints, transações, concorrência e outbox;
- contract tests para adapters com fixtures sanitizadas;
- e2e somente para jornadas de alto valor;
- eval de regressão para todo bug de produção.

Comandos globais antes do PR:

```bash
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test
pnpm check:design
pnpm build
```

Se algum gate não puder rodar, escreva o motivo real no PR. Nunca declare um
teste como executado sem executá-lo.

## Banco e migrações

- nunca edite migração já publicada;
- prefira expansão/contração;
- documente rollback ou roll-forward;
- avalie lock e tempo de índices em tabelas grandes;
- faça backfills reiniciáveis, em lotes e observáveis;
- não adicione cascade delete sem decisão explícita do domínio.

## Segurança e integrações

- valide toda fronteira;
- autorize por propriedade, não só por autenticação;
- nunca logue token, senha, payload completo ou contato completo;
- chamadas externas têm timeout, correlação e erro classificado;
- retry deve respeitar idempotência e `Retry-After` quando aplicável;
- testes normais usam simulador/fixtures e não consomem cota real;
- provider real só entra depois de decisão jurídica/comercial documentada.

## Web

Ao tocar `apps/web`, leia o contexto do refactor em
[`docs/design-refactor/00-contexto.md`](./design-refactor/00-contexto.md),
`PROGRESS.md` e a ficha relacionada. Observe especialmente:

- cor somente por tokens;
- preço sempre com idade/frescor;
- compra somente com `PurchaseButton` + `PurchaseNote`;
- fuso fixo para datas/hora exibidas;
- movimento reduzido termina no estado final;
- nenhum texto abaixo de 12 px e nenhum controle abaixo de 44 px no celular.

## Commits e pull requests

Use Conventional Commits em português, por exemplo:

```text
feat(auth): adicionar confirmação de e-mail
fix(alerts): impedir entrega duplicada
docs: documentar execução local
```

O PR deve registrar:

- spec ou `n/a — docs/chore`;
- comportamento alterado e critérios atendidos;
- arquivos relevantes;
- comandos executados e resultado;
- migração, rollout e rollback, se houver;
- observabilidade, riscos e pendências.

Abra uma branch `feat/`, `fix/`, `chore/` ou `docs/` a partir de `main`. Merge,
produção, migração destrutiva, secrets, billing e políticas de segurança
permanecem sob controle humano explícito.
