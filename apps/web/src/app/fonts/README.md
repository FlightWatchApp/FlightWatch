# Fontes do site

Arquivos `woff2` (subconjunto latino, que cobre o português) das fontes da
marca (DS-03), guardados no repositório para o build não depender de rede:
baixar do Google Fonts no build falhava às vezes no CI e no Docker.

| Arquivo                       | Fonte           | Pesos                       | Licença                   |
| ----------------------------- | --------------- | --------------------------- | ------------------------- |
| `instrument-sans-latin.woff2` | Instrument Sans | 400–700 (variável)          | SIL Open Font License 1.1 |
| `jetbrains-mono-latin.woff2`  | JetBrains Mono  | variável (usamos 500 e 600) | SIL Open Font License 1.1 |

Origem: Google Fonts (fonts.gstatic.com), baixados em 2026-10-15.
