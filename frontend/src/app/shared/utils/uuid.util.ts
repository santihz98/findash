/**
 * `crypto.randomUUID()` solo existe en un contexto seguro (HTTPS o
 * `localhost`) — el sitio real de FinDash se sirve por HTTP puro en un
 * dominio no-localhost (decisión consciente, ver ARCHITECTURE.md sección 7),
 * así que esa llamada lanza `TypeError: crypto.randomUUID is not a function`
 * ahí, aunque funcione perfecto bajo `ng serve` (localhost SÍ es un
 * contexto seguro). `crypto.getRandomValues()`, en cambio, está disponible
 * en cualquier contexto — es la base de esta implementación manual de
 * UUID v4. Nunca `Math.random()`: no es criptográficamente aleatorio, y
 * este valor se usa como `X-Idempotency-Key` real, no solo como id de UI.
 */
export function generateUuid(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16));

  // RFC 4122 v4: versión en el nibble alto del byte 6, variante en los
  // dos bits altos del byte 8.
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;

  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');

  return [hex.slice(0, 8), hex.slice(8, 12), hex.slice(12, 16), hex.slice(16, 20), hex.slice(20, 32)].join('-');
}
