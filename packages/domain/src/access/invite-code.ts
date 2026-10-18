import { randomBytes } from 'node:crypto';

/**
 * SPEC-043: chave de convite. 30 símbolos (sem 0/O, 1/I/L, U) × 25 posições
 * ≈ 122 bits. A chave em claro nunca é persistida — só o hash da forma
 * normalizada.
 */
export const INVITE_CODE_ALPHABET = '23456789ABCDEFGHJKMNPQRSTVWXYZ';
export const INVITE_CODE_LENGTH = 25;

const GROUP_SIZE = 5;
// Maior múltiplo de 30 que cabe em um byte: bytes >= 240 são descartados
// (rejection sampling) para que `% 30` não favoreça os primeiros símbolos.
const UNBIASED_LIMIT = 240;

export type RandomBytesSource = (size: number) => Uint8Array;

export function generateInviteCode(source: RandomBytesSource = randomBytes): string {
  let code = '';
  while (code.length < INVITE_CODE_LENGTH) {
    for (const byte of source(INVITE_CODE_LENGTH * 2)) {
      if (byte >= UNBIASED_LIMIT) {
        continue;
      }
      code += INVITE_CODE_ALPHABET[byte % INVITE_CODE_ALPHABET.length];
      if (code.length === INVITE_CODE_LENGTH) {
        break;
      }
    }
  }
  return code;
}

/** `K7QMX4XTP9...` → `K7QMX-4XTP9-...` (só para exibição). */
export function formatInviteCode(normalized: string): string {
  const groups: string[] = [];
  for (let index = 0; index < normalized.length; index += GROUP_SIZE) {
    groups.push(normalized.slice(index, index + GROUP_SIZE));
  }
  return groups.join('-');
}

/** Tira espaços e hífens e põe em maiúsculas; é a forma que vai para o hash. */
export function normalizeInviteCode(input: string): string {
  return input.replace(/[\s-]+/g, '').toUpperCase();
}
