/**
 * RN-02 (ARCHITECTURE.md 3.3): tiempo máximo que `CreateTransferUseCase`
 * espera al servicio anti-fraude antes de abortar la transferencia.
 *
 * Se exporta acá (no hardcodeado inline en el use case) a propósito:
 * `IdempotencyInterceptor` (RN-01, Sesión 5) necesita calcular su propia
 * ventana de espera en función de este mismo valor — una request original
 * puede tardar hasta esto en el chequeo anti-fraude antes de seguir (o
 * abortar), así que la ventana de idempotencia tiene que cubrir ese tiempo
 * más el resto del pipeline. Import compartido en vez de dos constantes
 * "3000" copiadas a mano en dos archivos que se podrían desincronizar. Ver
 * PROGRESS.md Sesión 6 para el cálculo completo de la ventana derivada.
 */
export const ANTI_FRAUD_TIMEOUT_MS = 3000;

export interface AntiFraudCheckInput {
  originAccountId: string;
  destAccountId: string;
  /** String, no Decimal: este puerto no hace ninguna cuenta con el monto,
   * solo lo pasaría tal cual a un servicio externo real (día futuro). */
  amount: string;
}

/**
 * RN-02. `check()` se resuelve cuando el servicio "responde" — no lanza por
 * timeout en sí; eso lo decide quien llama (`CreateTransferUseCase`), con
 * `Promise.race` contra `ANTI_FRAUD_TIMEOUT_MS`. La implementación real
 * (`SimulatedAntiFraudAdapter`, Sesión 6) simula una demora aleatoria de
 * 1-10s vía un `IDelayProvider` inyectable — ver ese puerto para por qué
 * está separado (testabilidad: los tests inyectan un delay controlado, no
 * esperan segundos reales).
 */
export interface IAntiFraudService {
  check(input: AntiFraudCheckInput): Promise<void>;
}

export const ANTI_FRAUD_SERVICE = Symbol('ANTI_FRAUD_SERVICE');
