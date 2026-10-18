import { describe, expect, it } from 'vitest';
import {
  INVITE_CODE_ALPHABET,
  INVITE_CODE_LENGTH,
  formatInviteCode,
  generateInviteCode,
  normalizeInviteCode,
} from './invite-code.js';

describe('generateInviteCode', () => {
  it('gera 25 caracteres do alfabeto sem símbolos ambíguos', () => {
    const code = generateInviteCode();
    expect(code).toHaveLength(INVITE_CODE_LENGTH);
    expect(INVITE_CODE_LENGTH).toBe(25);
    for (const char of code) {
      expect(INVITE_CODE_ALPHABET).toContain(char);
    }
    expect(INVITE_CODE_ALPHABET).toHaveLength(30);
    expect(INVITE_CODE_ALPHABET).not.toMatch(/[01OILU]/);
  });

  it('descarta bytes que causariam viés de módulo', () => {
    // 240..255 seriam sobre-representados com `% 30`; precisam ser ignorados.
    const sequence = [255, 240, 0, 1, 29, 30, 239, ...Array<number>(60).fill(2)];
    let cursor = 0;
    const code = generateInviteCode((size) => {
      const chunk = sequence.slice(cursor, cursor + size);
      cursor += size;
      return Uint8Array.from(chunk);
    });
    // 0→'2', 1→'3', 29→'Z', 30→'2', 239→(239 % 30 = 29)→'Z'
    expect(code.slice(0, 5)).toBe('23Z2Z');
  });

  it('não repete em chamadas seguidas', () => {
    expect(generateInviteCode()).not.toBe(generateInviteCode());
  });
});

describe('formatInviteCode', () => {
  it('agrupa de 5 em 5 separado por hífen', () => {
    expect(formatInviteCode('K7QMX4XTP9HRC2WVAN6DJ3QEZ')).toBe('K7QMX-4XTP9-HRC2W-VAN6D-J3QEZ');
  });
});

describe('normalizeInviteCode', () => {
  it.each([
    ['K7QMX-4XTP9-HRC2W-VAN6D-J3QEZ'],
    ['k7qmx-4xtp9-hrc2w-van6d-j3qez'],
    ['K7QMX 4XTP9 HRC2W VAN6D J3QEZ'],
    ['  K7QMX4XTP9HRC2WVAN6DJ3QEZ  '],
  ])('aceita %s com ou sem hífen, espaço e caixa', (input) => {
    expect(normalizeInviteCode(input)).toBe('K7QMX4XTP9HRC2WVAN6DJ3QEZ');
  });
});
