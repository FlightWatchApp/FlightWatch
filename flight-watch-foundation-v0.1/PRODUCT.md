# PRODUCT — Flight Watch

Versão: 0.1  
Status: proposta para validação

## 1. Visão

Flight Watch é uma plataforma de observação de preços de viagens. O usuário informa uma intenção de viagem e regras de alerta; o sistema consulta provedores de ofertas de voos de forma assíncrona, registra o histórico observado e envia uma notificação quando as condições configuradas forem atendidas.

O produto não depende de inteligência artificial generativa para executar o monitoramento. O núcleo é determinístico, auditável e orientado a eventos. Inteligência artificial poderá ser adicionada posteriormente para explicar tendências, sugerir configurações ou estimar conveniência de compra, sem decidir silenciosamente se um alerta básico deve ou não ser enviado.

## 2. Problema

Pesquisar repetidamente a mesma passagem exige tempo, disciplina e comparação manual. O usuário também pode interpretar como promoção uma oscilação irrelevante ou perder uma redução de preço ocorrida entre duas consultas.

Do lado da plataforma, consultar uma API separadamente para cada usuário gera custo desnecessário e pode violar limites do provedor. O produto precisa compartilhar pesquisas equivalentes, preservar preferências individuais e manter rastreabilidade do motivo de cada alerta.

## 3. Proposta de valor

- configuração única da intenção de viagem;
- monitoramento periódico sem ação manual;
- histórico dos preços efetivamente observados;
- regras de alerta compreensíveis;
- alerta com preço, variação, horário e referência da oferta;
- redução de consultas externas por deduplicação;
- operação confiável mesmo diante de falhas temporárias de provedores.

O sistema informa preços observados, não garante disponibilidade, tarifa final ou emissão. O preço deve ser confirmado no canal de compra.

## 4. Público inicial

Pessoas que:

- conhecem origem, destino e período da viagem;
- não precisam emitir imediatamente;
- desejam acompanhar uma tarifa sem pesquisar todos os dias;
- aceitam receber alertas digitais e concluir a compra fora da plataforma.

## 5. Objetivos do MVP v0.1

1. Permitir cadastro e autenticação de usuários.
2. Criar, listar, pausar, reativar e encerrar monitoramentos.
3. Monitorar viagens de ida ou ida e volta com datas fixas.
4. Compartilhar pesquisas equivalentes entre usuários.
5. Consultar ao menos um provedor oficial ou licenciado.
6. Normalizar e armazenar observações de preço.
7. Exibir histórico básico por monitoramento.
8. Detectar preço-alvo e queda mínima configurada.
9. Enviar alerta por um canal inicial, com e-mail como baseline técnica.
10. Impedir notificações duplicadas e respeitar cooldown.
11. Medir custo, atraso, erro e efetividade do monitoramento.

## 6. Não objetivos do MVP

- vender, reservar ou emitir passagens;
- receber pagamentos pela passagem;
- atuar como agência de viagens;
- fazer scraping de sites sem autorização;
- monitorar milhas ou programas de fidelidade;
- pesquisar datas flexíveis, múltiplos destinos ou aeroportos alternativos;
- aplicar filtros avançados de bagagem, assento ou conexão;
- prever preços com inteligência artificial;
- prometer o menor preço de todo o mercado;
- oferecer aplicativo móvel nativo;
- operar múltiplos provedores em produção desde o primeiro lançamento.

## 7. Escopo funcional do MVP

### 7.1 Conta

- criar conta;
- entrar e sair;
- confirmar e-mail;
- recuperar acesso;
- excluir conta conforme política aplicável.

### 7.2 Monitoramento

Campos iniciais:

| Campo            | Obrigatório | Regra inicial                          |
| ---------------- | ----------: | -------------------------------------- |
| Origem           |         sim | código de aeroporto válido e suportado |
| Destino          |         sim | diferente da origem                    |
| Tipo             |         sim | ida ou ida e volta                     |
| Data de ida      |         sim | futura e dentro da janela do provedor  |
| Data de volta    | condicional | posterior à ida                        |
| Adultos          |         sim | 1 no lançamento; expansão posterior    |
| Cabine           |         sim | econômica inicialmente                 |
| Preço-alvo       |         não | valor monetário positivo               |
| Queda percentual |         não | percentual válido                      |
| Queda absoluta   |         não | valor monetário positivo               |
| Canal            |         sim | um canal verificado                    |

Pelo menos uma condição de alerta deve existir: preço-alvo, queda percentual, queda absoluta ou novo menor preço. A interface poderá oferecer uma configuração recomendada, mas a regra persistida deve ser explícita.

### 7.3 Histórico

O usuário visualiza:

- último preço observado;
- menor preço observado durante a vigência do monitoramento;
- data e hora da última consulta bem-sucedida;
- série temporal agregada, sem prometer continuidade quando o provedor estiver indisponível;
- estado atual do monitoramento.

### 7.4 Alerta

O alerta deve informar:

- rota e datas;
- preço atual e moeda;
- condição que foi atendida;
- referência comparativa usada;
- instante da observação;
- aviso de que preço e disponibilidade podem mudar;
- link rastreável para consulta ou compra, quando permitido pelo provedor.

## 8. Jornada principal

1. O usuário cria e confirma a conta.
2. Informa a viagem e a regra de alerta.
3. O sistema valida os dados e localiza ou cria um `SearchTarget` compartilhado.
4. O monitoramento fica ativo e informa quando ocorrerá a próxima verificação estimada.
5. O scheduler agenda uma pesquisa conforme prioridade e cotas.
6. O worker consulta o provedor e normaliza as ofertas.
7. O sistema registra a observação e avalia todas as regras vinculadas.
8. Uma condição atendida cria um `AlertEvent` idempotente.
9. O worker de notificação entrega a mensagem e registra o resultado.
10. O usuário acessa o histórico, pausa ou encerra o monitoramento.

## 9. Regras de experiência

- Não afirmar que o preço é o menor do mercado; usar “menor preço observado pelo sistema”.
- Mostrar a idade do dado e o horário da última consulta.
- Diferenciar claramente “sem oferta” de “falha na consulta”.
- Não esconder taxas conhecidas na apresentação do preço.
- Explicar por que o alerta foi enviado.
- Permitir pausa e cancelamento sem contato com suporte.
- Informar limitações do canal e do provedor.

## 10. Monetização — hipótese, não decisão

Modelo recomendado para validação:

- plano gratuito com poucos monitoramentos, frequência padrão e e-mail;
- plano pago com mais monitoramentos, maior prioridade dentro dos limites contratados, canais adicionais e histórico ampliado.

O plano pago não deve prometer frequência impossível de cumprir. Antes de precificar, devem ser conhecidos custo médio por `SearchTarget`, taxa de compartilhamento entre usuários, custo de mensagens e limites comerciais do provedor.

## 11. Métricas do produto

### Métrica norteadora

Percentual de monitoramentos ativos que geram ao menos uma observação válida dentro do SLO prometido.

### Métricas complementares

| Área           | Métrica                                             |
| -------------- | --------------------------------------------------- |
| Ativação       | usuários que criam o primeiro Watch válido          |
| Utilidade      | alertas abertos e acessados                         |
| Retenção       | usuários com Watch ativo após 30 dias               |
| Qualidade      | alertas falsos ou sem preço reproduzível reportados |
| Confiabilidade | atraso entre `next_check_at` e conclusão            |
| Eficiência     | Watches ativos por SearchTarget único               |
| Custo          | custo externo por Watch ativo e por alerta útil     |
| Entrega        | taxa de notificações entregues                      |

## 12. Critérios de sucesso do piloto

Metas iniciais sujeitas a ajuste após ensaio com o provedor:

- zero notificação duplicada conhecida para a mesma chave idempotente;
- 99% das execuções concluídas sem corrupção ou perda de estado;
- 95% dos targets elegíveis processados dentro da tolerância definida para seu nível de prioridade;
- 100% dos alertas com explicação da regra acionada;
- redução mensurável de chamadas graças à deduplicação;
- custo médio observável por monitoramento.

## 13. Riscos de produto

| Risco                         | Impacto                             | Tratamento inicial                                 |
| ----------------------------- | ----------------------------------- | -------------------------------------------------- |
| Limite ou custo de API        | inviabiliza frequência prometida    | validar provedor e medir custo antes do lançamento |
| Restrições contratuais de uso | impede exibição ou redirecionamento | revisão dos termos e registro da fonte             |
| Volatilidade da tarifa        | usuário encontra valor diferente    | timestamp, validade e aviso explícito              |
| Cobertura incompleta          | percepção de comparação total       | comunicar escopo do provedor                       |
| Alertas excessivos            | abandono                            | cooldown, limiar e preferências                    |
| Fraude/abuso                  | consumo de cota                     | verificação, rate limit e quotas por plano         |
| Dados pessoais                | risco regulatório                   | minimização, consentimento e controles LGPD        |

## 14. Questões abertas antes do desenvolvimento

1. Qual provedor permite legalmente busca recorrente e redirecionamento no mercado-alvo?
2. Qual é a cota contratada e o custo por busca/oferta?
3. O primeiro canal será somente e-mail ou incluirá WhatsApp?
4. Qual moeda e mercado serão atendidos no piloto?
5. Qual intervalo de monitoramento é financeiramente sustentável?
6. Por quanto tempo observações brutas e agregadas serão mantidas?
7. Haverá limite de Watches por usuário no piloto?
