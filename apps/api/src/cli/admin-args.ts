import { emailSchema } from '@flight-watch/contracts';

export type AdminCommand =
  | { name: 'promote' | 'demote'; email: string }
  | { name: 'invite'; email: string; days: number | undefined };

export type ParsedAdminArgs = { ok: true; command: AdminCommand } | { ok: false; message: string };

const USAGE = `Uso:
  admin promote --email <e-mail>
  admin demote  --email <e-mail>
  admin invite  --email <e-mail> [--days N]`;

const fail = (reason: string): ParsedAdminArgs => ({
  ok: false,
  message: `${reason}\n${USAGE}`,
});

/** SPEC-043: argumentos do comando de admin no servidor (puro, sem I/O). */
export function parseAdminArgs(argv: readonly string[]): ParsedAdminArgs {
  const args = argv[0] === '--' ? argv.slice(1) : argv;
  const [name, ...rest] = args;
  if (name !== 'promote' && name !== 'demote' && name !== 'invite') {
    return fail('Comando desconhecido ou ausente.');
  }

  const options = new Map<string, string>();
  for (let index = 0; index < rest.length; index += 2) {
    const flag = rest[index];
    const value = rest[index + 1];
    if (!flag?.startsWith('--') || value === undefined) {
      return fail('Opção sem valor.');
    }
    options.set(flag, value);
  }

  const allowed = name === 'invite' ? ['--email', '--days'] : ['--email'];
  if ([...options.keys()].some((flag) => !allowed.includes(flag))) {
    return fail('Opção não aceita por este comando.');
  }

  const email = emailSchema.safeParse(options.get('--email'));
  if (!email.success) {
    return fail('Informe um --email válido.');
  }

  if (name !== 'invite') {
    return { ok: true, command: { name, email: email.data } };
  }

  const rawDays = options.get('--days');
  if (rawDays === undefined) {
    return { ok: true, command: { name, email: email.data, days: undefined } };
  }
  const days = /^\d+$/.test(rawDays) ? Number(rawDays) : Number.NaN;
  if (!Number.isInteger(days) || days < 1 || days > 90) {
    return fail('--days deve ser um inteiro de 1 a 90.');
  }
  return { ok: true, command: { name, email: email.data, days } };
}
