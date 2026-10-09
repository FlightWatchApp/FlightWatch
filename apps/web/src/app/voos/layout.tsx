import type { ReactNode } from 'react';
// SPEC-033: CSS do Leaflet só nas páginas de rota (mesmo padrão da SPEC-016).
import 'leaflet/dist/leaflet.css';

export default function RoutesLayout({ children }: { children: ReactNode }) {
  return children;
}
