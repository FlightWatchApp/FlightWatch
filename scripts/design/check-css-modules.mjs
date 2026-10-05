// EVAL-UI-MOTION-001. Em *.module.css, todo nome de animação precisa ser um @keyframes do próprio
// módulo ou um token var(--keyframes-*). O CSS Modules (Turbopack/lightningcss) renomeia nomes
// escritos direto no módulo, então `animation: fw-draw 1s` num .module.css aponta para um
// @keyframes que não existe e a animação simplesmente não roda (sem erro no console).
// Também confere que existe o bloco de movimento reduzido. Uso: node scripts/design/check-css-modules.mjs
import { exists, read, stripComments, walk, lineOf, webSrc } from './lib.mjs';

const KEYWORDS = new Set([
  'none',
  'initial',
  'inherit',
  'unset',
  'revert',
  'infinite',
  'normal',
  'reverse',
  'alternate',
  'alternate-reverse',
  'forwards',
  'backwards',
  'both',
  'running',
  'paused',
  'ease',
  'ease-in',
  'ease-out',
  'ease-in-out',
  'linear',
  'step-start',
  'step-end',
]);

function animationNames(value) {
  // Remove funções (var(), cubic-bezier(), steps()) antes de separar as palavras.
  const withoutFns = value.replace(/[a-z-]+\([^()]*(\([^()]*\)[^()]*)*\)/gi, ' ');
  return withoutFns
    .split(/[\s,]+/)
    .filter(Boolean)
    .filter((t) => !KEYWORDS.has(t.toLowerCase()) && !/^-?[\d.]+(m?s|%)?$/.test(t));
}

export function run() {
  const bad = [];
  const modules = walk(webSrc).filter((f) => f.endsWith('.module.css'));
  for (const file of modules) {
    const css = stripComments(read(file));
    const local = new Set([...css.matchAll(/@keyframes\s+([\w-]+)/g)].map((m) => m[1]));
    for (const m of css.matchAll(/animation(?:-name)?\s*:\s*([^;}]+)/g)) {
      for (const name of animationNames(m[1])) {
        if (!local.has(name))
          bad.push(
            `${file}:${lineOf(css, m.index)} animação "${name}" não existe neste módulo → use var(--keyframes-…)`,
          );
      }
    }
  }

  const globalCss = ['styles/globals.css', 'styles/tokens.css']
    .map((f) => `${webSrc}/${f}`)
    .filter(exists)
    .map(read)
    .join('\n');
  const reducedMotion = /prefers-reduced-motion:\s*reduce/.test(globalCss) ? 0 : 1;

  return {
    metrics: { animacaoSemKeyframes: bad.length, semMovimentoReduzido: reducedMotion },
    details: [
      ...bad,
      ...(reducedMotion
        ? ['styles/globals.css ou tokens.css sem @media (prefers-reduced-motion: reduce)']
        : []),
    ],
  };
}
