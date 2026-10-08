import { Injectable } from '@nestjs/common';
import {
  type CitySearchResult,
  findPlaceSummaries,
  findSearchableCities,
  resolveSearchableCityCode,
  type SearchableCity,
  searchCities,
} from '@flight-watch/database';
import { PrismaService } from '../prisma/prisma.service.js';

interface Route {
  origin: string;
  destination: string;
}

export interface RouteNames {
  originName: string | null;
  destinationName: string | null;
}

export interface RouteCoordinates {
  originCoordinates: { lat: number; lng: number } | null;
  destinationCoordinates: { lat: number; lng: number } | null;
}

/**
 * SPEC-029 — catálogo de lugares para a API: autocomplete, normalização de
 * origem/destino para cidade e nomes/coordenadas das respostas, sempre numa
 * consulta em lote por resposta (nunca uma por item).
 */
@Injectable()
export class PlacesService {
  constructor(private readonly prisma: PrismaService) {}

  search(query: string, limit: number): Promise<CitySearchResult[]> {
    return searchCities(this.prisma.client, query, limit);
  }

  /** Cidade pesquisável para o código (cidade ou aeroporto); null se não houver. */
  resolveCity(code: string): Promise<string | null> {
    return resolveSearchableCityCode(this.prisma.client, code);
  }

  /** SPEC-032: cidades pesquisáveis com país, numa consulta só. */
  searchableCities(codes: readonly string[]): Promise<Map<string, SearchableCity>> {
    return findSearchableCities(this.prisma.client, codes);
  }

  async withRouteNames<T extends Route>(items: readonly T[]): Promise<(T & RouteNames)[]> {
    const summaries = await findPlaceSummaries(
      this.prisma.client,
      items.flatMap((item) => [item.origin, item.destination]),
    );
    return items.map((item) => ({
      ...item,
      originName: summaries.get(item.origin)?.name ?? null,
      destinationName: summaries.get(item.destination)?.name ?? null,
    }));
  }

  async withRouteNamesAndCoordinates<T extends Route>(
    items: readonly T[],
  ): Promise<(T & RouteNames & RouteCoordinates)[]> {
    const summaries = await findPlaceSummaries(
      this.prisma.client,
      items.flatMap((item) => [item.origin, item.destination]),
    );
    const coordinates = (code: string) => {
      const summary = summaries.get(code);
      return summary && summary.lat !== null && summary.lng !== null
        ? { lat: summary.lat, lng: summary.lng }
        : null;
    };
    return items.map((item) => ({
      ...item,
      originName: summaries.get(item.origin)?.name ?? null,
      destinationName: summaries.get(item.destination)?.name ?? null,
      originCoordinates: coordinates(item.origin),
      destinationCoordinates: coordinates(item.destination),
    }));
  }
}
