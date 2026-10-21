# Atribuições e licenças de terceiros

Tudo o que o Flight Watch usa e não foi feito aqui: recursos visuais, dados e
dependências com licença que pede atenção. **Recurso de terceiro só entra com
licença que permita o uso, e entra nesta lista no mesmo PR** (regra
"clean-room" do `AGENTS.md`: inspiração em comportamento de outros produtos é
permitida; copiar código, texto, marca ou imagem não é).

Última revisão: 2026-10-21.

## Recursos visuais

| Recurso                              | Onde                                  | Origem e autor                                   | Licença                                                                                                |
| ------------------------------------ | ------------------------------------- | ------------------------------------------------ | ------------------------------------------------------------------------------------------------------ |
| Instrument Sans                      | `apps/web/src/app/fonts/`             | Google Fonts (Rodrigo Fuenzalida, Jordan Egstad) | SIL Open Font License 1.1                                                                              |
| JetBrains Mono                       | `apps/web/src/app/fonts/`             | Google Fonts (JetBrains)                         | SIL Open Font License 1.1                                                                              |
| Ícones da interface                  | `apps/web/src/components/ui/icon.tsx` | próprios do projeto (SVG escrito no código)      | do projeto                                                                                             |
| Marca (logo, símbolo, imagem social) | `apps/web/public/brand/`              | próprios do projeto (`docs/BRAND.md`)            | do projeto; não liberados para terceiros                                                               |
| Logos das companhias aéreas          | carregados de `pics.avs.io`           | CDN da Aviasales/Travelpayouts                   | marcas das companhias; uso conforme os termos da Travelpayouts (**a confirmar** na revisão dos termos) |

## Dados

| Dado                                         | Fonte                                               | Condições                                                                                                                                                                                                                                                                                                                                                                     |
| -------------------------------------------- | --------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Preços, calendário e detalhes de voo         | Travelpayouts Data API (ADR-008)                    | termos do programa de afiliados — revisão pendente do owner (`docs/ENGINEERING.md` §1.3)                                                                                                                                                                                                                                                                                      |
| Catálogo de cidades, aeroportos e companhias | Travelpayouts `data/pt/*.json` (SPEC-029, SPEC-038) | mesmos termos                                                                                                                                                                                                                                                                                                                                                                 |
| Mapas (imagens dos mapas e dados)            | OpenStreetMap, servidor `tile.openstreetmap.org`    | dados © colaboradores do OpenStreetMap, licença ODbL; atribuição visível no mapa (já está). O servidor público segue a [política de uso](https://operations.osmfoundation.org/policies/tiles/): sem garantia de disponibilidade e acesso que "pode ser retirado a qualquer momento" para serviço comercial — **antes do lançamento público, trocar por um provedor de tiles** |

## Dependências com licença que pede atenção

A maior parte das dependências é MIT, ISC, Apache-2.0 ou BSD
(`pnpm licenses list --prod`). As exceções:

| Pacote          | Licença         | Por que importa                                                                                                                                                                                                          |
| --------------- | --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `react-leaflet` | Hippocratic 2.1 | licença "ética", não reconhecida pela OSI: permite uso comercial, mas condiciona o uso ao respeito a direitos humanos. **Decisão do owner** antes de vender: aceitar ou trocar por Leaflet puro (BSD-2-Clause, já usado) |
| `caniuse-lite`  | CC-BY-4.0       | dados usados só na compilação (não vão para o navegador); sem obrigação no produto                                                                                                                                       |

`leaflet` (BSD-2-Clause) exige manter o aviso de copyright, que vai junto do
pacote.
