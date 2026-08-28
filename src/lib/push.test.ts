import { describe, it, expect } from 'vitest';
import { urlBase64ToUint8Array } from './push';

describe('urlBase64ToUint8Array', () => {
  it('decodifica base64url con padding faltante', () => {
    // "hello" en base64 estándar es "aGVsbG8=" (5 bytes)
    const out = urlBase64ToUint8Array('aGVsbG8');
    expect(Array.from(out)).toEqual([104, 101, 108, 108, 111]);
  });

  it('traduce -_ a +/ (base64url)', () => {
    // bytes [251, 255] → base64 "+/8=" → base64url "-_8"
    const out = urlBase64ToUint8Array('-_8');
    expect(Array.from(out)).toEqual([251, 255]);
  });

  it('una clave VAPID típica da 65 bytes', () => {
    const vapid = 'BEl62iUYgUivxIkv69yViEuiBIa-Ib9-SkvMeAtA3LFgDzkrxZJjSgSnfckjBJuBkr3qBUYIHBQFLXYp5Nksh8U';
    expect(urlBase64ToUint8Array(vapid).length).toBe(65);
  });
});
