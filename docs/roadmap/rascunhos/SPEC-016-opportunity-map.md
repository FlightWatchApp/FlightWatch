# SPEC-016 — Mapa de oportunidades

Status: rascunho para aprovação  
Dependências: SPEC-014, SPEC-015 e decisão de tiles/geodados

## Objetivo

Permitir explorar destinos e faixas de preço espacialmente, mantendo a lista
como caminho completo e acessível.

## Primeira versão

- pontos por aeroporto/destino, não todas as linhas individuais;
- clustering em zoom baixo;
- cor baseada em faixa de preço ou presença de oportunidade, com legenda;
- filtros de busca compartilhados com a lista;
- clique no ponto abre resumo e itens da lista;
- botão para voltar à lista.

## Fora do escopo inicial

- mapa mundial com todas as rotas;
- desenho de rotas sem oferta concreta;
- navegação 3D;
- geocoding livre sem catálogo confiável;
- dependência de mapa para completar a busca.

## Critérios de aceitação

- resultados em lista e mapa representam o mesmo conjunto filtrado;
- cada ponto tem destino, preço mínimo observado, frescor e fonte;
- mapa possui fallback textual e navegação por teclado;
- carregamento, erro e ausência de dados são estados distintos;
- custo e licença de tiles estão documentados;
- o mapa não promete disponibilidade para datas não consultadas.

## Spike técnico obrigatório

Comparar pelo menos duas opções de biblioteca/tiles quanto a:

- licença comercial e atribuição;
- SSR/Next.js e hidratação;
- bundle e performance mobile;
- acessibilidade;
- clustering;
- custo por visualização;
- suporte a GeoJSON e marcadores customizados.

Escolher depois do protótipo de lista, não antes.
