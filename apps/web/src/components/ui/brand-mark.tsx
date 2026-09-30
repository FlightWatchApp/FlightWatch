/**
 * Marca do produto: um arco de rota entre dois pontos, referência direta ao que o
 * produto observa (uma rota monitorada), sem recorrer a silhueta de avião ou
 * gradiente. Usada no cabeçalho ao lado do nome; `app/icon.svg` é a versão
 * simplificada para favicon.
 */
export function BrandMark({ size = 28 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      fill="none"
      aria-hidden="true"
      focusable="false"
    >
      <circle cx="8" cy="22" r="2.75" fill="currentColor" />
      <circle cx="24" cy="10" r="2.75" fill="currentColor" />
      <path
        d="M10.3 20.2C14 14.8 18 11.8 21.7 11.8"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeDasharray="0.5 4.5"
      />
    </svg>
  );
}
