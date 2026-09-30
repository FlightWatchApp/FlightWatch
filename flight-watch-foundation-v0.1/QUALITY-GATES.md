# QUALITY GATES — Flight Watch

Versão: 0.1  
Status: obrigatório para implementação

## 1. Princípio

Uma alteração somente está concluída quando os gates aplicáveis foram executados e aprovados. “Funciona localmente” não substitui evidência automatizada, revisão do diff e estratégia segura de entrega.

Não é permitido contornar gate reduzindo cobertura, silenciando erro ou alterando configuração sem justificar a causa.

## 2. Gates de pull request

### G0 — Escopo e rastreabilidade

- spec/issue identificada;
- critérios de aceitação mapeados para testes;
- diff limitado ao escopo;
- documentos e ADRs atualizados quando necessário;
- nenhuma decisão relevante escondida apenas no código.

Bloqueia merge: sim.

### G1 — Formatação e lint

- formatter sem diff pendente;
- lint sem erro;
- imports e fronteiras de módulo válidos;
- nenhuma supressão nova sem justificativa.

Bloqueia merge: sim.

### G2 — Typecheck e contratos

- TypeScript em modo estrito;
- geração/validação OpenAPI consistente;
- schemas de eventos e jobs compatíveis;
- sem `any` novo não justificado.

Bloqueia merge: sim.

### G3 — Testes unitários

- regras novas cobertas;
- edge cases monetários, datas e estados incluídos;
- testes determinísticos e independentes;
- mutação ou revisão equivalente nas funções críticas, quando configurada.

Baseline de cobertura inicial, a ser calibrada:

- domínio: 90% branches;
- adaptadores e aplicação: 80% branches;
- nenhuma redução global sem justificativa.

Cobertura é piso, não prova suficiente de qualidade.

Bloqueia merge: sim.

### G4 — Integração

- PostgreSQL e Redis reais via containers;
- constraints, transações, concorrência e outbox validadas;
- migrações aplicam em banco vazio e em snapshot suportado;
- retries e idempotência exercitados.

Bloqueia merge quando a mudança toca persistência, fila ou integração.

### G5 — Evals de domínio

- cenários relacionados aprovados;
- nenhuma regressão em deduplicação, preço, alerta ou idempotência;
- scorecard comparado à branch principal.

Bloqueia merge: sim.

### G6 — Segurança e supply chain

- secret scan;
- análise estática;
- dependências e licenças verificadas;
- imagens/container scan, quando houver;
- testes de autorização para endpoints alterados;
- nenhum dado sensível em logs/fixtures.

Vulnerabilidade crítica bloqueia merge. Alta bloqueia salvo exceção documentada, owner, mitigação e prazo.

### G7 — Banco e migração

- migração revisada;
- compatibilidade de deploy/rollback;
- lock e custo estimados para tabela existente;
- backfill reiniciável, se houver;
- constraints e índices nomeados e testados;
- nenhuma migração publicada editada.

Bloqueia merge quando aplicável.

### G8 — Performance e custo

- benchmark do caminho afetado;
- orçamento de chamadas externas respeitado;
- ausência de N+1 e fan-out não limitado;
- regressão de p95, CPU, memória ou chamadas dentro do orçamento acordado.

Alterações no scheduler, provider, fan-out ou histórico exigem este gate.

### G9 — Build e artefato

- build reprodutível;
- imagens executam como usuário não privilegiado quando aplicável;
- SBOM/proveniência conforme maturidade do pipeline;
- configuração obrigatória validada no startup;
- nenhum segredo incorporado ao bundle.

Bloqueia merge/release: sim.

### G10 — E2E crítico

Jornadas mínimas:

1. autenticar;
2. criar Watch;
3. receber observação simulada;
4. disparar alerta;
5. registrar entrega;
6. pausar e impedir novo alerta;
7. negar acesso cruzado.

Bloqueia release; pode rodar após merge quando custo do PR for excessivo, sem permitir promoção até aprovação.

### G11 — Observabilidade e operação

- métricas, logs e traces dos novos caminhos;
- dashboards/alertas ajustados;
- erros possuem código e ação;
- runbook para novo modo de falha;
- feature flag/kill switch quando o risco exigir.

Bloqueia release para mudanças operacionais relevantes.

## 3. Gates de release

Antes de produção:

- todos os gates aplicáveis verdes no commit exato;
- aprovação humana mínima definida pelo branch protection;
- staging validado com dados sintéticos;
- plano de rollout e rollback;
- backup e restauração testados conforme marco do projeto;
- migração compatível com a versão anterior;
- smoke test pós-deploy definido;
- owner disponível durante a janela de implantação;
- termos/cota do provedor e orçamento confirmados.

## 4. Estratégia de rollout

Ordem preferencial:

1. deploy compatível sem ativar comportamento;
2. aplicar migração expansiva;
3. habilitar internamente;
4. canário com pequena parcela;
5. ampliar gradualmente observando SLO, erro e custo;
6. concluir contração em release posterior.

Scheduler e integrações externas devem possuir kill switch para interromper novas chamadas sem derrubar a API de gestão.

## 5. Critérios automáticos de rollback/pausa

- duplicação de notificações acima de zero confirmado;
- aumento abrupto e não explicado de chamadas/custo;
- erro de autorização ou exposição de dados;
- corrupção/inconsistência de observações;
- taxa de falha do provedor ou worker acima do limite definido;
- backlog crescendo sem previsão de recuperação;
- incompatibilidade de schema/evento.

Quando rollback de schema for inseguro, executar roll-forward ou desativar a feature. A decisão deve constar no plano de migração.

## 6. Exceções

Exceção a gate exige:

- descrição do risco;
- justificativa objetiva;
- mitigação temporária;
- responsável;
- prazo de expiração;
- aprovação humana definida;
- issue de correção.

Não há exceção para segredo exposto, acesso indevido conhecido, corrupção de dados ou duplicação deliberada de cobrança/notificação.

## 7. Evidência no PR

Template mínimo:

```text
Spec:
Mudança:
Critérios atendidos:
Testes executados:
Evals executados:
Migração/rollback:
Observabilidade:
Riscos e pendências:
```
