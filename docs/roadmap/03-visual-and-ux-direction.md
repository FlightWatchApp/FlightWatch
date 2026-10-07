# Direção visual e UX

## Princípio visual

Não construir “um dashboard de cards”. Construir uma **mesa de exploração de
viagens**: uma superfície clara para busca, um canvas geográfico quando ele
ajudar e uma lista precisa para decisão.

O produto deve parecer confiável e editorial, não um clone de agência de
viagens nem uma tela operacional de observabilidade.

## Sistema visual proposto

O sistema atual é uma boa base e deve evoluir, não ser descartado.

### Paleta

| Função       | Direção                                                           |
| ------------ | ----------------------------------------------------------------- |
| Fundo        | paper claro levemente quente, mantendo leitura longa              |
| Texto        | navy escuro para confiança e contraste                            |
| Ação         | azul de navegação/seleção                                         |
| Oportunidade | verde reservado para preço realmente favorável                    |
| Atenção      | âmbar para dado antigo ou validade próxima                        |
| Risco        | vermelho somente para erro/cancelamento                           |
| Mapa         | base neutra; rotas e preços como camadas sem excesso de saturação |

Não usar gradientes decorativos, sombras em todos os cards ou uma cor de
“promoção” para qualquer preço baixo.

### Tipografia

- Fraunces continua como voz editorial para títulos e grandes preços;
- Public Sans continua como texto funcional e formulários;
- IBM Plex Mono continua apenas para códigos IATA, datas técnicas e valores
  tabulares.

O título não deve depender de destacar uma palavra com cor diferente. A
hierarquia vem de escala, espaço e relação entre pergunta e resultado.

### Layout

Desktop de busca:

```text
┌────────────────────────────────────────────────────────────────────┐
│ marca        Explorar  Promoções  Pacotes   Monitoramentos  conta   │
├────────────────────────────────────────────────────────────────────┤
│ Encontre uma viagem que valha a pena                                │
│ [saindo de] [para onde?] [datas] [buscar]                            │
│ [qualquer destino] [flexível] [até R$] [mais filtros]                │
├────────────────────────────────────────────────────────────────────┤
│ 342 oportunidades       Ordenar: melhor valor   [Lista] [Mapa]      │
├──────────────────────────────────────┬─────────────────────────────┤
│ lista de resultados                  │ mapa opcional                │
│ oferta / rota / preço / validade     │ pontos, regiões, rotas       │
│ ...                                  │                             │
└──────────────────────────────────────┴─────────────────────────────┘
```

Mobile:

```text
┌──────────────────────┐
│ marca       menu     │
├──────────────────────┤
│ pergunta de busca    │
│ [origem]             │
│ [destino]            │
│ [datas] [buscar]     │
├──────────────────────┤
│ 342 resultados       │
│ [filtros] [ordenar]  │
│ card de oferta       │
│ card de oferta       │
│ [ver mapa]           │
└──────────────────────┘
```

Alinhamento deve ser majoritariamente à esquerda. Preços, duração e métricas
podem usar colunas alinhadas com numerais tabulares. O mapa nunca deve exigir
que o usuário decifre uma visualização para encontrar o botão de compra.

## Componentes novos

- `FlightSearchBar` — busca principal simples;
- `SearchModeToggle` — rota, qualquer destino, datas flexíveis;
- `OfferCard` — preço, contexto, validade e ações;
- `DealBadge` — classificação explicada, não apenas “promoção”;
- `FilterDrawer` — filtros progressivos;
- `ResultsToolbar` — total, ordenação, lista/mapa;
- `OpportunityMap` — mapa acessível com fallback para lista;
- `DestinationSummary` — destino, aeroportos e faixas de preço;
- `PackageCard` — voo + hospedagem/atividade com itens discriminados;
- `FreshnessLabel` — idade/validade do dado;
- `MonitorOfferButton` — cria Watch preservando a intenção da oferta;
- `PurchaseLinkButton` — abre o canal autorizado da última oferta observada;
- `ObservedPriceBlock` — preço, horário, validade e aviso de alteração.

## Regras de interação

- Buscar é uma ação explícita; filtros aplicados devem ter feedback imediato.
- Não esconder erro de fonte; mostrar “sem resultado”, “indisponível” e
  “atualizando” como estados distintos.
- Ao abrir mapa, preservar os filtros da lista.
- Ao selecionar ponto no mapa, destacar o item correspondente na lista.
- Ao criar Watch, informar quais dados foram herdados da oferta.
- No card de Watch, mostrar `Comprar passagem` somente quando existir deep link
  válido; junto do CTA, mostrar “preço observado” e a hora da observação.
- Se a oferta estiver expirada, trocar o CTA principal por “Atualizar preço” ou
  “Ver fornecedor” com aviso; nunca apresentar preço expirado como garantido.
- Links externos devem abrir com proteção de origem (`noopener,noreferrer`) e
  nunca aceitar `javascript:`, `data:` ou URL construída pelo usuário.
- O mapa deve ter alternativa textual e foco por teclado.
- Respeitar `prefers-reduced-motion` e não animar cada card individualmente.
- Dados antigos devem permanecer úteis como histórico, mas não parecer compra
  garantida.

## Plano de design em duas passagens

### Passagem 1 — fundação

Implementar busca/lista com os tokens atuais, estados vazios e dados simulados
contratados. Validar densidade, contraste, mobile e foco.

### Passagem 2 — diferenciação

Adicionar o mapa e a camada editorial de oportunidades somente depois de a
lista ser útil. A crítica visual deve remover decoração que não melhora uma
decisão.
