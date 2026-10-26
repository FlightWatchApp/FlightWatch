/**
 * SPEC-045 — nome do parceiro de compra, lido do endereço do link já validado
 * pela API (allowlist da SPEC-018), para o botão dizer para onde vai: a pessoa
 * confia mais num destino que ela reconhece. Só host exato: um endereço
 * parecido (`www.decolar.com.outro.site`) não é reconhecido.
 */
const PARTNERS: Record<string, string> = {
  'www.decolar.com': 'Decolar',
  'www.aviasales.com': 'Aviasales',
};

/** Rótulo do botão "todos os voos": nomeia o parceiro quando o reconhece. */
export function allFlightsLabel(href: string): string {
  const partner = purchasePartnerName(href);
  return partner ? `Ver todos os voos na ${partner}` : 'Ver todos os voos no site parceiro';
}

export function purchasePartnerName(href: string): string | null {
  let host: string;
  try {
    host = new URL(href).hostname;
  } catch {
    return null;
  }
  return PARTNERS[host] ?? null;
}
