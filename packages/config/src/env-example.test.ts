import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { definitionKeys } from './load.js';
import { ALL_CONFIG_DEFINITIONS, KEYS_VALIDATED_ELSEWHERE } from './processes.js';

const ENV_EXAMPLE_PATH = resolve(dirname(fileURLToPath(import.meta.url)), '../../../.env.example');

function envExampleKeys(): Set<string> {
  const keys = new Set<string>();
  for (const line of readFileSync(ENV_EXAMPLE_PATH, 'utf8').split('\n')) {
    // Chaves comentadas (`# CHAVE=`) também contam: documentam opcionais.
    const match = /^#?\s*([A-Z][A-Z0-9_]*)=/.exec(line.trim());
    if (match?.[1]) {
      keys.add(match[1]);
    }
  }
  return keys;
}

describe('SPEC-024 AC-7 — .env.example sincronizado com os schemas', () => {
  const documented = envExampleKeys();
  const read = new Set(Object.values(ALL_CONFIG_DEFINITIONS).flatMap(definitionKeys));

  it('documenta toda chave lida por um schema', () => {
    const missing = [...read].filter((key) => !documented.has(key));
    expect(missing).toEqual([]);
  });

  it('não documenta chave que ninguém lê', () => {
    const unknown = [...documented].filter(
      (key) => !read.has(key) && !KEYS_VALIDATED_ELSEWHERE.includes(key),
    );
    expect(unknown).toEqual([]);
  });
});
