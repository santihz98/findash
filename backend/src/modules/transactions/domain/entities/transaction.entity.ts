import { AccountType, TransactionStatus } from '@prisma/client';

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

/**
 * Sesión 26 (feedback real de uso: la tabla de auditoría del ADMIN solo
 * mostraba UUIDs truncados de origen/destino, sin forma de saber QUÉ
 * usuario ni QUÉ tipo de cuenta operó sin ir a buscarlo a mano en
 * `GET /accounts`). `accountNumber`/`accountType` de la cuenta en sí.
 */
export interface TransactionAccountInfo {
  accountNumber: string;
  accountType: AccountType;
}

/**
 * Variante con datos del titular — SOLO para `GET /transactions` (ADMIN).
 * Justificación de exponer `ownerEmail`/`ownerDocumentNumber` acá (ver
 * PROGRESS.md Sesión 26): el ADMIN ya tiene acceso a estos mismos datos vía
 * `GET /accounts` (Sesión 3, `AccountWithOwner`) — no es información nueva
 * filtrada, es la misma unida en un solo request en vez de cruzar dos.
 * Nunca usada por `GET /transactions/me` (ver `TransactionAccountInfo` a
 * secas) — mismo criterio de privacidad de `GET /accounts/lookup` (Sesión
 * 19): un CLIENT puede saber CON QUÉ TIPO de cuenta operó, nunca QUIÉN es
 * la persona detrás.
 */
export interface TransactionAccountInfoWithOwner extends TransactionAccountInfo {
  ownerEmail: string;
  ownerDocumentNumber: string;
}

/**
 * `GET /transactions` (ADMIN, auditoría) — cada fila enriquecida con
 * `originAccount` (SIEMPRE presente, `Transaction.originAccountId` es
 * NOT NULL) y `destAccount` (`null` en el mismo criterio ya establecido
 * desde la Sesión 6.5 para filas REJECTED/FAILED sin destino confirmado).
 * Objeto anidado por cuenta, no campos sueltos con prefijo (`originEmail`,
 * `destEmail`, ...) — un ADMIN auditando una fila necesita "los datos de
 * ESTA cuenta" como una unidad, no una lista plana de 8 campos que hay que
 * volver a agrupar mentalmente por prefijo.
 */
export interface TransactionWithAccounts extends Transaction {
  originAccount: TransactionAccountInfoWithOwner;
  destAccount: TransactionAccountInfoWithOwner | null;
}

/**
 * `GET /transactions/me` (CLIENT) — cada fila enriquecida con la cuenta
 * CONTRAPARTE (la que no es la propia): si `direction` es `'SENT'`, es
 * `destAccount` (puede ser `null`, ver arriba); si es `'RECEIVED'`, es
 * `originAccount` (siempre presente). Deliberadamente UN solo campo
 * `counterpartyAccount`, no `originAccount`/`destAccount` como en la
 * variante ADMIN: el CLIENT ya sabe cuál es SU propia cuenta (es el
 * contexto implícito de este endpoint) y ya tiene `direction` para saber
 * el sentido — exponer las dos cuentas por nombre lo obligaría a
 * recalcular "¿cuál de las dos soy yo?" en el frontend a partir de un id
 * que ni siquiera se muestra en pantalla. Nunca `TransactionAccountInfoWithOwner`
 * acá — mismo criterio de privacidad que `GET /accounts/lookup` (Sesión 19).
 */
export interface TransactionWithCounterparty extends TransactionWithDirection {
  counterpartyAccount: TransactionAccountInfo | null;
}
