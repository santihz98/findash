/**
 * Contrato real de GET /transactions (verificado contra /api/docs-json del
 * backend desplegado y contra un curl real con el token de
 * admin@findash.dev). A diferencia de `MyTransaction`
 * (`state/myTransactions/`), no trae `direction` — no está scopeado a
 * ninguna cuenta, es la vista de auditoría completa de la plataforma.
 *
 * `TransactionStatus` duplicado a propósito respecto a
 * `state/myTransactions/my-transactions.model.ts` — ver el comentario en
 * ese archivo para la justificación (mismo criterio que el backend usó
 * para `PaginationQueryDto` en su Sesión 17: no acoplar dos features por
 * un alias de 3 valores).
 */
export type TransactionStatus = 'COMPLETED' | 'REJECTED' | 'FAILED';

export interface AuditTransaction {
  id: string;
  originAccountId: string;
  destAccountId: string | null;
  amount: string;
  commission: string | null;
  authorizationCode: string | null;
  status: TransactionStatus;
  createdAt: string;
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
