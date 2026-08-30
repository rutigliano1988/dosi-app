import { describe, it, expect } from 'vitest';
import { genCode } from './caregiver';

describe('genCode', () => {
  it('6 chars del alfabeto sin ambigüedades', () => {
    for (let i = 0; i < 200; i++) {
      const c = genCode();
      expect(c).toMatch(/^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{6}$/);
    }
  });
  it('varía entre llamadas', () => {
    const set = new Set(Array.from({ length: 50 }, () => genCode()));
    expect(set.size).toBeGreaterThan(40);
  });
});
