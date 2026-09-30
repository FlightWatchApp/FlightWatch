# ADR-004 — Abstração de provedores de voos

Status: aceito para v0.1  
Data: 2026-09-17

## Contexto

Provedores diferem em parâmetros, formatos, cobertura, moeda, preço, limites e erros. Acoplar o domínio a um SDK específico impediria substituição, dificultaria testes e faria detalhes externos contaminarem regras internas.

## Decisão

Definir uma porta interna `FlightProvider` e modelos normalizados. Cada fornecedor possui adaptador, tradutor de erros, rate limit, telemetria e contract tests próprios.

Interface conceitual:

```typescript
interface FlightProvider {
  search(query: FlightSearchQuery, context: ProviderContext): Promise<ProviderSearchResult>;
}
```

Resultados possíveis incluem ofertas normalizadas, ausência válida de ofertas ou erro tipado. Tipos de SDK nunca atravessam a fronteira do adaptador.

## Regras

- domínio não conhece nome, SDK ou resposta bruta do provedor;
- toda oferta informa moeda, total, passageiros representados, itinerário e instante;
- campos ausentes permanecem ausentes, sem valor inventado;
- erros são classificados em rate limit, autenticação, validação, timeout, indisponibilidade e permanente;
- payload bruto, se retido, é protegido e possui prazo curto;
- seleção do provedor ocorre por estratégia externa ao domínio.

## Consequências positivas

- troca ou adição de fornecedor com menor impacto;
- fixtures e simuladores previsíveis;
- regras de domínio independentes de API;
- possibilidade futura de fallback e comparação.

## Consequências negativas

- modelo normalizado pode esconder recursos exclusivos;
- criação de adaptadores requer trabalho adicional;
- “menor denominador comum” pode limitar funcionalidades.

## Mitigação

O contrato comum cobre apenas o núcleo. Capacidades específicas podem ser expostas por interfaces versionadas e opcionais, sem contaminar o modelo base.

## Seleção do primeiro provedor

É decisão pendente. Exige spike que avalie:

- autorização para polling e armazenamento;
- cobertura de aeroportos e tarifas relevantes;
- composição do preço e validade da oferta;
- rate limits, custo e ambiente de teste;
- deeplink e regras de marca/atribuição;
- qualidade da documentação e suporte;
- requisitos contratuais no Brasil.

## Gatilhos para revisão

- impossibilidade de representar ofertas importantes;
- custo de normalização superior ao benefício;
- adoção de agregador interno ou padrão de mercado;
- necessidade de múltiplas estratégias simultâneas.
