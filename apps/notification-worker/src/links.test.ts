import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { buildWatchManagementUrl } from './links.js';

const WEB_APP_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '../../web/src/app');

describe('buildWatchManagementUrl', () => {
  it('aponta para a página de detalhe do monitoramento no web', () => {
    expect(buildWatchManagementUrl('https://flightwatch.example', 'watch-123')).toBe(
      'https://flightwatch.example/watches/watch-123',
    );
  });

  it('não duplica a barra quando a base termina em /', () => {
    expect(buildWatchManagementUrl('https://flightwatch.example/', 'abc')).toBe(
      'https://flightwatch.example/watches/abc',
    );
  });

  it('escapa o id do monitoramento', () => {
    expect(buildWatchManagementUrl('https://x.example', 'a/b?c')).toBe(
      'https://x.example/watches/a%2Fb%3Fc',
    );
  });

  // Regressão: o link do e-mail de alerta apontava para /watches/:id/preferences,
  // rota que nunca existiu no apps/web.
  it('corresponde a uma rota que existe no apps/web', () => {
    expect(existsSync(resolve(WEB_APP_DIR, 'watches/[id]/page.tsx'))).toBe(true);
  });
});
