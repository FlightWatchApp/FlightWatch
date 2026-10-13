/**
 * Só declara JSON quando há corpo: o Fastify da API recusa `POST` com
 * `content-type: application/json` e corpo vazio (FST_ERR_CTP_EMPTY_JSON_BODY).
 * Pausar, reativar, encerrar, sair, reenviar confirmação e registrar o clique
 * de compra são `POST` sem corpo.
 */
export function contentTypeFor(init: RequestInit): Record<string, string> {
  return init.body == null ? {} : { 'content-type': 'application/json' };
}
