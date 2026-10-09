# Web — Flight Watch

`apps/web` é uma aplicação Next.js 16 com App Router. Ela entrega a interface,
as Server Actions e o BFF que encaminha chamadas autenticadas para a API.

## Mapa de páginas

| Página             | Público      | O que entrega                                                   |
| ------------------ | ------------ | --------------------------------------------------------------- |
| `/`                | sim          | landing com oportunidades; com sessão, início da área do membro |
| `/search`          | sim          | formulário de busca e resultados                                |
| `/search/[id]`     | sim          | resultado persistido e ofertas                                  |
| `/opportunities`   | sim          | oportunidades e mapa com Leaflet/OpenStreetMap                  |
| `/transparencia`   | sim          | remuneração por afiliados, parceiros e validade dos preços      |
| `/login`           | sim          | login e link para recuperação                                   |
| `/register`        | sim          | cadastro                                                        |
| `/verify-email`    | sim + token  | confirmação do canal de e-mail                                  |
| `/forgot-password` | sim          | solicita link sem revelar se o e-mail existe                    |
| `/reset-password`  | sim + token  | troca de senha e encerramento das sessões                       |
| `/watches`         | não          | painel de monitoramentos do usuário                             |
| `/watches/new`     | não          | criação de um monitoramento                                     |
| `/watches/[id]`    | proprietário | preço, histórico, oferta, estado e ações                        |
| `/account`         | não          | conta e exclusão mediante senha                                 |
| `/account/deleted` | sim          | confirmação após a exclusão                                     |

“Público” significa que a página pode ser aberta sem sessão. A API continua
sendo a autoridade para autenticação e autorização; redirecionamentos no web
são uma decisão de experiência, não um controle de segurança.

## Sessão e BFF

O navegador recebe o cookie `fw_session` com `httpOnly`, `sameSite=lax` e
`secure` em produção. A API nunca grava cookie e nunca é chamada diretamente
pelo browser:

```text
browser ── cookie fw_session ──► Next.js
                                  │
                                  ├─ Authorization: Bearer <token>
                                  ├─ x-fw-client-ip
                                  └─ x-fw-client-ip-signature
                                  ▼
                                API
```

O token é opaco, aleatório e armazenado apenas como hash SHA-256 na tabela de
sessões. O Next.js lê o cookie no servidor e a API valida a sessão no
PostgreSQL. Essa é a decisão de [ADR-006](./adr/ADR-006-session-storage-and-bff-auth.md).

## Jornadas principais

### Buscar e comprar

1. A pessoa abre `/search` e informa origem, destino, datas e passageiros.
2. A busca pública cria um `FlightSearch` síncrono e limitado por IP.
3. O web consulta o resultado e mostra ofertas normalizadas.
4. O botão de compra abre o `purchaseUrl` validado em nova aba.
5. A interface exibe `PurchaseNote` com o aviso de comissão e link para
   `/transparencia`.
6. O botão “Monitorar” exige login e transforma a oferta em um `Watch`.

### Criar e acompanhar um monitoramento

1. A pessoa autenticada informa viagem e pelo menos uma regra de alerta.
2. A API aplica autorização por proprietário, valida o input e aceita uma
   `Idempotency-Key`.
3. O monitoramento aparece no painel `/watches`.
4. O detalhe mostra último preço, menor preço observado, preço desejado,
   frescor, validade, gráfico e estado.
5. Ações de pausar, reativar e cancelar usam endpoints explícitos; estados
   terminais não retornam a ativo.

### Recuperar e excluir conta

- O pedido de recuperação responde sempre `202`, exista ou não uma conta.
- O token de reset expira em uma hora, só pode ser usado uma vez e encerra as
  sessões existentes.
- A exclusão exige a senha atual, encerra sessões, cancela monitoramentos e
  anonimiza dados pessoais conforme a política proposta na SPEC-027.
- A aprovação final da política de retenção/expurgo ainda pertence ao owner.

## Regras de conteúdo e preço

As regras da interface são verificadas por `pnpm check:design` e pelos testes
de domínio do web:

- todo preço tem moeda e idade/frescor;
- sem oferta é `—`, nunca `R$ 0,00`;
- “menor preço” sempre significa menor preço observado pelo sistema;
- “preço desejado” é o limiar configurado pela pessoa;
- “promoção” mostra motivo e base de comparação;
- falha, ausência de ofertas, preço velho e oferta expirada são estados diferentes;
- datas de viagem usam UTC; datas/horas exibidas usam fuso fixo de exibição;
- links de compra passam por `PurchaseButton` e usam
  `rel="noopener noreferrer sponsored"`;
- toda página com compra exibe `PurchaseNote`;
- não há texto menor que 12 px, controles abaixo de 44 px no celular ou
  rolagem horizontal em 320 px;
- animações são curtas, têm significado e respeitam movimento reduzido.

Detalhes de tokens, tipografia, marca, movimento e acessibilidade:

- [`docs/BRAND.md`](./BRAND.md);
- [`docs/DESIGN-SYSTEM.md`](./DESIGN-SYSTEM.md);
- [`docs/design-refactor/01-spec-design-system.md`](./design-refactor/01-spec-design-system.md);
- [`docs/design-refactor/02-spec-componentes.md`](./design-refactor/02-spec-componentes.md);
- [`docs/design-refactor/03-spec-paginas.md`](./design-refactor/03-spec-paginas.md).

## Organização do código web

```text
apps/web/src/
  app/         rotas, layouts e Server Actions
  components/  componentes de layout, marca, UI, dashboard, deals e watches
  lib/api/      cliente BFF e tipos de resposta
  lib/auth/     leitura e escrita do cookie de sessão
  lib/domain/   formatação e regras puras de apresentação
  styles/       tokens e estilos globais
```

Componentes não acessam banco, Redis ou SDK de provedor. Regras puras que
precisam de teste ficam em `apps/web/src/lib/domain/`; o Vitest do web roda em
Node e não pressupõe DOM/jsdom.
