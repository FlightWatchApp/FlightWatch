/**
 * SPEC-025 — headers do BFF (apps/web) para a API. O IP do cliente só é
 * aceito pela API quando acompanhado do segredo interno (INTERNAL_API_SECRET).
 */
export const CLIENT_IP_HEADER = 'x-fw-client-ip';
export const INTERNAL_SECRET_HEADER = 'x-fw-internal-secret';
