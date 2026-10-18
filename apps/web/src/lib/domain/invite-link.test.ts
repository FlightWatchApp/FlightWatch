import { describe, expect, it } from 'vitest';
import { parseInviteFragment } from './invite-link';

describe('parseInviteFragment (SPEC-043)', () => {
  it('lê chave e e-mail do fragmento do link do e-mail', () => {
    expect(
      parseInviteFragment('#convite=K7QMX4XTP9HRC2WVAN6DJ3QEZ&email=ana%2Bviagem%40exemplo.com'),
    ).toEqual({ code: 'K7QMX4XTP9HRC2WVAN6DJ3QEZ', email: 'ana+viagem@exemplo.com' });
  });

  it('aceita só a chave', () => {
    expect(parseInviteFragment('#convite=ABC')).toEqual({ code: 'ABC', email: null });
  });

  it('fragmento vazio ou sem chave: null', () => {
    expect(parseInviteFragment('')).toBeNull();
    expect(parseInviteFragment('#outra=1')).toBeNull();
  });

  it('não quebra com escape inválido', () => {
    expect(parseInviteFragment('#convite=%E0%A4%A')).toBeNull();
  });
});
