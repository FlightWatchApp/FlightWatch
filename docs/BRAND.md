# Flight Watch — Identidade visual

Guia de uso da marca para o produto, e-mails e redes sociais (Instagram e
grupos de WhatsApp). Os arquivos oficiais ficam em `apps/web/public/brand/`.

## Ideia

**Passagens observadas de perto.**

O Flight Watch não vende passagem: ele observa o preço das rotas, aponta
quando um preço está abaixo do padrão e leva a pessoa ao site parceiro. A
marca precisa passar essa postura de observador atento e honesto: sóbria,
precisa, sem gritaria de "promoção imperdível".

## Símbolo

Uma rota que decola da origem e pousa no destino. Sobre a subida fica uma
lente: é a rota que o sistema está olhando.

| Elemento | Significado                                      |
| -------- | ------------------------------------------------ |
| Arco     | a rota (sobe rápido, desce longo, como um voo)   |
| Lente    | a observação de preço, o "watch"                 |
| Ponto 1  | origem, na cor do traço                          |
| Ponto 2  | destino, sempre laranja rota: o ponto de chegada |

Geometria (grade 64 × 64, raio do bloco 16): arco `M12 47 C14 17 43 11 52 45`
dividido na folga da lente, lente em (25,33; 23,09) com raio 6,8, traço 3,4,
pontos com raio 4,4. O conjunto é deslocado 2,5 para baixo para ficar
opticamente centrado.

## Arquivos

| Arquivo                                 | Uso                                             |
| --------------------------------------- | ----------------------------------------------- |
| `symbol.svg`                            | bloco petróleo, uso padrão (favicon, avatar)    |
| `symbol-light.svg`                      | bloco papel, sobre fundos escuros               |
| `symbol-mono-dark.svg` / `-mono-light`  | uma cor, para carimbo, gravação ou brinde       |
| `logo-horizontal.svg`                   | símbolo + nome, uso principal                   |
| `logo-horizontal-negative.svg`          | sobre petróleo ou foto escura                   |
| `logo-horizontal-mono.svg`              | uma cor                                         |
| `logo-stacked.svg`                      | espaços quadrados ou verticais                  |
| `wordmark.svg`                          | só o nome, quando o símbolo já aparece perto    |
| `avatar-social.svg` / `avatar-1080.png` | foto de perfil do Instagram e do grupo WhatsApp |
| `app-icon.svg`, `app-icon-192/512.png`  | ícone de app / PWA                              |
| `og-image.png`                          | prévia de link (WhatsApp, Instagram, etc.)      |

Textos dos SVGs estão convertidos em curvas: não dependem da fonte instalada.

## Área de respiro e tamanho mínimo

- Respiro mínimo em volta do logo: metade da altura do símbolo.
- Símbolo: mínimo 16 px (favicon). Abaixo de 24 px use o bloco, nunca a
  versão sem fundo.
- Logo horizontal: mínimo 120 px de largura.

## Não faça

- não gire, distorça ou troque a cor do ponto de destino;
- não coloque o símbolo sobre foto sem o bloco;
- não aplique sombra, brilho, degradê ou contorno no logo;
- não troque "Flight Watch" por outra fonte;
- não use o laranja como cor de fundo grande: ele é o destino, um acento.

## Cores

| Nome              | Hex       | Papel                                                 |
| ----------------- | --------- | ----------------------------------------------------- |
| Petróleo          | `#0F4C5C` | marca, botões principais, links                       |
| Petróleo profundo | `#0A3844` | fundos escuros, hover                                 |
| Papel             | `#F5F3EE` | fundo das páginas e das peças claras                  |
| Tinta             | `#14212B` | texto                                                 |
| Laranja rota      | `#C4622D` | destino, selo de promoção. Em fundo escuro: `#E8834F` |
| Verde             | `#1D6B45` | só preço favorável (menor preço, abaixo da média)     |
| Âmbar             | `#7F5200` | só atenção (dado antigo, oferta expirada)             |
| Vermelho          | `#A8261D` | só erro e ação destrutiva                             |

Proporção sugerida numa peça: 60% papel ou petróleo, 30% tinta/branco, 10%
laranja e verde somados. Pares de texto e fundo atendem WCAG AA.

## Tipografia

- **Instrument Sans** (Google Fonts, OFL): tudo. Títulos em 600, texto em
  400/500. Espaçamento de títulos −2%.
- **JetBrains Mono** (OFL): só códigos IATA (GRU, MIA) e códigos técnicos.
  Os códigos em monoespaçada são a "assinatura" visual das rotas.

## Tom de voz

Direto, calmo e verificável. Sempre com a data do preço.

| Use                                   | Evite                         |
| ------------------------------------- | ----------------------------- |
| "último preço observado"              | "preço atual garantido"       |
| "menor preço observado pelo sistema"  | "menor preço do mercado"      |
| "18% abaixo da média observada"       | "desconto de 18%"             |
| "preço visto hoje às 12:44"           | "em tempo real"               |
| "pode mudar a qualquer momento"       | "corre que acaba!"            |
| "Comprar passagem" (no site parceiro) | "melhor momento para comprar" |

Emojis: no máximo um por mensagem, e nunca 🔥💥🚨. Caixa alta só em rótulos
curtos (ex.: "PROMOÇÃO IDENTIFICADA").

## Redes sociais

Peças modelo (geradas a partir de dados reais de uma promoção):

- **Post de promoção** 1080 × 1350: rota em IATA grande, datas, último preço
  observado, motivo da promoção, data/hora da observação e "Link de afiliado".
- **Story de promoção** 1080 × 1920: mesma informação, com área livre para o
  sticker de link.
- **Post educativo** 1080 × 1350: "Como a gente identifica uma promoção".
- **Capas de destaque**: Promoções, Alertas, Como funciona, Transparência.

Regras obrigatórias em toda divulgação de promoção:

1. mostrar o preço **com data e hora** em que foi observado;
2. dizer por que é promoção (menor preço observado ou % abaixo da média);
3. identificar o vínculo comercial ("Link de afiliado" ou `#publi`), como pede
   o Guia de Publicidade por Influenciadores Digitais do CONAR;
4. nunca prometer que o preço ainda está valendo.

### Mensagem modelo para grupos de WhatsApp

```text
✈️ *Promoção identificada: BSB → GRU*
Brasília → São Paulo/Guarulhos · 24 out · só ida

*R$ 785,38* (último preço observado)
Menor preço que o Flight Watch já observou nessa rota (base: 15 consultas).

Visto em 30/09 às 12:44. Preço pode mudar a qualquer momento; confirme no site parceiro.
👉 <link>

_Link de afiliado: podemos receber comissão, sem custo extra para você._
```

Para promoção por percentual, troque a terceira linha por
"_18% abaixo da média_ observada nessa rota (média R$ 1.380,00, base: 15 consultas)."
