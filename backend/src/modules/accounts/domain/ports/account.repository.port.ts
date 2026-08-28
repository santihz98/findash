import { AccountStatus, Prisma } from '@prisma/client';
import { Account, AccountLookupResult, AccountWithOwner } from '../entities/account.entity';
import { TransactionContext } from '../../../../shared/database/transaction-context';

export interface ListAccountsFilter {
  page: number;
  limit: number;
  /** Prefijo de User.documentNumber (RF-03) — ver justificación de por qué
   * prefijo y no substring en PROGRESS.md / prisma-account.repository.ts. */
  documentNumber?: string;
  status?: AccountStatus;
}

export interface ListAccountsResult {
  data: AccountWithOwner[];
  total: number;
}

export interface IAccountRepository {
  findManyWithOwner(filter: ListAccountsFilter): Promise<ListAccountsResult>;
  findManyByUserId(userId: string): Promise<Account[]>;

  // Agregados en la Sesión 4 para CreateTransferUseCase (modules/transactions).
  // `trx` opcional: si viene, participan de la transacción de Prisma en
  // curso (ver TransactionContext); si no, corren sueltos (ej. Sesión 3
  // nunca los necesitó fuera de una transacción).
  findById(id: string, trx?: TransactionContext): Promise<Account | null>;
  /** `newBalance` ya viene calculado en Decimal por el use case — este
   * método solo persiste, no hace ninguna cuenta. */
  updateBalance(id: string, newBalance: Prisma.Decimal, trx?: TransactionContext): Promise<void>;

  /**
   * RNF-01 (Sesión 5) — `SELECT ... FOR UPDATE`: toma un lock de fila
   * exclusivo sobre la cuenta hasta que la transacción de Prisma que la
   * llama termina (commit o rollback). Un `SELECT` normal (`findById`) no
   * bloquea nada — dos transferencias concurrentes podrían leer el mismo
   * balance "viejo" y las dos calcular que hay fondos suficientes, cuando
   * en realidad solo alcanza para una (double-spend). `trx` es
   * **obligatorio** acá (no opcional como en `findById`): un `FOR UPDATE`
   * fuera de una transacción explícita no tiene ningún efecto — Postgres
   * libera el lock apenas termina el `SELECT` mismo, así que llamarlo sin
   * `trx` sería un bug silencioso, no una opción legítima.
   *
   * Método separado en vez de `findById(id, { forUpdate: true })`: un
   * booleano es fácil de omitir por descuido en un call site nuevo (bug
   * silencioso — sigue compilando, sigue "funcionando", solo que sin el
   * lock). Un nombre de método distinto obliga a elegir conscientemente, y
   * además refleja en la firma que `trx` deja de ser opcional.
   */
  findByIdForUpdate(id: string, trx: TransactionContext): Promise<Account | null>;

  /**
   * RF-02 (Sesión 18) — resuelve `accountNumber` (lo único que un CLIENT ve
   * de una cuenta ajena) a `id` (UUID, lo que pide `destAccountId` en
   * `POST /transactions/transfer`). El SELECT en la implementación de
   * Prisma trae explícitamente solo estas 3 columnas — ni siquiera carga
   * `balance`/`userId` a memoria de la aplicación, defensa en profundidad
   * más allá de que el controller tampoco las devolvería.
   */
  findByAccountNumber(accountNumber: string): Promise<AccountLookupResult | null>;
}

export const ACCOUNT_REPOSITORY = Symbol('ACCOUNT_REPOSITORY');
