'use client';

import dynamic from 'next/dynamic';
import { Skeleton } from '@/components/ui/skeleton';
import type { RouteMapProps } from './route-map';

// Leaflet toca `window` na importação: `ssr: false` só dentro de Client Component.
const RouteMap = dynamic(() => import('./route-map'), {
  ssr: false,
  loading: () => <Skeleton height="18rem" />,
});

export function RouteMapLoader(props: RouteMapProps) {
  return <RouteMap {...props} />;
}
