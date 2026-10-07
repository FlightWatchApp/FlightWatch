# Operação local e empacotamento — Flight Watch

Este documento explica o que existe hoje para executar a plataforma. A
plataforma de hospedagem, domínio, TLS, registry e deploy automático ainda não
foram decididos.

## Processos

| Processo              | Função                      | Falha típica                                |
| --------------------- | --------------------------- | ------------------------------------------- |
| `web`                 | UI e BFF                    | páginas sem resposta ou falha ao chamar API |
| `api`                 | HTTP, auth, busca e Watches | erro de configuração ou banco               |
| `scheduler`           | agenda targets              | backlog de targets elegíveis                |
| `price-worker`        | consulta provider           | timeout, rate limit ou circuito aberto      |
| `alert-worker`        | avalia regras               | AlertEvents atrasados                       |
| `notification-worker` | entrega e-mail              | canal inválido, retry ou stale sending      |
| `migrate`             | aplica Prisma migrations    | incompatibilidade do banco                  |

## Health e métricas

`GET /health` executa uma consulta curta ao PostgreSQL e retorna apenas:

```json
{ "status": "ok" }
```

Quando o banco está indisponível, responde `503` com status `unhealthy`. O
endpoint não expõe detalhes de infraestrutura.

Cada processo publica métricas Prometheus em um listener separado. O padrão é
`127.0.0.1`, com portas 9100–9104. Para uma rede interna de containers, o
deploy pode configurar `METRICS_HOST=0.0.0.0` nessa rede isolada; não exponha a
porta de métricas ao tráfego público.

Logs são JSON estruturado e usam `correlation_id` quando há uma operação
correlacionável. Não coloque IP como label de métrica nem registre token,
payload sensível ou contato completo.

## Docker

O `Dockerfile` multi-stage possui targets para cada processo. As imagens:

- usam Node 24 Debian slim;
- executam como usuário não root `node`;
- não incorporam `.env`, `.git` ou `.local`;
- recebem migração como etapa separada;
- não devem iniciar apontando acidentalmente para `localhost` em staging ou produção.

Build local:

```bash
docker build --target api -t flight-watch-api:local .
docker build --target web -t flight-watch-web:local .
docker compose --profile stack build
```

Stack local:

```bash
docker compose --profile stack up --build
```

## Ordem segura de deploy futuro

Quando houver uma plataforma definida, seguir a sequência:

1. validar configuração e secrets fora do repositório;
2. publicar a imagem imutável;
3. executar `migrate` como job separado;
4. subir API e workers compatíveis;
5. verificar `/health` e métricas internas;
6. executar smoke test com dados sintéticos;
7. promover gradualmente observando erro, backlog, custo e duplicação;
8. em falha, voltar à imagem anterior ou fazer roll-forward se o schema não
   permitir rollback seguro.

Ainda faltam registry, ambiente de staging real, backups/restauração, scan de
imagem no pipeline e runbook de incidentes com contatos do owner.

## Falhas esperadas e resposta

- **Provider fora do ar:** preservar último preço, classificar erro, aplicar
  retry limitado/circuit breaker e observar backlog.
- **Redis fora do ar:** não perder domínio confirmado no PostgreSQL; recuperar
  trabalho por outbox/reconciliação quando Redis voltar.
- **Notificação presa em `SENDING`:** sweep pode reivindicar entregas antigas
  com a mesma chave idempotente.
- **Job duplicado:** consumidor deve reconhecer estado/chave já processados e
  não criar nova observação, alerta ou mensagem.
- **Migração falha:** não iniciar nova versão parcialmente; corrigir ou fazer
  roll-forward com compatibilidade.

Para novos modos de falha, adicione métrica de início/sucesso/falha/duração,
log com correlação, código estável, prova de idempotência e um runbook.
