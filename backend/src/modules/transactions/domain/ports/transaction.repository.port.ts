import { Prisma, TransactionStatus } from '@prisma/client';
import { Transaction } from '../entities/transaction.entity';
import { TransactionContext } from '../../../../shared/database/transaction-context';

export interface CreateTransactionData {
  originAccountId: string;
  /** Sesión 6.5 — `null` cuando la cuenta destino no se confirmó como
   * existente antes de que la fila de auditoría se persista (ver
   * `destAccountId` en `schema.prisma` y la clasificación en
   * `CreateTransferUseCase`). Nunca se guarda un id "crudo" del request sin
   * verificar — el FK de la columna no lo permitiría de todos modos. */
  destAccountId: string | null;
  amount: Prisma.Decimal;
  /** Sesión 6.5 — `null` cuando la excepción ocurre antes de resolver la
   * Strategy de comisión (RN-03), que necesita la cuenta destino ya
   * confirmada. */
  commission: Prisma.Decimal | null;
  authorizationCode: string | null;
  /** RN-01 — la key real de `X-Idempotency-Key` **solo** en filas
   * COMPLETED. Sesión 6.5: las filas REJECTED/FAILED siempre pasan `null`
   * acá (nunca el valor real del header) — ver el comentario extenso sobre
   * el conflicto de UNIQUE en `schema.prisma`. */
  idempotencyKey: string | null;
  status: TransactionStatus;
}

export interface ITransactionRepository {
  /**
   * Abre una transacción de Prisma y ejecuta `fn` dentro — mismo patrón que
   * el `CreateTransferUseCase` de ARCHITECTURE.md 3.2
   * (`txRepo.runInTransaction(async (trx) => {...})`). El `trx` que recibe
   * `fn` se pasa tal cual a los demás métodos de este repo y a
   * `IAccountRepository.findById`/`updateBalance` para que todas las
   * lecturas/escrituras participen de la misma transacción atómica.
   *
   * RNF-01 (Sesión 5): dentro de `fn`, el use case bloquea ambas cuentas
   * con `IAccountRepository.findByIdForUpdate` (`SELECT ... FOR UPDATE`),
   * siempre en el mismo orden determinístico por `id` — ver
   * CreateTransferUseCase para el detalle de por qué ese orden es lo que
   * evita deadlocks entre transferencias cruzadas concurrentes.
   */
  runInTransaction<T>(fn: (trx: TransactionContext) => Promise<T>): Promise<T>;

  /**
   * `trx` es opcional desde la Sesión 6.5: cuando viene, el INSERT participa
   * de la transacción de Prisma en curso (caso COMPLETED, o una fila
   * REJECTED persistida sin abortar el commit — ver CreateTransferUseCase,
   * tarea 5 de PROGRESS.md Sesión 6.5). Cuando se omite, es un INSERT
   * suelto fuera de cualquier transacción — el caso de las filas
   * REJECTED/FAILED que ocurren ANTES de `runInTransaction` (misma cuenta,
   * timeout de anti-fraude): un solo INSERT ya es atómico por sí mismo, no
   * hace falta envolverlo.
   */
  create(data: CreateTransactionData, trx?: TransactionContext): Promise<Transaction>;

  /** RN-01 (Sesión 5) — usado por `IdempotencyInterceptor` para devolver la
   * respuesta cacheada de una key ya completada, sin volver a ejecutar el
   * use case. Fuera de cualquier transacción a propósito: se llama después
   * de que la transferencia original ya hizo commit. */
  findById(id: string): Promise<Transaction | null>;
}

export const TRANSACTION_REPOSITORY = Symbol('TRANSACTION_REPOSITORY');
