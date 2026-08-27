/**
 * RN-01 (ARCHITECTURE.md 3.4). Puerto separado de `ITransactionRepository`
 * a propósito: `idempotency_keys` es infraestructura pura para deduplicar
 * requests (ver prisma/schema.prisma), no tiene relación con la
 * orquestación de negocio de una transferencia — mezclarlo en
 * `ITransactionRepository` haría que ese puerto conociera un concepto que
 * no le corresponde.
 */
export interface IIdempotencyKeyRepository {
  /**
   * Intenta reclamar la key con un `INSERT` (`transactionId = NULL`) —
   * ver la decisión de modelado en PROGRESS.md Sesión 1 sobre por qué
   * `transactionId` arranca nulo. Devuelve `true` si esta llamada reclamó
   * la key (el `INSERT` tuvo éxito, es la primera vez que se ve esta key);
   * `false` si ya existía (otra request, en curso o ya terminada, la tiene).
   */
  claim(key: string): Promise<boolean>;

  /** Vincula una key ya reclamada con la `Transaction` recién creada — se
   * llama una sola vez, cuando el use case termina con éxito. */
  complete(key: string, transactionId: string): Promise<void>;

  /** `transactionId` asociado a la key, o `null` si todavía no se completó
   * (la request original que la reclamó sigue en curso) o si la key no
   * existe en absoluto. */
  findTransactionId(key: string): Promise<string | null>;

  /**
   * Libera una key reclamada que nunca llegó a completarse — pasa cuando
   * el use case lanza antes de crear la `Transaction` (ej. fondos
   * insuficientes). Sin esto, un retry legítimo con la misma key después
   * de corregir el problema (ej. recargar saldo) se quedaría esperando
   * para siempre, porque `transactionId` nunca se iba a completar. Solo
   * borra si sigue sin completar (`transactionId IS NULL`) — si por algún
   * motivo ya se completó entre el error y esta llamada, no la toca.
   */
  release(key: string): Promise<void>;
}

export const IDEMPOTENCY_KEY_REPOSITORY = Symbol('IDEMPOTENCY_KEY_REPOSITORY');
