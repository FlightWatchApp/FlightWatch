import { describe, expect, it } from 'vitest';
import { parseAdminArgs } from './admin-args.js';

describe('parseAdminArgs (SPEC-043)', () => {
  it('promote e demote pedem --email', () => {
    expect(parseAdminArgs(['promote', '--email', 'Dono@Example.com'])).toEqual({
      ok: true,
      command: { name: 'promote', email: 'dono@example.com' },
    });
    expect(parseAdminArgs(['demote', '--email', 'a@b.com'])).toEqual({
      ok: true,
      command: { name: 'demote', email: 'a@b.com' },
    });
  });

  it('invite aceita --days opcional', () => {
    expect(parseAdminArgs(['invite', '--email', 'a@b.com'])).toEqual({
      ok: true,
      command: { name: 'invite', email: 'a@b.com', days: undefined },
    });
    expect(parseAdminArgs(['invite', '--email', 'a@b.com', '--days', '7'])).toEqual({
      ok: true,
      command: { name: 'invite', email: 'a@b.com', days: 7 },
    });
  });

  it('ignora o "--" que o pnpm repassa', () => {
    expect(parseAdminArgs(['--', 'promote', '--email', 'a@b.com']).ok).toBe(true);
  });

  it.each([
    [[]],
    [['promote']],
    [['promote', '--email']],
    [['promote', '--email', 'nao-e-email']],
    [['apagar', '--email', 'a@b.com']],
    [['invite', '--email', 'a@b.com', '--days', '0']],
    [['invite', '--email', 'a@b.com', '--days', '91']],
    [['invite', '--email', 'a@b.com', '--days', 'x']],
    [['promote', '--email', 'a@b.com', '--days', '3']],
  ])('recusa %j com mensagem de uso', (argv) => {
    const result = parseAdminArgs(argv);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.message).toContain('Uso:');
    }
  });
});
