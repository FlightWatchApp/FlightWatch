# Análise de referência — FlightConnections

Referência consultada: [FlightConnections](https://www.flightconnections.com/),
incluindo a área de [aeroportos por país](https://www.flightconnections.com/airports-by-country).

## O que o site faz bem

### 1. Começa pela geografia

A proposta principal é visual: uma visão global de rotas e aeroportos em um
mapa. A pessoa pode selecionar origem e destino e entender rapidamente o
universo de conexões.

**Lição para o Flight Watch:** o usuário deve conseguir explorar oportunidades
mesmo sem ter criado um Watch. O mapa pode funcionar como uma forma de
perguntar “para onde consigo ir daqui?”, não como uma tela de status.

### 2. Filtros densos, mas agrupados por intenção

A página organiza filtros de origem, destino, datas, horários, preço, alianças,
companhias, classes, aeronaves, distância, duração, escalas e preferência por
companhia única. Há também alternância de ida/volta e de lista/mapa.

**Lição:** filtros avançados devem existir, mas entrar progressivamente. A
primeira busca do Flight Watch deve pedir apenas:

- saindo de;
- destino ou “qualquer lugar”;
- período;
- orçamento ou “melhores oportunidades”.

Os demais filtros ficam em um painel “Refinar”.

### 3. Exploração por entidades

Além do mapa, o site organiza conteúdo por aeroportos, países e companhias. A
área de aeroportos por país conduz até destinos e voos programados.

**Lição:** construir páginas de descoberta navegáveis para aeroporto, cidade,
país, companhia e rota. Isso também cria uma base para SEO, mas SEO não deve
orientar a arquitetura de dados de maneira artificial.

### 4. Mapa e lista têm papéis diferentes

O mapa responde “onde estão as possibilidades?”. A lista responde “qual opção
devo abrir?”. A troca entre os modos reduz conflito entre contexto geográfico e
densidade de dados.

**Lição:** manter um estado de busca comum e duas projeções: `MapView` e
`ResultsList`. O mapa não deve ser a única forma de acessar resultados.

### 5. Configuração internacional

O site expõe moeda e idioma, o que reduz atrito para um público global.

**Lição:** o Flight Watch deve preparar locale/moeda desde o contrato, mas
começar com Português do Brasil e BRL. A expansão não deve exigir reescrever
valores monetários ou datas.

## O que não devemos copiar

- identidade visual, logotipo, cores, ícones, textos ou composição específica;
- estrutura integral de filtros antes de validar a busca simples;
- mapa mundial como primeiro investimento técnico;
- catálogo global sem fonte e licença adequadas;
- modelo baseado apenas em rotas programadas;
- apresentação que pareça garantir disponibilidade ou preço de compra.

## Tradução para o Flight Watch

| Padrão observado   | Adaptação própria                                                |
| ------------------ | ---------------------------------------------------------------- |
| Mapa de rotas      | mapa de oportunidades e destinos com preço observado             |
| Seleção From/To    | “Saindo de” + “Para onde?” + modo flexível                       |
| Filtros de rota    | filtros de orçamento, datas, escalas, duração e companhia        |
| Lista/mapa         | resultados/lista com mapa opcional e sincronizado                |
| Aeroporto por país | páginas de destino, aeroportos e hubs com oportunidades          |
| Price view         | preço atual, menor observado, variação e validade                |
| Conta/subscription | Watch, alertas e preferências, sem esconder a descoberta pública |

## Direção de diferenciação

O FlightConnections é principalmente um atlas de conectividade. O Flight Watch
deve ser um radar de decisão:

```text
ver oportunidade → entender por que é boa → comparar alternativas
→ monitorar a intenção → receber alerta → confirmar no canal de compra
```

Nosso elemento memorável não será “um mapa cheio de linhas”. Será a sensação
de que o sistema transforma uma busca vaga em uma oportunidade explicada e
acompanhável.
