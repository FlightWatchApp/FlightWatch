# Rascunho — assinatura, convite e grupos de WhatsApp

Status: perguntas em aberto (owner, 2026-10-14) — retomar antes da SPEC-040.

## Modelo proposto pelo owner

A pessoa paga numa plataforma (Mercado Pago, InfinitePay…), recebe uma chave
de acesso ao grupo de promoções no WhatsApp e, com ela, cria a conta no Flight
Watch, com um limite de monitoramentos. Os grupos são a principal fonte de
renda.

## Proposta técnica (resumo da conversa)

- Pagamento aprovado avisa a API por **webhook** → convite de uso único,
  ligado ao e-mail e ao plano, enviado por e-mail com o link do grupo.
- Convite: aleatório, só o hash no banco, uso único com trava, prazo de
  validade, limite de tentativas por IP, estados (disponível, resgatado,
  expirado, cancelado). Painel para gerar códigos à mão (plano B).
- Limite de monitoramentos por plano, conferido na API.
- WhatsApp: a API oficial não gerencia membros de grupo; bibliotecas não
  oficiais violam os termos (risco de banir o número). Começar com Comunidade
  com grupo de avisos (números ocultos) e remoção manual de quem cancelou, com
  lista gerada pelo sistema; depois alertas individuais pela Cloud API.
  Telegram como alternativa (bot gera link de uso único e remove quem
  cancelou).

## LGPD e consumidor

- Grupo comum expõe o telefone de todos os membros: usar grupo de avisos em
  Comunidade (conferir a regra atual no app).
- Promoções por WhatsApp são marketing: consentimento explícito (caixa
  desmarcada) e saída fácil. Avisos de monitoramento são o serviço
  contratado, mas cada e-mail precisa de "parar de receber".
- Telefone verificado por código; nunca guardar dados de cartão (só id,
  status e e-mail do pagamento).
- Atualizar a Política de Privacidade (telefone, plataforma de pagamento,
  Meta) e o que acontece ao fim da assinatura; definir o encarregado.
- CDC art. 49: 7 dias de arrependimento com reembolso — o sistema precisa
  cancelar o convite ou o acesso.

## Decisões do owner pendentes

1. Cobrança única ou mensal? Mensal: ao parar de pagar, os monitoramentos
   pausam ou acabam?
2. Limite: monitoramentos ativos ao mesmo tempo (recomendado) ou novos por
   mês?
3. Planos diferentes (ex.: básico 3, completo 10)?
4. Plataforma: Mercado Pago (webhook e assinatura documentados) ou outra?
5. Só WhatsApp ou WhatsApp + Telegram?
6. Contas que já existem continuam grátis (fundadores do beta)?

Mudança de cobrança e cadastro exige aprovação explícita do owner em cada
etapa (CLAUDE.md §21).
