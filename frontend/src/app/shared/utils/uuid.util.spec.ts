import { generateUuid } from './uuid.util';

const UUID_V4_SHAPE = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

describe('generateUuid', () => {
  it('returns a valid UUID v4 (version nibble y variante bits correctos)', () => {
    expect(generateUuid()).toMatch(UUID_V4_SHAPE);
  });

  it('never returns the same value twice across thousands of calls (mismo criterio estadístico que RandomDelayProvider en el backend)', () => {
    const values = new Set(Array.from({ length: 5000 }, () => generateUuid()));
    expect(values.size).toBe(5000);
  });

  it('every generated value matches the UUID v4 shape across many iterations', () => {
    for (let i = 0; i < 500; i++) {
      expect(generateUuid()).toMatch(UUID_V4_SHAPE);
    }
  });
});
