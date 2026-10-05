# SPEC-007 — Autenticação de usuário (email e senha)

Status: draft para aprovação  
Versão: 0.1  
Owner: Identity  
Dependências: PostgreSQL, ADR-006

## 1. Objetivo

Permitir que uma pessoa se registre com email e senha, autentique, encerre sua sessão e consulte sua própria identidade, substituindo o `StubAuthGuard` usado desde SPEC-001. Todo outro módulo continua dependendo apenas de `request.userId` — nada em Watches muda de comportamento, só a forma como `userId` é preenchido.

## 2. Fora do escopo

- verificação de posse do email (envio de link de confirmação);
- recuperação/reset de senha;
- rate limiting por IP (esta fase entrega apenas bloqueio por conta);
- múltiplas sessões visíveis ao usuário ou "sair de todos os dispositivos";
- renovação de sessão por sliding expiration;
- login social/OAuth;
- alteração de email ou senha após o registro.

Consequência direta de não haver verificação de email: o canal de notificação criado no registro nasce com `verifiedAt: null`. Um usuário recém-registrado que tentar criar um Watch (SPEC-001) recebe `403 CHANNEL_NOT_VERIFIED` — comportamento intencional desta fase, não bug, e não deve ser contornado auto-verificando o canal.

## 3. Pré-condições

- registro: email ainda não cadastrado;
- login: usuário existente, não bloqueado por tentativas malsucedidas (ver §6);
- logout / consulta de identidade: sessão válida e não expirada.

## 4. Entrada

`POST /v1/auth/register`

```json
{
  "email": "pessoa@example.com",
  "password": "uma-senha-com-pelo-menos-10-caracteres",
  "timezone": "America/Campo_Grande"
}
```

`POST /v1/auth/login`

```json
{
  "email": "pessoa@example.com",
  "password": "uma-senha-com-pelo-menos-10-caracteres"
}
```

`POST /v1/auth/logout` — sem corpo; usa `Authorization: Bearer <token>`.

`GET /v1/auth/me` — sem corpo; usa `Authorization: Bearer <token>`.

## 5. Validação

- email: formato válido, normalizado para minúsculas e sem espaços nas bordas;
- senha (registro): 10 a 256 caracteres — limite mínimo é placeholder, produto ainda não definiu política de complexidade (ver nota em `packages/contracts/src/auth/register.ts`);
- senha (login): 1 a 256 caracteres — validação de forma apenas, a verificação real é contra o hash armazenado;
- `timezone`: string não vazia (mesma obrigatoriedade já existente em `User.timezone`);
- campos desconhecidos são rejeitados no contrato público (`.strict()`), mesma regra de SPEC-001.

## 6. Comportamento

### Registro

1. Validar e normalizar a entrada.
2. Em transação:
   - criar `User` com `status=ACTIVE`, `passwordHash` (Argon2id);
   - criar `NotificationChannel` (`type=EMAIL`, `destination=email`, `verifiedAt=null`);
   - criar `Session` (token aleatório de 256 bits, hash SHA-256 armazenado, expiração conforme §9).
3. Se o email já existir (violação de unicidade), falhar com `409 EMAIL_ALREADY_REGISTERED` sem escrita parcial.
4. Retornar o mesmo formato de resposta do login (registro loga automaticamente — não há gate de verificação que justifique um passo separado).

### Login

1. Buscar usuário pelo email normalizado.
2. Se `lockedUntil` estiver no futuro, falhar com `423 ACCOUNT_LOCKED` sem verificar a senha.
3. Verificar a senha contra o hash armazenado. Se o usuário não existir, verificar mesmo assim contra um hash fixo (mitigação de enumeração por tempo de resposta) e sempre responder `401 INVALID_CREDENTIALS`.
4. Em caso de senha incorreta: incrementar `failedLoginAttempts` atomicamente no banco (`increment`, não um read-then-write em memória — sob tentativas concorrentes, um read-then-write perde incrementos e o bloqueio nunca dispara); ao atingir o limite (§9), setar `lockedUntil`; responder `401 INVALID_CREDENTIALS` (o código não distingue "senha errada" de "email inexistente" — distingue de "bloqueado", que já revela que a conta existe, ver §9 sobre esse trade-off).
5. Senha correta não basta: se `status !== ACTIVE` (BLOCKED/DELETED/PENDING_VERIFICATION), falhar com `403 ACCOUNT_NOT_ACTIVE` sem emitir sessão.
6. Em caso de sucesso: zerar `failedLoginAttempts`/`lockedUntil`, criar nova `Session`, retornar token.

### Logout

1. Remover a linha de `Session` correspondente ao token apresentado.
2. Responder `204` mesmo que o token já não existisse (logout é idempotente).

### Consulta de identidade (`/me`) e validação de sessão

1. Validar sessão: hash do token existe, não expirou, **e o usuário associado ainda está `ACTIVE`** — uma sessão emitida antes de a conta ser bloqueada/excluída não deve continuar autorizando nada; sem essa checagem repetida a cada request, o token seguia válido até expirar naturalmente (até 30 dias) mesmo pra uma conta já bloqueada.
2. Retornar identidade do usuário e o id do seu canal de notificação (necessário para o frontend submeter um Watch sem mais depender de um id fixo de desenvolvimento).

## 7. Resposta de sucesso

`201` (registro) / `200` (login):

```json
{
  "token": "opaque-string",
  "expiresAt": "RFC3339",
  "user": {
    "id": "uuid",
    "email": "pessoa@example.com",
    "status": "ACTIVE",
    "notificationChannelId": "uuid"
  }
}
```

`204` (logout), sem corpo.

`200` (`/me`):

```json
{
  "id": "uuid",
  "email": "pessoa@example.com",
  "status": "ACTIVE",
  "notificationChannelId": "uuid"
}
```

## 8. Erros

| Status | Código                     | Situação                                                                                           |
| -----: | -------------------------- | -------------------------------------------------------------------------------------------------- |
|    400 | `INVALID_AUTH_INPUT`       | campo ausente/malformado no registro ou login                                                      |
|    401 | `UNAUTHENTICATED`          | sessão ausente/inválida/expirada, ou usuário da sessão não está mais ACTIVE, em `/me` ou `/logout` |
|    401 | `INVALID_CREDENTIALS`      | email ou senha incorretos                                                                          |
|    403 | `ACCOUNT_NOT_ACTIVE`       | credenciais corretas, mas a conta não está ACTIVE (BLOCKED/DELETED/PENDING_VERIFICATION)           |
|    409 | `EMAIL_ALREADY_REGISTERED` | email já cadastrado                                                                                |
|    423 | `ACCOUNT_LOCKED`           | bloqueio temporário por tentativas malsucedidas                                                    |

Erros de login não expõem se o email existe (exceto o próprio `ACCOUNT_LOCKED`/`ACCOUNT_NOT_ACTIVE`, que necessariamente revelam que a conta existe — trade-off deliberado, ver §9).

## 9. Idempotência e concorrência

- `logout` é idempotente por natureza (remover algo que já não existe não é erro).
- Constraint única em `User.email` garante que registros concorrentes com o mesmo email resultem em exatamente um usuário criado e um `409` para o perdedor da corrida.
- Constraint única em `Session.tokenHash` torna colisão de token praticamente impossível (256 bits de entropia); se ocorrer, a criação da sessão falha e é tratada como erro interno, não como conflito de negócio.
- Política de bloqueio (placeholder, produto ainda não definiu valores finais — ver `apps/api/src/auth/auth.service.ts`): 5 tentativas malsucedidas consecutivas bloqueiam a conta por 15 minutos.
- Expiração de sessão (placeholder): 30 dias, sem renovação por sliding expiration nesta fase.
- Sessões expiradas não são removidas ativamente nesta fase — apenas ignoradas na validação (ver ADR-006, "Consequências negativas").

## 10. Eventos

Fora do escopo desta fase. Nenhum evento de outbox é emitido por registro/login/logout — não há hoje nenhum consumidor (ex.: notificação de "novo login") que justifique o custo de manter mais um fluxo de outbox.

## 11. Critérios de aceitação

- AC-001: registro com entrada válida cria usuário ativo, canal de notificação não verificado e retorna uma sessão válida.
- AC-002: registro com email já cadastrado falha com `409` e não cria segundo usuário.
- AC-003: login com senha correta retorna sessão válida.
- AC-004: login com senha incorreta ou email inexistente retorna o mesmo código `401 INVALID_CREDENTIALS`.
- AC-005: 5 tentativas malsucedidas consecutivas bloqueiam a conta; uma 6ª tentativa, mesmo com senha correta, retorna `423`.
- AC-006: logout invalida a sessão no servidor — uma chamada subsequente com o mesmo token retorna `401`, não apenas o cookie do cliente é apagado.
- AC-007: uma sessão de um usuário nunca autoriza acesso a dados de outro usuário (`/me` e todo endpoint de Watches).
- AC-008: senha e token de sessão nunca são armazenados em texto puro no banco.
- AC-009: uma conta BLOCKED/DELETED/PENDING_VERIFICATION não consegue logar mesmo com a senha correta (`403 ACCOUNT_NOT_ACTIVE`), e uma sessão já emitida antes da conta deixar de ser ACTIVE para de autorizar (`401` em `/me`) sem esperar a expiração natural do token.
- AC-010: 5 tentativas malsucedidas disparadas em paralelo (não só em sequência) ainda bloqueiam a conta — o contador é atômico no banco, não um read-then-write vulnerável a corrida.

## 12. Testes e evals

- unitários de hashing de senha (round-trip, senha errada rejeitada, hashes distintos para a mesma senha);
- integração via Testcontainers (Postgres real, sem mock) cobrindo registro/login/logout/bloqueio/expiração, mesmo padrão de `watches.e2e.spec.ts`;
- reexecução de `watches.e2e.spec.ts` como teste de regressão: a troca de guard não pode quebrar nenhum critério de aceitação de SPEC-001;
- teste de não-enumeração: tempo de resposta de login com email inexistente e com senha incorreta não deve diferir de forma detectável (verificação qualitativa nesta fase, não benchmark formal).

## 13. Observabilidade

- contador `auth_register_total{result}`;
- contador `auth_login_total{result}` com `result` incluindo `success`, `invalid_credentials`, `locked`;
- log com `correlation_id` e resultado, nunca com senha, token ou hash completo.

## 14. Performance

Sem meta formal de latência nesta fase — validação de sessão adiciona uma consulta ao Postgres por request autenticada (ver ADR-006, "Consequências negativas" e "Gatilhos para revisão").

## 15. Segurança

- senha nunca é logada, nem em caso de erro de validação;
- hash de senha via Argon2id (parâmetros padrão da biblioteca, alinhados a OWASP: memória 19 MiB, iterações 2, paralelismo 1);
- token de sessão gerado com CSPRNG (256 bits), armazenado apenas como hash SHA-256;
- `apps/api` não lê nem escreve cookies — decisão registrada em ADR-006;
- mudança neste módulo exige revisão humana explícita (AGENTS.md §8).

## 16. Rollout e rollback

Sem feature flag — este módulo substitui o `StubAuthGuard`, que não tem uso fora de desenvolvimento local, então não há tráfego real a proteger com rollout gradual. Rollback da aplicação mantém as tabelas `users` (colunas novas) e `sessions`; a migração não é destrutiva.
