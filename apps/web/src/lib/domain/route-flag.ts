/**
 * SPEC-033 §Rollout: o web lê o mesmo `ROUTE_PAGE_ENABLED` da API para não
 * apontar links para uma página desligada (que responderia 404). Só no
 * servidor: não é variável pública.
 */
export function routePagesEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.ROUTE_PAGE_ENABLED === 'true';
}
