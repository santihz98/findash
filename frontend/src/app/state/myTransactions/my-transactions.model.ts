/**
 * Contrato real de GET /transactions/me (verificado contra /api/docs-json
 * del backend desplegado y contra un curl real con el token de
 * basic@findash.dev — mismo criterio que el resto de los `state/*.model.ts`
 * de este proyecto). `direction` es relativo a la cuenta del usuario
 * autenticado, calculado por el backend, nunca persistido — 'SENT' si la
 * cuenta es el origen, 'RECEIVED' si es el destino. `status` incluye
 * REJECTED/FAILED (no solo COMPLETED): el CLIENT ve también sus intentos
 * fallidos, y en ese caso `destAccountId`/`commission`/`authorizationCode`
 * pueden venir `null` (ver backend, Sesión 6.5).
 *
 * `TransactionStatus` se define ACÁ (no en `state/transactionsAudit/`) y no
 * se comparte entre ambos módulos por import — es un alias de 3 strings,
 * duplicarlo es más barato que acoplar dos features que, aparte de este
 * enum, no comparten nada (mismo criterio que el backend usó en su propia
 * Sesión 17 para `PaginationQueryDto`: no cruzar la capa de un módulo hacia
 * la de otro por un puñado de valores).
 */
export type TransactionStatus = 'COMPLETED' | 'REJECTED' | 'FAILED';
export type TransactionDirection = 'SENT' | 'RECEIVED';

export interface MyTransaction {
  id: string;
  originAccountId: string;
  destAccountId: string | null;
  amount: string;
  commission: string | null;
  authorizationCode: string | null;
  status: TransactionStatus;
  createdAt: string;
  direction: TransactionDirection;
}

export interface ListMyTransactionsQuery {
  page: number;
  limit: number;
}

export interface ListMyTransactionsResult {
  data: MyTransaction[];
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export const DEFAULT_MY_TRANSACTIONS_QUERY: ListMyTransactionsQuery = { page: 1, limit: 20 };

/**
 * Mismo shape de estado que `AccountsState`/`MyAccountState` (paginación +
 * 3 estados de UX vía `loading`/`loaded`, ver `selectIsInitialLoading`/
 * `selectIsRefetching` en el reducer) — un CLIENT puede tener 0 cuentas
 * (422, `NoOriginAccountException` reutilizada del backend) o fallos de
 * red, y ambos casos deben pasar por el mismo camino de `error` genérico,
 * sin una rama especial: la página no necesita saber POR QUÉ falló para
 * mostrar el banner con retry.
 */
export interface MyTransactionsState {
  transactions: MyTransaction[];
  page: number;
  limit: number;
  total: number;
  totalPages: number;
  query: ListMyTransactionsQuery;
  loading: boolean;
  loaded: boolean;
  error: string | null;
}

export const initialMyTransactionsState: MyTransactionsState = {
  transactions: [],
  page: 1,
  limit: 20,
  total: 0,
  totalPages: 0,
  query: DEFAULT_MY_TRANSACTIONS_QUERY,
  loading: false,
  loaded: false,
  error: null,
};
