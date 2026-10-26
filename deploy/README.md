# Deploy de produção (SPEC-042)

Tudo num servidor Linux só (Ubuntu 24.04, 2 vCPU e 4 GB de RAM bastam para o
beta). O site entra pela **Cloudflare** através de um túnel: o servidor não
abre porta nenhuma além do SSH.

```text
visitante ─HTTPS─▶ Cloudflare ─túnel─▶ cloudflared ─▶ web ─▶ api ─▶ postgres / redis
                                               └──▶ umami (stats.flightwatch.com.br)
```

## O que você precisa antes

| Item                            | Onde                                                                   |
| ------------------------------- | ---------------------------------------------------------------------- |
| Servidor Ubuntu 24.04 com IP    | provedor de hospedagem (Hetzner, Hostinger VPS, Vultr…)                |
| Domínio `flightwatch.com.br`    | registro.br, com os servidores DNS apontando para a Cloudflare         |
| Conta Cloudflare (grátis)       | DNS, Turnstile (captcha) e Zero Trust → Tunnels                        |
| Token da Travelpayouts **novo** | painel da Travelpayouts (gire o antigo)                                |
| Chave do Resend                 | painel do Resend, com o domínio `avisos.flightwatch.com.br` verificado |
| Chave SSH no seu PC             | `ssh-keygen -t ed25519` (se ainda não tiver `~/.ssh/id_ed25519.pub`)   |

## 1. Preparar o servidor (uma vez)

No seu PC, com o IP que o provedor mandou:

```bash
ssh root@IP "bash -s -- '$(cat ~/.ssh/id_ed25519.pub)'" < deploy/bin/setup-server.sh
```

Isso cria o usuário `deploy`, liga o SSH só com chave, fecha o firewall (só a
porta 22), liga fail2ban e atualizações automáticas e instala o Docker.
**Antes de fechar a sessão root**, abra outro terminal e confira:
`ssh deploy@IP`. Daqui em diante, sempre como `deploy`.

## 2. Baixar o projeto e preencher os segredos

Se o repositório for privado, crie no servidor uma chave só de leitura e
cadastre no GitHub (repositório → Settings → Deploy keys → Add, **sem** marcar
"Allow write access"):

```bash
ssh deploy@IP
ssh-keygen -t ed25519 -N '' -f ~/.ssh/id_ed25519 && cat ~/.ssh/id_ed25519.pub
```

Depois:

```bash
git clone git@github.com:FlightWatchApp/FlightWatch.git flightwatch
cd flightwatch
cp deploy/env.production.example deploy/.env.production
chmod 600 deploy/.env.production
nano deploy/.env.production
```

Cada segredo interno (`POSTGRES_PASSWORD`, `REDIS_PASSWORD`,
`INTERNAL_API_SECRET`, `UMAMI_DB_PASSWORD`, `UMAMI_APP_SECRET`,
`BACKUP_PASSPHRASE`) é gerado com:

```bash
openssl rand -base64 36 | tr -d '/+=' | cut -c1-40
```

Guarde a `BACKUP_PASSPHRASE` também **fora do servidor** (gerenciador de
senhas): sem ela, nenhum backup abre. O arquivo preenchido nunca vai para o
git (o `.gitignore` já o ignora) nem para as imagens (`.dockerignore`).

## 3. Primeira subida (sem o túnel ainda)

Deixe `CLOUDFLARE_TUNNEL_TOKEN` vazio e rode:

```bash
PREVIEW=1 deploy/bin/update.sh
```

Constrói as imagens (uns 10 minutos na primeira vez), roda as migrações e sobe
tudo. Com `PREVIEW=1`, o site fica em `127.0.0.1:3200` **só dentro do
servidor**. Para ver do seu PC:

```bash
ssh -L 3200:127.0.0.1:3200 deploy@IP    # e abra http://localhost:3200
```

## 4. Ligar o túnel e o domínio

1. Cloudflare → Zero Trust → Networks → Tunnels → **Create a tunnel**
   (tipo Cloudflared), nome `flightwatch`. Copie o **token** (a parte depois
   de `--token`) para `CLOUDFLARE_TUNNEL_TOKEN` no `.env.production`.
2. Na aba **Public Hostnames** do túnel:
   - `flightwatch.com.br` → `HTTP` → `web:3100`
   - `stats.flightwatch.com.br` → `HTTP` → `umami:3000`
3. Rode `deploy/bin/update.sh` (sem `PREVIEW`). O `cloudflared` sobe sozinho
   quando o token existe.
4. Abra `https://flightwatch.com.br/healthz` — deve responder `ok`.

Cloudflare → SSL/TLS: modo **Full**. Em Turnstile, crie o widget para
`flightwatch.com.br` e preencha `TURNSTILE_SITE_KEY`/`TURNSTILE_SECRET_KEY`
(sem elas a API não sobe em produção).

## 5. Estatística do beta (Umami)

1. Abra `https://stats.flightwatch.com.br`, entre com `admin` / `umami` e
   **troque a senha na hora**.
2. Settings → Websites → Add website: `flightwatch.com.br`.
3. Copie o **Website ID** para `UMAMI_WEBSITE_ID` e rode
   `deploy/bin/update.sh` (o id entra no build do web).

Sem cookies e sem IP gravado; o navegador só fala com o próprio site
(`/stats/...`, repassado ao Umami pela rede interna).

## 6. Aviso de site fora do ar

Crie uma conta grátis no [UptimeRobot](https://uptimerobot.com): monitor
**HTTP(s)**, URL `https://flightwatch.com.br/healthz`, a cada 5 minutos, aviso
por e-mail. `/healthz` só responde 200 quando o site **e** a API estão de pé.

## 7. Backup diário

```bash
deploy/bin/backup.sh          # testa agora: gera /var/backups/flightwatch/*.dump.enc
deploy/bin/restore-test.sh    # restaura num banco descartável e mostra as contagens
crontab -e                    # e acrescente:
# 30 6 * * * cd $HOME/flightwatch && deploy/bin/backup.sh >> $HOME/backup.log 2>&1
```

(06:30 UTC = 02:30 em Campo Grande.) Guarda 14 dias. Para ter uma cópia
**fora do servidor**, configure o rclone (`rclone config`, ex.: Google Drive
com nome `gdrive`) e preencha `BACKUP_RCLONE_REMOTE=gdrive:flightwatch`. Rode
o `restore-test.sh` uma vez por mês e depois de toda mudança de banco.

## 8. Acesso por convite e o primeiro admin (SPEC-043)

Com `INVITE_REQUIRED=true` (já no modelo de `.env.production`), só cria conta
quem tem uma chave de convite. A primeira chave é a sua, gerada pelo terminal:

```bash
# 1. chave para o seu e-mail (aparece só aqui; vale INVITE_TTL_DAYS dias)
deploy/bin/admin.sh invite --email voce@exemplo.com
# 2. abra o link impresso e crie a conta
# 3. torne a conta admin (único jeito: não existe caminho pelo site)
deploy/bin/admin.sh promote --email voce@exemplo.com
```

Daí em diante, as chaves saem pelo site em `/admin/convites` (e a cota e a
suspensão das pessoas em `/admin/pessoas`). `admin.sh demote --email …` tira o
papel. Para subir **sem** exigir chave, ponha `INVITE_REQUIRED=false` e
reinicie a `api` (nada é apagado).

## Publicar uma versão (main → release → servidor)

Duas branches, dois papéis:

| Branch    | O que é                                                    | Quem mexe                         |
| --------- | ---------------------------------------------------------- | --------------------------------- |
| `main`    | tudo o que passou no CI e foi mergeado; **não** é produção | todo PR                           |
| `release` | exatamente o que está (ou vai para) a produção             | só o `pnpm release`, de propósito |

Fluxo:

1. PRs entram na `main` com o CI verde (proteção da `main`: ver abaixo).
2. Teste o que importa no seu PC (`bash .local/up.sh`) ou no preview do
   servidor (`PREVIEW=1 deploy/bin/update.sh <commit>`).
3. **No PC**, promova: `pnpm release` (opcional `--tag v0.2.0` para marcar a
   versão). O script confere que o CI da `main` está verde, mostra os commits
   que vão subir e só então avança a `release` (sem `--force`: só em linha
   reta). `pnpm release --dry-run` mostra sem publicar.
4. **No servidor**: `deploy/bin/update.sh`. Ele faz backup do banco, vai para
   a `release`, constrói, roda as migrações e confere a saúde do site.
5. Deu errado? `deploy/bin/update.sh <versão anterior>` (a saída do `update.sh`
   mostra o commit). O código volta; migrações são só aditivas, então não
   precisam voltar. Se o **dado** foi afetado, restaure o backup feito
   antes da atualização (`/var/backups/flightwatch`, seção "Quando algo dá errado" › restaurar o banco).

O `update.sh` **recusa** a `main`. `SKIP_BACKUP=1` pula o backup (por sua conta).

### Proteções no GitHub (uma vez, pelo owner)

_Settings → Rules → Rulesets → New branch ruleset_, para **`main`** e **`release`**:

- **Restrict deletions** e **Block force pushes** (as duas);
- **Require a pull request before merging** só na `main` (a `release` recebe
  push do `pnpm release`; deixe só o dono do repositório autorizado a empurrar
  nela — _Restrict updates_ com você na lista de exceção);
- **Require status checks to pass** na `main`, marcando `gates`, `e2e` e
  `docker`;
- **Require branches to be up to date before merging**, se quiser PRs
  sempre testados sobre a `main` mais nova.

Sem isso a regra é só convenção; com isso, quebrar a `main` ou a produção por
engano deixa de ser possível.

## Dia a dia

| Quero…                        | Comando                                                                 |
| ----------------------------- | ----------------------------------------------------------------------- |
| publicar a versão nova        | no PC `pnpm release`; no servidor `deploy/bin/update.sh` (ver abaixo)   |
| voltar para a versão anterior | `deploy/bin/update.sh <tag ou commit>` (o `update.sh` mostra qual)      |
| ver o estado                  | `docker compose -p flightwatch ps`                                      |
| ver logs                      | `docker compose -p flightwatch logs -f --tail 100 api web price-worker` |
| reiniciar um processo         | `docker compose -p flightwatch restart price-worker`                    |

## Quando algo dá errado

- **`update.sh` diz que o web não ficou saudável**: veja os logs da `api`. A
  causa mais comum é variável faltando — o log mostra `config_invalid` com o
  **nome** da chave (nunca o valor). Corrija o `.env.production` e rode de novo.
  Se for a versão nova, volte com `deploy/bin/update.sh <commit anterior>`.
- **Site fora, servidor de pé**: `docker compose -p flightwatch ps`; se o
  `cloudflared` estiver reiniciando, o token do túnel está errado.
- **Restaurar o banco de verdade** (perda de dados): pare os processos, recrie
  o banco e restaure o backup:

  ```bash
  docker compose -p flightwatch stop api scheduler price-worker alert-worker notification-worker web
  docker compose -p flightwatch exec postgres dropdb -U flight_watch flight_watch
  docker compose -p flightwatch exec postgres createdb -U flight_watch flight_watch
  BACKUP_PASSPHRASE='...' openssl enc -d -aes-256-cbc -pbkdf2 -iter 200000 \
    -pass env:BACKUP_PASSPHRASE -in /var/backups/flightwatch/flight_watch-<data>.dump.enc \
    | docker compose -p flightwatch exec -T postgres pg_restore -U flight_watch -d flight_watch --no-owner
  deploy/bin/update.sh
  ```

  Isso **apaga** o banco atual: faça só com o backup certo em mãos.

## Segurança — resumo

- Só a porta 22 aberta; SSH só com chave; root sem login.
- Nenhum contêiner publica porta (o `compose.preview.yml` publica só em
  `127.0.0.1`). Atenção: porta publicada pelo Docker **passa por cima do ufw**
  — não acrescente `ports:` no compose de produção.
- Postgres e Redis com senha e só na rede interna.
- Segredos só no `deploy/.env.production` (`chmod 600`); os scripts recusam
  outra permissão.
- Backups criptografados (AES-256); a senha fica fora do servidor também.
