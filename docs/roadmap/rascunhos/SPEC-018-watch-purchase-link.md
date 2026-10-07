# SPEC-018 — Compra a partir do monitoramento

Status: rascunho para aprovação  
Dependências: SPEC-004, SPEC-009, SPEC-014

## Objetivo

Permitir que o usuário abra o canal de compra da passagem que está sendo
monitorada, diretamente pelo card do Watch, preservando o preço observado que
originou o link.

O Flight Watch não vende, reserva ou garante a passagem nesta fase. O botão leva
ao fornecedor autorizado; o valor exibido é uma fotografia da observação e pode
mudar no checkout.

## Estado atual

`PriceObservation` já possui `deeplink` e `expiresAt`, e o provider normalizado
já pode entregar `deeplink`. O gap está entre persistência e experiência:

```text
PriceObservation.deeplink
  → repositório de Watches
  → contrato WatchListItem/WatchDetail
  → WatchCard e WatchDetailPage
  → link externo de compra
```

## Contrato de resposta

Adicionar ao item de listagem e ao detalhe:

```json
{
  "currentOffer": {
    "amountMinor": 248000,
    "currency": "BRL",
    "purchaseUrl": "https://provider.example/checkout/opaque-offer",
    "provider": "SIMULATED",
    "observedAt": "2027-03-10T12:00:00.000Z",
    "expiresAt": "2027-03-10T13:00:00.000Z",
    "status": "CURRENT"
  }
}
```

`currentOffer` é `null` quando não existe observação válida com deep link.
`status` deve ser `CURRENT` ou `EXPIRED`. O `currentPrice` existente continua
disponível para compatibilidade e para o resumo visual, mas o CTA deve usar o
mesmo snapshot representado em `currentOffer`.

## Regras de resolução

1. Selecionar a observação de preço mais recente do Watch.
2. Carregar `deeplink`, `providerStrategy`, `observedAt` e `expiresAt` junto do
   valor observado.
3. Validar o link antes de projetá-lo:
   - esquema `https` obrigatório;
   - host pertencente ao provider configurado;
   - sem `javascript:`, `data:`, `file:` ou URL montada de entrada do usuário.
4. Se não houver link válido, retornar `currentOffer: null` e não mostrar CTA de
   compra.
5. Se `expiresAt` passou, manter a referência apenas como `EXPIRED`, com aviso;
   não apresentar como disponibilidade atual.
6. Nunca substituir o link por uma busca nova silenciosa no clique.

## Experiência no card

```text
DOU → GRU                         ativo
Preço observado                   R$ 2.480
Observado há 18 min · Provider X

[Comprar passagem] [Ver histórico]
Preço e disponibilidade podem mudar no fornecedor.
```

Para uma oferta expirada:

```text
Preço observado                   R$ 2.480
Essa oferta pode ter mudado.

[Atualizar preço] [Ver histórico]
```

O link pode abrir nova aba/janela com `noopener,noreferrer`. A interface não
deve chamar o botão de “comprar por R$ 2.480”; deve usar “Comprar passagem” e
mostrar o preço como observado.

## Critérios de aceitação

- `GET /v1/watches` inclui `currentOffer` quando há deep link válido;
- `GET /v1/watches/:id` mantém os mesmos dados do card e inclui `currentOffer`;
- resposta de lifecycle também mantém o mesmo `currentOffer`;
- o preço, moeda, fonte, observação e validade são do mesmo snapshot;
- Watch sem observação/deep link não exibe botão quebrado;
- URL inválida nunca chega ao frontend;
- link expirado tem estado e cópia de aviso próprios;
- clique no CTA abre o domínio autorizado;
- nenhuma URL completa, token ou PII entra em logs/métricas;
- teste cobre troca de preço: o link acompanha a observação mais recente;
- teste cobre provider sem deep link;
- teste de frontend cobre estado atual, expirado e ausente.

## Persistência e migração

Não é necessária nova coluna se `PriceObservation.deeplink` já estiver presente
e for suficiente para o snapshot. A mudança inicial deve ser de projeção,
contrato e frontend. Uma tabela de ofertas só deve ser criada quando a busca
interativa da SPEC-014 exigir múltiplas ofertas por consulta.

## Observabilidade

- `watch_purchase_link_click_total{provider,status}`;
- log estruturado de clique com `watch_id`, provider e status, sem URL completa;
- contador de `purchase_link_missing_total{provider}` para medir cobertura;
- não usar rota, URL, user ID ou e-mail como label.
