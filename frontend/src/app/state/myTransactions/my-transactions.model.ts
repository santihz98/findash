/**
 * Contrato real de GET /transactions/me (verificado contra /api/docs-json
 * del backend desplegado — reconstruido localmente y re-verificado en la
 * Sesión 27 tras el enriquecimiento de la Sesión 26 — y contra un curl real
 * con el token de basic@findash.dev, mismo criterio que el resto de los
 * `state/*.model.ts` de este proyecto). `direction` es relativo a la cuenta
 * del usuario autenticado, calculado por el backend, nunca persistido —
 * 'SENT' si la cuenta es el origen, 'RECEIVED' si es el destino. `status`
 * incluye REJECTED/FAILED (no solo COMPLETED): el CLIENT ve también sus
 * intentos fallidos, y en ese caso `destAccountId`/`commission`/
 * `authorizationCode` pueden venir `null` (ver backend, Sesión 6.5).
 *
 * `counterpartyAccount` (Sesión 26 del backend): la cuenta que NO es la
 * propia — `accountNumber`/`accountType` únicamente, `null` cuando esa
 * cuenta no está confirmada (mismo criterio que `destAccountId` desde la
 * Sesión 6.5). Deliberadamente SIN `ownerEmail`/`ownerDocumentNumber` — un
 * CLIENT puede saber CON QUÉ TIPO de cuenta operó, nunca QUIÉN es la
 * persona detrás (mismo criterio de privacidad que `GET /accounts/lookup`,
 * Sesión 19). `TransactionAccountInfo` es un tipo estructuralmente distinto
 * del que usa `state/transactionsAudit/` (que sí trae el titular) — nunca
 * el mismo tipo con campos opcionales que un cambio futuro pudiera
 * completar por descuido.
 *
 * `TransactionStatus`/`TransactionAccountInfo` se definen ACÁ (no en
 * `state/transactionsAudit/`) y no se comparten entre ambos módulos por
 * import — mismo criterio que el backend usó en su propia Sesión 17 para
 * `PaginationQueryDto`: no cruzar la capa de un módulo hacia la de otro por
 * un puñado de valores compartidos.
 */
export type TransactionStatus = 'COMPLETED' | 'REJECTED' | 'FAILED';
export type TransactionDirection = 'SENT' | 'RECEIVED';
export type AccountType = 'BASIC' | 'PREMIUM' | 'CORPORATE';

export interface TransactionAccountInfo {
  accountNumber: string;
  accountType: AccountType;
}

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
  counterpartyAccount: TransactionAccountInfo | null;
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
