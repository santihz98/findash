/**
 * Contrato real de GET /transactions (verificado contra /api/docs-json del
 * backend desplegado — reconstruido localmente y re-verificado en la
 * Sesión 27 tras el enriquecimiento de la Sesión 26 — y contra un curl real
 * con el token de admin@findash.dev). A diferencia de `MyTransaction`
 * (`state/myTransactions/`), no trae `direction` — no está scopeado a
 * ninguna cuenta, es la vista de auditoría completa de la plataforma.
 *
 * `originAccount` (SIEMPRE presente, `originAccountId` es NOT NULL) y
 * `destAccount` (`null` en el mismo criterio ya establecido desde la
 * Sesión 6.5 para filas REJECTED/FAILED sin destino confirmado), cada uno
 * con `accountNumber`/`accountType` Y los datos del titular
 * (`ownerEmail`/`ownerDocumentNumber`) — el ADMIN ya tiene acceso a esos
 * mismos datos vía `GET /accounts`, esto solo los une en un solo request.
 * `TransactionAccountInfoWithOwner` es DISTINTO del `TransactionAccountInfo`
 * que usa `state/myTransactions/` (sin titular) — objeto anidado por
 * cuenta, no campos sueltos con prefijo (ver PROGRESS.md Sesión 26).
 *
 * `TransactionStatus`/`TransactionAccountInfo*` duplicados a propósito
 * respecto a `state/myTransactions/my-transactions.model.ts` — ver el
 * comentario en ese archivo para la justificación (mismo criterio que el
 * backend usó para `PaginationQueryDto` en su Sesión 17: no acoplar dos
 * features por un puñado de valores compartidos).
 */
export type TransactionStatus = 'COMPLETED' | 'REJECTED' | 'FAILED';
export type AccountType = 'BASIC' | 'PREMIUM' | 'CORPORATE';

export interface TransactionAccountInfo {
  accountNumber: string;
  accountType: AccountType;
}

export interface TransactionAccountInfoWithOwner extends TransactionAccountInfo {
  ownerEmail: string;
  ownerDocumentNumber: string;
}

export interface AuditTransaction {
  id: string;
  originAccountId: string;
  destAccountId: string | null;
  amount: string;
  commission: string | null;
  authorizationCode: string | null;
  status: TransactionStatus;
  createdAt: string;
  originAccount: TransactionAccountInfoWithOwner;
  destAccount: TransactionAccountInfoWithOwner | null;
}

export interface ListTransactionsAuditQuery {
  page: number;
  limit: number;
  status?: TransactionStatus;
  /**
   * ISO 8601 (fecha o datetime), tal cual los recibe el backend — el ajuste
   * de "fin de día" para `dateTo` (ver ARCHITECTURE.md/PROGRESS.md Sesión
   * 18 del frontend) ya se aplicó ANTES de llegar acá, en
   * `TransactionsAuditPage.parseQuery()`. Este tipo/servicio no conocen esa
   * regla — solo mandan lo que reciben, mismo criterio que
   * `AccountsService.list()` con `documentNumber`/`status`.
   */
  dateFrom?: string;
  dateTo?: string;
}

export interface ListTransactionsAuditResult {
  data: AuditTransaction[];
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export const DEFAULT_TRANSACTIONS_AUDIT_QUERY: ListTransactionsAuditQuery = { page: 1, limit: 20 };

export interface TransactionsAuditState {
  transactions: AuditTransaction[];
  page: number;
  limit: number;
  total: number;
  totalPages: number;
  query: ListTransactionsAuditQuery;
  loading: boolean;
  loaded: boolean;
  error: string | null;
}

export const initialTransactionsAuditState: TransactionsAuditState = {
  transactions: [],
  page: 1,
  limit: 20,
  total: 0,
  totalPages: 0,
  query: DEFAULT_TRANSACTIONS_AUDIT_QUERY,
  loading: false,
  loaded: false,
  error: null,
};
