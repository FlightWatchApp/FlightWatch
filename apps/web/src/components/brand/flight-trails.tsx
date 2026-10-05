import styles from './flight-trails.module.css';

interface FlightPath {
  d: string;
  duration: string;
  delay: string;
  scale: number;
}

/**
 * Camada decorativa de fundo, presente em todo o site (montada em
 * `app/layout.tsx`): aviões pequenos e translúcidos voando em curva sobre
 * um "mapa" implícito. Não é aleatório de verdade — recalcular trajeto a
 * cada frame custaria caro à toa para algo puramente ambiente; a variedade
 * vem de cada avião ter sua própria curva, duração, atraso e tamanho,
 * fixos. `aria-hidden` e `pointer-events: none`: decorativo, nunca
 * intercepta clique nem leitor de tela. Pausa inteira sob
 * `prefers-reduced-motion`.
 *
 * Rastro: linha tracejada de verdade ("- - - -"), não um traço único —
 * mas só visível numa janela curta atrás do avião, não pela curva
 * inteira (senão volta a ficar poluído). Truque: a linha tracejada fina
 * é estática e cobre a curva toda; uma `<mask>` com uma cápsula revela só
 * o trecho atrás do avião. A cápsula se move por `<animateMotion>` com
 * exatamente o mesmo `dur`/`begin`/`path`/`rotate` do avião — mesmo
 * motor (SMIL), não CSS + SMIL junto. Antes a janela era animada em CSS
 * (`stroke-dashoffset`) enquanto o avião usava SMIL: dois motores de
 * tempo independentes derivam um do outro, por isso o avião aparecia ora
 * à frente, ora atrás do traço. Com os dois no SMIL e os mesmos
 * parâmetros, a posição é idêntica em todo instante, sem deriva possível.
 * Nenhum JS por frame.
 */
const PATHS: FlightPath[] = [
  {
    d: 'M -80,180 C 220,60 480,60 540,260 C 600,460 340,460 300,290 C 260,150 510,100 760,190 C 1060,300 1320,520 1680,660',
    duration: '26s',
    delay: '-4s',
    scale: 1,
  },
  {
    d: 'M 1680,220 C 1320,110 1020,320 820,260 C 560,190 410,420 150,520 C -40,590 -90,630 -140,680',
    duration: '22s',
    delay: '-14s',
    scale: 0.85,
  },
  {
    d: 'M -80,820 C 280,710 600,610 860,510 C 1110,410 1160,250 1010,200 C 880,160 860,330 1010,390 C 1160,450 1410,300 1680,90',
    duration: '24s',
    delay: '-20s',
    scale: 0.9,
  },
];

/** Dardo minimalista apontando para +X — `rotate="auto"` do `animateMotion` alinha com a curva. */
const PLANE_SHAPE = 'M9,0 L-6,-4.5 L-2,0 L-6,4.5 Z';

export function FlightTrails() {
  return (
    <div className={styles.layer} aria-hidden="true">
      <svg
        viewBox="0 0 1600 900"
        preserveAspectRatio="xMidYMid slice"
        className={styles.svg}
        focusable="false"
      >
        {PATHS.map((flight, index) => {
          const maskId = `fw-trail-mask-${index}`;
          return (
            <g
              key={index}
              className={styles.flight}
              style={{ '--fw-flight-scale': flight.scale } as React.CSSProperties}
            >
              <mask
                id={maskId}
                maskUnits="userSpaceOnUse"
                x="-200"
                y="-200"
                width="2000"
                height="1300"
              >
                {/* Cápsula atrás da origem local (eixo -X — "rotate=auto" alinha +X
                    com a direção do voo, igual ao PLANE_SHAPE): revela o rastro
                    só atrás de onde o avião está, nunca na frente. */}
                <rect
                  x="-320"
                  y="-25"
                  width="320"
                  height="50"
                  rx="25"
                  className={styles.trailWindow}
                >
                  <animateMotion
                    dur={flight.duration}
                    begin={flight.delay}
                    repeatCount="indefinite"
                    rotate="auto"
                    path={flight.d}
                  />
                </rect>
              </mask>
              <path d={flight.d} pathLength={1} className={styles.trail} mask={`url(#${maskId})`} />
              <path d={PLANE_SHAPE} className={styles.plane}>
                <animateMotion
                  dur={flight.duration}
                  begin={flight.delay}
                  repeatCount="indefinite"
                  rotate="auto"
                  path={flight.d}
                />
              </path>
            </g>
          );
        })}
      </svg>
    </div>
  );
}
