# TASK V2 — Marca: arquivos, símbolo, logo e metadados

> Pacote: `docs/design-refactor/`. Specs: BR-01, BR-02, BR-03, CP-01, CP-02. Nível de autonomia: 3 (`07-autonomia-progressiva.md`). Depende de: V1.

## Contexto

`components/ui/brand-mark.tsx` é o logo atual; não há `public/brand/`, nem imagem Open Graph, nem `metadataBase`.

## Objetivo

Arquivos oficiais da marca no repo, `BrandSymbol` e `Logo` no código, favicon e ícones novos, metadados com Open Graph.

## Não objetivos

- Redesenhar cabeçalho e rodapé (V5); aqui o `Logo` só substitui o `BrandMark` onde ele é usado.

## Spec

- BR-01 a BR-03, CP-01 e CP-02.
- **Dado** `rg brand-mark apps/web/src`, **quando** a tarefa termina, **então** nenhum resultado e o arquivo foi removido.
- **Dado** o link do site colado no WhatsApp, **quando** a prévia carrega, **então** aparece `og-image.png` com título e descrição de BR-03 (confira o HTML: `og:image` absoluto a partir de `WEB_BASE_URL`).

## Arquivos permitidos

- `apps/web/public/brand/**` (copiar de `ref/redesign`)
- `apps/web/src/app/icon.svg`, `apple-icon.png`
- `apps/web/src/components/brand/brand-symbol.*`, `logo.*`
- `apps/web/src/components/ui/brand-mark.tsx` (sai) e quem o usa
- `apps/web/src/app/layout.tsx` (metadados)

## Referência

`ref/redesign`: `git checkout ref/redesign -- apps/web/public/brand apps/web/src/app/icon.svg apps/web/src/app/apple-icon.png` é permitido para os binários; componentes você escreve lendo a referência.

## Red

`node -e "for (const f of ['symbol.svg','logo-horizontal.svg','og-image.png']) require('fs').statSync('apps/web/public/brand/'+f)"` falha; `rg brand-mark apps/web/src` encontra usos.

## Evals e gates

- G1–G8
- MO-03 (logo animado) visível sem movimento reduzido
- rubrica R1

## Critérios de aceite

- [ ] Red registrado (saída real mostrando a falha pelo motivo esperado)
- [ ] Spec atendida, item por item
- [ ] Gates da seção acima verdes, com saída no registro do eval
- [ ] Tetos que melhoraram foram baixados em `ceilings.json`
- [ ] Screenshots 390 e 1440, antes e depois, quando a tarefa muda tela
- [ ] Diff só nos arquivos permitidos (ou ficha atualizada explicando)
- [ ] `PROGRESS.md` atualizado

## Handoff

- Alterações:
- Evidências (registro do eval):
- Limitações e riscos:
- Próximo passo:
