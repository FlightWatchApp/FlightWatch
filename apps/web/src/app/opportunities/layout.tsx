import type { ReactNode } from 'react';
// SPEC-016: CSS global do Leaflet, escopado a esta rota via layout de
// segmento — não carrega em nenhuma outra página que nunca mostra o mapa.
import 'leaflet/dist/leaflet.css';

export default function OpportunitiesLayout({ children }: { children: ReactNode }) {
  return children;
}
