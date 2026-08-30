import { describe, it, expect } from 'vitest';
import { isAllowedOrigin } from '../../supabase/functions/_shared/cors.ts';

describe('isAllowedOrigin', () => {
  it('acepta prod y localhost', () => {
    expect(isAllowedOrigin('https://dosi-app.vercel.app')).toBe(true);
    expect(isAllowedOrigin('http://localhost:5173')).toBe(true);
    expect(isAllowedOrigin('http://localhost:4173')).toBe(true);
  });
  it('acepta preview deploys del proyecto', () => {
    expect(isAllowedOrigin('https://dosi-n56hlu8nm-rutigliano1988s-projects.vercel.app')).toBe(true);
    expect(isAllowedOrigin('https://dosi-app-git-feat-web-pieza-e-rutigliano1988s-projects.vercel.app')).toBe(true);
  });
  it('rechaza orígenes ajenos y trucos de sufijo', () => {
    expect(isAllowedOrigin('https://evil.com')).toBe(false);
    expect(isAllowedOrigin('https://dosi-app.vercel.app.evil.com')).toBe(false);
    expect(isAllowedOrigin('https://dosi-x-otracosa.vercel.app')).toBe(false);
    expect(isAllowedOrigin('')).toBe(false);
  });
});
