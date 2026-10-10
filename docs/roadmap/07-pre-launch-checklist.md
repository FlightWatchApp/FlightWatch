# 07 — Checklist antes do lançamento público

Registrado em 2026-10-09, a partir de uma análise externa do estado do
projeto revisada pelo owner e pelo Claude. **Ainda não executado**: este
documento é a fila de correções para depois.

**Conclusão da análise (aceita):** o projeto pode ser versionado e
apresentado como MVP em staging (demonstração, colaboradores, investidores,
dados simulados identificados). **Não** está pronto para usuários reais:
não prometer alertas por e-mail nem monetização por afiliado, e não coletar
usuários sem Política de Privacidade e Termos aprovados.

Os maiores impedimentos não são visuais: são e-mail real, operação,
afiliado, privacidade, testes de ponta a ponta e o escopo final dos alertas.

## Fila de execução (ordem por dependência)

| #   | Item                                                                                        | Depende de                       | Status   |
| --- | ------------------------------------------------------------------------------------------- | -------------------------------- | -------- |
| 1   | Escopo das regras de alerta na interface + fonte da seção "Promoções agora"                 | decisão do owner (D1, D2 abaixo) | pendente |
| 2   | Listagem de monitoramentos: consulta agregada e paginação                                   | nada                             | pendente |
| 3   | E2E no navegador dos fluxos principais                                                      | nada (Playwright já roda local)  | pendente |
| 4   | Domínio, hospedagem, HTTPS e staging separado                                               | escolha de hospedagem pelo owner | pendente |
| 5   | E-mail real (adapter, recomendado Resend)                                                   | domínio                          | pendente |
| 6   | Marker de afiliado, teste de atribuição e revisão dos termos da Travelpayouts               | site no ar                       | pendente |
| 7   | Política de Privacidade, Termos de Uso, retenção e exclusão definitiva                      | texto do owner/jurídico          | pendente |
| 8   | Revisão manual de acessibilidade (teclado, leitor de tela) e rodada limpa de todos os gates | itens anteriores                 | pendente |

Itens 1 a 3 não dependem de nada externo. A partir do 4, dependem de
decisões ou contas do owner.

## Detalhe por item

### 1. Regras de alerta e "Promoções agora"

- **Verificado (2026-10-09):** o domínio suporta preço desejado, queda
  absoluta, queda percentual e novo menor preço observado, mas
  `apps/web/src/app/watches/new/new-watch-form.tsx` envia só `TARGET_PRICE`.
- **D1 (owner):** escopo do MVP. Recomendação: lançar com **preço desejado**
  e **novo menor preço observado** (o que se espera de um monitor de preço;
  o domínio já suporta). Quedas absoluta/percentual depois. Registrar em spec
  para a interface não prometer menos ou mais que o backend.
- **D2 (owner):** a seção "Promoções agora" da página inicial ainda usa o
  feed antigo (SPEC-015), que exibe cartões "preço expirado, confirme no
  parceiro". Recomendação: trocar a fonte pelo feed por origem (SPEC-032) ou
  pela vitrine (SPEC-034), com só preço fresco — em vez de remendo editorial
  ("Últimos preços observados").

### 2. Performance da listagem de monitoramentos

- **Verificado:** `packages/database/src/watch-listing-repository.ts`
  (`listWatchesForUser`) enriquece um Watch por vez, em sequência, sem
  paginação — dezenas de consultas em fila com dezenas de monitoramentos (H09).
- Fazer: consulta agregada de último e menor preço, paginação, medir p95,
  teste com centenas/milhares de Watches.

### 3. E2E dos fluxos principais

Cadastro, confirmação de e-mail, login, busca, criação de monitoramento,
pausa/reativação, cancelamento, recuperação de senha, clique de compra e
recebimento de alerta. Os testes visuais (overflow, tamanho de texto e
controles, console, 320/390/1440 px, movimento reduzido) já passam.

### 4. Ambiente de produção

Hospedagem, domínio, HTTPS, Postgres e Redis gerenciados, secrets, deploy dos
workers, backups **e teste de restauração**, logs centralizados, alertas
operacionais, estratégia de rollback, staging separado. As imagens Docker
existem (SPEC-028); o CI valida código, não operação.

### 5. E-mail real

Hoje `InMemoryEmailSender` (`packages/notifications/src/factory.ts`):
confirmação de cadastro, recuperação de senha e alertas não chegam a
ninguém, e `APP_ENV=production` rejeita o adapter simulado. Principal
bloqueador do produto.

### 6. Afiliado

Cadastro no programa, marker correto, teste de atribuição ponta a ponta,
revisão dos termos do provedor e comunicação ao usuário (a página
`/transparencia` e o `PurchaseNote` já existem).

### 7. Privacidade e termos

Política de Privacidade, Termos de Uso, cookies (se aplicável), retenção de
e-mails e históricos, exclusão definitiva (a SPEC-027 anonimiza; a política
de expurgo aguarda aprovação), responsabilidade pelas informações do
provedor, regras de afiliado.

### 8. Acessibilidade e gates

Revisão manual com teclado e leitor de tela; aprovação humana da rubrica
visual; rodada completa e limpa de format, lint, typecheck, todos os testes
(inclusive workers e integração), build e E2E.

## Itens adicionais (não estavam na análise)

- **Limite de requisições do cartão da página inicial:** cada visita com
  cidade usa 4 requisições do limite da busca (feed + 3 meses de
  calendário). Com CGNAT das operadoras (muitos usuários num IP), o gráfico
  some. Recomendação: `/v1/promotions` devolver os preços da referência.
  O mesmo vale para a busca (10/min por IP).
- **Rate limit em memória por processo:** com mais de uma réplica da API,
  cada uma conta separado — mover o storage do throttler para o Redis antes
  de escalar.
- **Token da Travelpayouts:** trocar (o atual passou por uma conversa).
- **Tempo de voo estimado (SPEC-033):** calibrar a fórmula com rotas reais
  (SAO → DOU dá 1 h 35; a FlightConnections informa 1 h 50).
- **SPEC-033 fatias 5 e 6:** monitoramento no mesmo modelo da página da rota
  e evidência final.

## Melhorias de interface apontadas

Dashboard um pouco denso; campos de data podem ter explicação mais clara no
celular; ofertas expiradas precisam de tratamento editorial (resolvido pelo
item 1/D2).

## Já está bom (não mexer sem motivo)

Identidade visual consistente (petróleo, papel e laranja), hierarquia clara,
páginas de rota, controles adequados ao celular, estados vazios, comunicação
de preço desatualizado, páginas de conta e monitoramento.
