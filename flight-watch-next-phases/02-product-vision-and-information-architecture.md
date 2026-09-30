# Visão de produto e arquitetura de informação

## Posicionamento proposto

**Flight Watch ajuda pessoas a encontrar uma boa viagem, entender o preço e
acompanhar a oportunidade até o momento certo de comprar.**

Isso cria três entradas válidas:

1. a pessoa sabe a rota e quer buscar;
2. a pessoa sabe apenas a origem e quer explorar destinos baratos;
3. a pessoa já tem uma viagem e quer monitorar.

## Navegação principal

```text
Flight Watch
├── Explorar
│   ├── Buscar passagens
│   ├── Mapa de oportunidades
│   ├── Promoções
│   └── Pacotes
├── Meus monitoramentos
├── Alertas
└── Conta
```

A navegação pública deve permitir Explorar, Promoções e Pacotes sem login. Login
é exigido ao salvar, monitorar, favoritar ou configurar notificações.

## Home proposta

Para visitante sem Watches:

- busca principal imediatamente visível;
- atalhos “qualquer destino”, “fim de semana”, “férias” e “menor preço”;
- seção de oportunidades recentes por região;
- mapa reduzido ou teaser interativo, sem bloquear a lista;
- explicação curta de que os preços são observados e podem mudar.

Para usuário autenticado com Watches:

- bloco compacto de monitoramentos ativos;
- oportunidades recomendadas com base nas preferências explicitamente salvas;
- ações “ver oferta”, “monitorar rota”, “comprar” e “abrir histórico”.

## Entidades de experiência

| Conceito | Pergunta do usuário                     | Ação principal         |
| -------- | --------------------------------------- | ---------------------- |
| Busca    | “O que existe para estes critérios?”    | pesquisar              |
| Oferta   | “Esta opção é concreta e quanto custa?” | ver detalhes           |
| Promoção | “Por que isto merece atenção?”          | comparar/monitorar     |
| Destino  | “O que posso fazer saindo daqui?”       | explorar               |
| Pacote   | “Quanto custa a viagem como um todo?”   | ver pacote             |
| Watch    | “Como o preço desta intenção mudou?”    | comprar/pausar/alertar |

## Fluxos principais

### A — Descoberta sem cadastro

```text
Home → preencher busca → resultados → filtrar/ordenar
→ abrir oferta → ver fonte e validade → criar Watch opcional
```

### B — Exploração geográfica

```text
Home → “qualquer destino” → mapa/lista de destinos
→ selecionar região/destino → comparar ofertas → monitorar
```

### C — Monitoramento a partir de uma oferta

```text
Oferta → Monitorar preço → confirmar regra/canal → Watch ACTIVE
→ histórico e alertas
```

### D — Usuário sem monitoramentos

```text
Área autenticada vazia → oportunidades recentes + busca
→ primeira oferta útil → primeiro Watch
```

## Taxonomia de conteúdo

O frontend deve diferenciar claramente:

- **Preço ao vivo:** retornado recentemente por uma consulta de oferta;
- **Preço observado:** persistido pelo pipeline de monitoramento;
- **Promoção:** classificação calculada com regra e referência;
- **Preço expirado:** não deve ser tratado como comprável sem nova consulta;
- **Preço de pacote:** composição de componentes com validade independente.

## Regra de confiança

Toda card de oferta precisa mostrar, sem exigir abertura:

- origem/destino;
- datas ou grau de flexibilidade;
- preço e moeda;
- observada em / validade;
- fonte;
- número de escalas e duração, quando disponíveis;
- estado: disponível, atualizado há pouco, expirado ou indisponível.

Todo card de Watch com uma observação recente e deep link válido deve mostrar
uma ação de compra. A ação deve informar que o valor é o preço observado pelo
Flight Watch, abrir o canal do fornecedor e deixar claro que a tarifa pode
mudar antes da emissão.

## Métricas de produto a acrescentar

- buscas sem resultado;
- tempo até primeiro resultado útil;
- abertura de oferta;
- criação de Watch a partir de oferta;
- porcentagem de ofertas expiradas abertas;
- conversão de visitante em primeiro Watch;
- uso de mapa versus lista;
- cliques para o canal de compra;
- abertura e ação em promoções/pacotes.
