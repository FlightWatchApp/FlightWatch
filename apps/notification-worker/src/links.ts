/**
 * Link "pausar, ajustar ou encerrar" do e-mail de alerta: a página de detalhe
 * do monitoramento no apps/web, que já tem as ações de ciclo de vida
 * (SPEC-008). Exige login; o descadastro em um clique, sem login, entra com o
 * adapter de e-mail real.
 */
export function buildWatchManagementUrl(webBaseUrl: string, watchId: string): string {
  return `${webBaseUrl.replace(/\/+$/, '')}/watches/${encodeURIComponent(watchId)}`;
}
