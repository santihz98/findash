import { TransactionStatus } from '@prisma/client';

/**
 * Igual que Account en modules/accounts: shape propio (no el `Transaction`
 * de Prisma), `amount`/`commission` como string ya formateado a 2
 * decimales fijos (`.toFixed(2)` en la capa de infraestructura) — mismo
 * criterio que `balance` desde la Sesión 3, para no repetir el bug de
 * `Decimal.toString()` recortando ceros ("1000" en vez de "1000.00").
 *
 * `destAccountId`/`commission` nullable desde la Sesión 6.5 (RF-07,
 * auditoría de transferencias REJECTED/FAILED) — ver la clasificación de
 * excepciones en CreateTransferUseCase y PROGRESS.md para qué queda NULL
 * en cada caso y por qué.
 */
export interface Transaction {
  id: string;
  originAccountId: string;
  destAccountId: string | null;
  amount: string;
  commission: string | null;
  authorizationCode: string | null;
  status: TransactionStatus;
  createdAt: Date;
}

/**
 * RF-02 (GET /transactions/me, historial de movimientos) — dirección
 * relativa a la cuenta consultada, no un atributo propio de la fila: la
 * misma `Transaction` sería 'SENT' para quien la mira desde su cuenta
 * origen y 'RECEIVED' para quien la mira desde su cuenta destino. Se
 * calcula en el repositorio (compara `originAccountId` contra la cuenta
 * consultada), nunca se persiste.
 */
export type TransactionDirection = 'SENT' | 'RECEIVED';

export interface TransactionWithDirection extends Transaction {
  direction: TransactionDirection;
}
