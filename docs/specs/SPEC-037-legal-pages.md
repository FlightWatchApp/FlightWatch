# SPEC-037 — Política de Privacidade e Termos de Uso

Status: implemented — **texto aguarda revisão do owner** (passo 9 do `MVP-CHECKLIST.md`)
Owner: Identity
Dependências: SPEC-020 (transparência), SPEC-025 (IP do cliente), SPEC-027
(exclusão de conta), SPEC-034 (cidade sugerida pelo acesso), SPEC-036 (Resend)

## Objetivo

Antes do beta, o site tem duas páginas públicas e fixas — `/privacidade` e
`/termos` — que descrevem **só o que o sistema faz hoje**, linkadas no rodapé
e na tela de cadastro.

## Fora do escopo

Banner de cookies (só há cookies essenciais e de preferência, sem
rastreamento de terceiros), aceite com checkbox gravado no banco, versões
anteriores navegáveis, tradução.

## Comportamento

- Páginas estáticas no `apps/web`, no mesmo formato de `/transparencia`, com
  "Última atualização" e e-mail de contato vindos de `lib/legal.ts` (um lugar
  só para trocar).
- Rodapé: links "Privacidade" e "Termos de uso".
- Cadastro: "Ao criar a conta, você concorda com os Termos de Uso e a Política
  de Privacidade", com links, acima do botão.
- Ambas no sitemap.
- `/transparencia` deixa de dizer que a promoção usa "histórico": desde a
  SPEC-032 ela compara com datas próximas.

## Fatos que o texto declara (fonte no código)

| Fato                                                                       | Fonte                                                   |
| -------------------------------------------------------------------------- | ------------------------------------------------------- |
| conta: e-mail, senha só como hash, fuso horário do navegador               | `schema.prisma` `User`, `register/page.tsx`             |
| cookie `fw_session` até 30 dias; `fw_origin` (cidade escolhida) até 1 ano  | `auth.service.ts` `SESSION_TTL_MS`, `origin-actions.ts` |
| IP usado só para limite de tentativas, janelas de 1 a 10 min               | SPEC-025, `processes.ts`                                |
| cidade sugerida por cabeçalho da Cloudflare, nada gravado                  | SPEC-034                                                |
| exclusão pelo próprio site, por anonimização                               | SPEC-027                                                |
| e-mail enviado pela Resend (EUA)                                           | SPEC-036                                                |
| mapas carregam imagens do OpenStreetMap no navegador                       | SPEC-016, CSP em `next.config.ts`                       |
| clique em comprar leva ao parceiro; contado só de forma agregada (métrica) | SPEC-018/020                                            |

## Pendências do owner (não bloqueiam o merge, bloqueiam o beta)

1. Revisar o texto.
2. Criar a caixa `contato@flightwatch.com.br` (ex.: Cloudflare Email Routing,
   grátis, encaminhando para o e-mail pessoal) ou trocar em `lib/legal.ts`.
3. Identificação do controlador (nome ou CNPJ) — a LGPD pede; hoje o texto diz
   só "Flight Watch".
4. Prazo de guarda dos registros técnicos (logs) depois do deploy.

## Critérios de aceitação

- **AC-1** `/privacidade` e `/termos` respondem 200, com título próprio.
- **AC-2** Rodapé de toda página e cadastro levam às duas.
- **AC-3** Nenhuma afirmação do texto contradiz a tabela acima.

## Testes

E2E (Playwright): rodapé → Privacidade e Termos; cadastro mostra os links.

## Rollout e rollback

Sem migração nem variável. Rollback: reverter o commit.

## Evidência de implementação

2026-10-14, branch `feat/legal-pages`.

- `/privacidade` e `/termos` (estáticas), `lib/legal.ts` (contato e data),
  estilo compartilhado em `components/layout/document-page.module.css` (era o
  de `/transparencia`), links no rodapé e no cadastro, sitemap.
- `/transparencia`: "O que é uma promoção" alinhado à SPEC-032.
- E2E 12/12 (2 novos em `legal.spec.ts`); lint 15/15, typecheck 23/23, web
  109, `check:design` e `format:check` ok.
- Navegador (desktop 1326 px e celular 390 px): as quatro páginas sem
  rolagem horizontal e sem erro no console.
