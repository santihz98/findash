/**
 * Contrato real de GET /accounts (verificado contra /api/docs-json del
 * backend desplegado y con un curl real con el token de admin@findash.dev
 * — no asumido de ARCHITECTURE.md a ciegas, mismo criterio que Sesión 13
 * con /auth). `avatarUrl` es `null` explícito cuando no hay avatar, nunca
 * una URL rota — RF-04 depende de que este contrato se respete tal cual.
 */
export type AccountType = 'BASIC' | 'PREMIUM' | 'CORPORATE';
export type AccountStatus = 'ACTIVE' | 'BLOCKED';

export interface Account {
  id: string;
  accountNumber: string;
  balance: string;
  accountType: AccountType;
  status: AccountStatus;
  avatarUrl: string | null;
  documentNumber: string;
  email: string;
}

export interface ListAccountsQuery {
  page: number;
  limit: number;
  documentNumber?: string;
  status?: AccountStatus;
}

export interface ListAccountsResult {
  data: Account[];
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export const DEFAULT_ACCOUNTS_QUERY: ListAccountsQuery = { page: 1, limit: 20 };

export interface AccountsState {
  accounts: Account[];
  page: number;
  limit: number;
  total: number;
  totalPages: number;
  query: ListAccountsQuery;
  loading: boolean;
  /**
   * true una vez que la primera carga terminó (éxito o error) — permite
   * distinguir "loading inicial" (`loading && !loaded`, tabla vacía todavía,
   * se muestra el skeleton completo) de "loading de refetch" (`loading &&
   * loaded`, ya hay datos previos en pantalla — ver la decisión de UX en
   * PROGRESS.md sobre no limpiar la tabla mientras se refresca).
   */
  loaded: boolean;
  error: string | null;
}

export const initialAccountsState: AccountsState = {
  accounts: [],
  page: 1,
  limit: 20,
  total: 0,
  totalPages: 0,
  query: DEFAULT_ACCOUNTS_QUERY,
  loading: false,
  loaded: false,
  error: null,
};
