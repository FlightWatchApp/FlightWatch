import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Governança de agentes de IA já vive em AGENTS.md;
  // evita um AGENTS.md/CLAUDE.md duplicado e divergente gerado em apps/web.
  agentRules: false,
};

export default nextConfig;
