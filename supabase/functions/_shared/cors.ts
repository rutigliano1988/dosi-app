// Política CORS de las Edge Functions. Puro y sin imports de Deno para que
// Vitest lo pueda importar desde src/.

const STATIC = new Set([
  'https://dosi-app.vercel.app',
  'http://localhost:5173',
  'http://localhost:4173',
]);

// Preview deploys de Vercel de este proyecto: `dosi-<hash>-…` (deploy alias) y
// `dosi-app-git-<rama>-…` (branch alias). Solo Vercel crea hosts bajo ese
// subdominio.
const PREVIEW = /^https:\/\/dosi(-app)?-[a-z0-9-]+-rutigliano1988s-projects\.vercel\.app$/;

export function isAllowedOrigin(origin: string): boolean {
  return STATIC.has(origin) || PREVIEW.test(origin);
}

export const CORS_FALLBACK_ORIGIN = 'https://dosi-app.vercel.app';
