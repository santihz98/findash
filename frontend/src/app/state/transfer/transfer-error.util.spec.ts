import { describeTransferError } from './transfer-error.util';

describe('describeTransferError', () => {
  it('400: mensaje del backend tal cual, sin retry', () => {
    const p = describeTransferError(400, 'amount debe ser un monto positivo con hasta 2 decimales');
    expect(p.message).toBe('amount debe ser un monto positivo con hasta 2 decimales');
    expect(p.retryStrategy).toBe('none');
    expect(p.retryLabel).toBeNull();
  });

  it('403: mensaje del backend tal cual, sin retry (defensa en profundidad, tarea 7)', () => {
    const p = describeTransferError(403, 'Forbidden resource');
    expect(p.message).toBe('Forbidden resource');
    expect(p.retryStrategy).toBe('none');
  });

  it('404: destino inexistente, mensaje accionable, sin retry automático', () => {
    const p = describeTransferError(404, 'La cuenta destino "x" no existe');
    expect(p.message).toBe('La cuenta destino "x" no existe');
    expect(p.retryStrategy).toBe('none');
    expect(p.helpText).toContain('destino');
  });

  it('422: fondos insuficientes / misma cuenta, mensaje accionable, sin retry automático', () => {
    const p = describeTransferError(422, 'Fondos insuficientes para completar la transferencia');
    expect(p.message).toBe('Fondos insuficientes para completar la transferencia');
    expect(p.retryStrategy).toBe('none');
  });

  it('504: explica que es antifraude y ofrece retry con key NUEVA', () => {
    const p = describeTransferError(504, 'El servicio anti-fraude no respondió a tiempo.');
    expect(p.message).toBe('El servicio anti-fraude no respondió a tiempo.');
    expect(p.retryStrategy).toBe('new-key');
    expect(p.retryLabel).toBe('Reintentar');
    expect(p.helpText).toMatch(/antifraude|anti-fraude/i);
  });

  it('409: explica la carrera de idempotencia y ofrece retry con la MISMA key', () => {
    const p = describeTransferError(
      409,
      'Ya hay una transferencia en curso con esta X-Idempotency-Key. Reintenta en unos segundos.',
    );
    expect(p.retryStrategy).toBe('same-key');
    expect(p.retryLabel).toBe('Reintentar');
    expect(p.helpText).toMatch(/en curso|esperá/i);
  });

  it('504 y 409 difieren explícitamente en retryStrategy (la decisión de UX más importante de la sesión)', () => {
    const timeout = describeTransferError(504, 'x');
    const race = describeTransferError(409, 'x');
    expect(timeout.retryStrategy).not.toBe(race.retryStrategy);
    expect(timeout.retryStrategy).toBe('new-key');
    expect(race.retryStrategy).toBe('same-key');
  });

  it('código desconocido: fallback seguro sin retry ni catch-all engañoso', () => {
    const p = describeTransferError(500, 'Internal server error');
    expect(p.message).toBe('Internal server error');
    expect(p.retryStrategy).toBe('none');
    expect(p.retryLabel).toBeNull();
  });
});
