import { z } from 'zod';

/** SPEC-029: `GET /v1/places?q=&limit=` — autocomplete de cidades. */
export const searchPlacesQuerySchema = z
  .object({
    q: z.string().trim().max(64).default(''),
    limit: z.coerce.number().int().min(1).max(20).default(8),
  })
  .strict();

export type SearchPlacesQuery = z.infer<typeof searchPlacesQuerySchema>;

export const placeAirportSchema = z.object({ code: z.string(), name: z.string() });

export const placeSchema = z.object({
  code: z.string(),
  name: z.string(),
  countryCode: z.string(),
  countryName: z.string(),
  airports: z.array(placeAirportSchema),
});

export type Place = z.infer<typeof placeSchema>;

export const searchPlacesResponseSchema = z.object({ places: z.array(placeSchema) });

export type SearchPlacesResponse = z.infer<typeof searchPlacesResponseSchema>;

/** SPEC-029: coordenadas para o mapa; `null` quando o lugar não tem cadastro. */
export const coordinatesSchema = z.object({ lat: z.number(), lng: z.number() }).nullable();
