import {
  BadRequestException,
  CallHandler,
  ConflictException,
  ExecutionContext,
  Inject,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Request } from 'express';
import { Observable, from, of } from 'rxjs';
import { catchError, mergeMap } from 'rxjs/operators';
import {
  IDEMPOTENCY_KEY_REPOSITORY,
  IIdempotencyKeyRepository,
} from '../../domain/ports/idempotency-key.repository.port';
import { ITransactionRepository, TRANSACTION_REPOSITORY } from '../../domain/ports/transaction.repository.port';
import { ANTI_FRAUD_TIMEOUT_MS } from '../../domain/ports/anti-fraud.service.port';
import { Transaction } from '../../domain/entities/transaction.entity';

const HEADER_NAME = 'x-idempotency-key';

// RN-02 (Sesión 6): después del chequeo anti-fraude, a la request original
// todavía le queda el resto del pipeline transaccional — lock de ambas
// cuentas + 2 UPDATE + 1 INSERT + overhead de red/Prisma. Medido en la
// práctica (Sesión 5, tests de concurrencia): <50ms sin contención. Se deja
// un margen bastante más generoso (2000ms) para tolerar contención real
// bajo carga (otra transferencia sosteniendo el lock de la misma cuenta) —
// no hay forma de acotar ese caso con precisión, así que se prefiere
// quedarse corto en agresividad, no en cobertura.
const TRANSACTIONAL_SAFETY_MARGIN_MS = 2000;

/**
 * RN-01 (ARCHITECTURE.md 3.4). Vive en `transactions/interfaces/` (no en
 * `shared/`) porque ARCHITECTURE.md sección 3 ya especifica literalmente
 * esta ruta en el árbol del proyecto
 * (`transactions/interfaces/interceptors/idempotency.interceptor.ts`) — la
 * Sesión 0 dejó la carpeta vacía (`.gitkeep`) preparada para esto. También
 * tiene sentido por contenido: hoy es el único endpoint con efectos
 * secundarios "peligrosos" (mueve dinero) — si otro módulo lo necesitara
 * en el futuro, ahí sí ameritaría subir a `shared/`.
 *
 * Flujo (defensa en profundidad, ver PROGRESS.md Sesión 1 sobre la
 * relación IdempotencyKey <-> Transaction):
 *  1. Sin header -> 400. Se decidió **requerido**, no opcional: el
 *     enunciado de RN-01 lo pide como obligatorio, y dejarlo opcional
 *     invita a que un cliente lo olvide justo en el caso que importa (una
 *     transferencia real de dinero).
 *  2. Intenta reclamar la key (`INSERT`, ver IIdempotencyKeyRepository).
 *     Si la reclama, deja correr el use case y al terminar completa la key
 *     con el id de la Transaction creada.
 *  3. Si ya estaba reclamada, es una request duplicada (retry del cliente,
 *     doble click, o una carrera exacta con otra request concurrente).
 *     Espera (poll acotado) a que la request original termine y devuelve
 *     su misma Transaction — nunca ejecuta el use case dos veces. Si pasan
 *     más de MAX_WAIT_MS sin que la original termine, corta con 409 (el
 *     cliente puede reintentar).
 *  4. Si el use case lanza (ej. fondos insuficientes), libera la key
 *     reclamada — si no, un retry legítimo con la misma key después de
 *     corregir el problema se quedaría esperando para siempre.
 */
@Injectable()
export class IdempotencyInterceptor implements NestInterceptor {
  private static readonly POLL_INTERVAL_MS = 100;

  // RN-02 (Sesión 6) cambió el cálculo de este valor — dejar la nota
  // completa acá porque es exactamente el tipo de cosa que se
  // desincroniza en silencio si solo queda en un commit message.
  //
  // Antes de RN-02, MAX_WAIT_MS era 3000ms "porque sí" (un número redondo
  // razonable). Con el anti-fraude simulado en juego, una request original
  // puede tardar hasta ANTI_FRAUD_TIMEOUT_MS (3000ms) SOLO en el chequeo
  // anti-fraude antes de seguir (o abortar) — con la ventana vieja de
  // 3000ms, una request que aprobara el anti-fraude justo antes del límite
  // ya no tendría NADA de margen para el resto del pipeline (locks +
  // updates + insert), y la request que está esperando (poll) cortaría con
  // 409 de forma prematura aunque la original fuera a terminar bien un
  // instante después. La ventana tiene que cubrir el peor caso END-TO-END
  // de una request que SÍ va a terminar con éxito, no solo el timeout del
  // anti-fraude en aislamiento:
  //
  //   MAX_WAIT_MS = ANTI_FRAUD_TIMEOUT_MS (3000ms, tope del chequeo anti-fraude)
  //               + TRANSACTIONAL_SAFETY_MARGIN_MS (2000ms, ver arriba)
  //               = 5000ms
  private static readonly MAX_WAIT_MS = ANTI_FRAUD_TIMEOUT_MS + TRANSACTIONAL_SAFETY_MARGIN_MS;

  constructor(
    @Inject(IDEMPOTENCY_KEY_REPOSITORY) private readonly idempotencyKeyRepository: IIdempotencyKeyRepository,
    @Inject(TRANSACTION_REPOSITORY) private readonly transactionRepository: ITransactionRepository,
  ) {}

  async intercept(context: ExecutionContext, next: CallHandler): Promise<Observable<unknown>> {
    const request = context.switchToHttp().getRequest<Request>();
    const key = request.headers[HEADER_NAME];

    if (typeof key !== 'string' || key.trim().length === 0) {
      throw new BadRequestException(`El header X-Idempotency-Key es requerido`);
    }

    const claimed = await this.idempotencyKeyRepository.claim(key);
    if (!claimed) {
      const cached = await this.waitForCachedTransaction(key);
      return of(cached);
    }

    return next.handle().pipe(
      mergeMap(async (transaction: Transaction) => {
        await this.idempotencyKeyRepository.complete(key, transaction.id);
        return transaction;
      }),
      catchError((error: unknown) => this.releaseAndRethrow(key, error)),
    );
  }

  private async waitForCachedTransaction(key: string): Promise<Transaction> {
    const deadline = Date.now() + IdempotencyInterceptor.MAX_WAIT_MS;

    while (Date.now() < deadline) {
      const transactionId = await this.idempotencyKeyRepository.findTransactionId(key);
      if (transactionId) {
        const transaction = await this.transactionRepository.findById(transactionId);
        if (transaction) return transaction;
      }
      await this.sleep(IdempotencyInterceptor.POLL_INTERVAL_MS);
    }

    throw new ConflictException(
      'Ya hay una transferencia en curso con esta X-Idempotency-Key. Reintenta en unos segundos.',
    );
  }

  private releaseAndRethrow(key: string, error: unknown): Observable<never> {
    return from(
      this.idempotencyKeyRepository.release(key).then(() => {
        throw error;
      }),
    );
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
