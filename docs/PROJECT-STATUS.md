# Estado atual do projeto

Retrato do repositório na branch `feat/docker-images`, commit `e008c9f`,
verificado em 2026-10-06. Este arquivo é um resumo operacional; a spec e o
código continuam sendo a fonte normativa de cada comportamento.

## Implementado e verificável

| Área            | Estado                                                                         |
| --------------- | ------------------------------------------------------------------------------ |
| Monorepo        | pnpm workspaces + Turborepo                                                    |
| Web             | Next.js App Router, páginas públicas e autenticadas, design v2                 |
| API             | NestJS + Fastify, contratos Zod, autorização por proprietário                  |
| Identidade      | registro, login/logout, sessão opaca, confirmação de e-mail                    |
| Conta           | recuperação de senha e exclusão iniciada pelo usuário                          |
| Busca           | busca pública de voos e detalhe persistido                                     |
| Monitoramento   | criação, listagem, detalhe, pausa, reativação e cancelamento                   |
| Preços          | observação imutável, histórico, frescor e oferta sem preço zero                |
| Alertas         | preço desejado, queda absoluta/percentual e novo menor observado               |
| Oportunidades   | feed e mapa calculados a partir de observações                                 |
| Compra          | deeplink allowlisted, clique registrado, afiliado configurável e transparência |
| Assíncrono      | scheduler, BullMQ, outbox, retry, lease e idempotência                         |
| Observabilidade | logs JSON, correlação, health e métricas internas                              |
| Empacotamento   | Dockerfile multi-stage e Compose com profile `stack`                           |
| Testes          | unitários, integração/e2e de API e checks de design no repositório             |

## Simulado ou não pronto para produção

- `SimulatedFlightProvider` é o único adapter de voos disponível;
- `InMemoryEmailSender` é o único adapter de e-mail disponível;
- links de compra simulados apontam para host claramente simulado;
- produção rejeita adapters simulados por configuração;
- não existe ainda plataforma de hospedagem, registry, domínio, TLS ou deploy automático;
- o contrato e a política comercial de um provedor real estão bloqueados;
- política definitiva de retenção, backups e expurgo da conta anonimizada ainda
  aguarda aprovação do owner;
- limites de plano, frequência final e SLOs dependem de dados reais de custo e cota.

## Documentação normativa e histórica

As specs antigas podem conservar `Status: draft para aprovação` por razões
históricas, mesmo quando a implementação e a seção “Evidência de
implementação” mostram código/testes existentes. Ao trabalhar em uma feature,
leia a spec inteira, os testes e o estado atual do código; não transforme
status histórico em decisão nova sem registrar a atualização documental.

O refactor web v2 está marcado como concluído em
[`design-refactor/PROGRESS.md`](./design-refactor/PROGRESS.md). A assinatura
humana da rubrica visual e decisões do owner continuam pendentes quando
indicadas naquele documento.

## Próximas decisões antes de produção

1. aprovar provedor de voos e termos de uso;
2. implementar e testar o adapter de voos real atrás de `FlightProvider`;
3. escolher serviço de e-mail idempotente;
4. aprovar retenção, backups e eliminação de dados;
5. definir hospedagem, secrets, registry e pipeline;
6. executar capacity test e calibrar intervalos, custos e SLOs;
7. executar E2E crítico e revisão manual de acessibilidade em staging.
