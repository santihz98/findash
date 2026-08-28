import { AccountType } from '../accounts/accounts.model';

/**
 * Contrato real de GET /accounts/lookup?accountNumber=XXXX (backend Sesión
 * 19, verificado contra /api/docs-json y curl real): resuelve un
 * `accountNumber` legible al `id` (UUID) que exige `POST
 * /transactions/transfer` — deliberadamente mínimo (nunca `balance`/
 * `documentNumber`/`email`/`status`, ver ARCHITECTURE.md sección 5).
 * Cualquier rol autenticado puede resolver la cuenta de un TERCERO — es una
 * búsqueda de resolución, no un endpoint de datos.
 */
export interface AccountLookupResult {
  id: string;
  accountNumber: string;
  accountType: AccountType;
}

export interface AccountLookupState {
  /**
   * El `accountNumber` que generó el `result`/`error` actual (o que está en
   * vuelo si `loading` es `true`). Permite a `TransferFormPage` decidir si
   * la resolución en el Store sigue vigente para lo que hay tipeado AHORA
   * en el campo, sin necesidad de una acción de "limpiar" explícita: apenas
   * el usuario edita el número, `requestedAccountNumber` deja de coincidir
   * con el valor del campo y la confirmación/error viejo deja de mostrarse
   * por sí solo (ver `isLookupCurrentFor()` en el container).
   */
  requestedAccountNumber: string | null;
  result: AccountLookupResult | null;
  loading: boolean;
  error: string | null;
}

export const initialAccountLookupState: AccountLookupState = {
  requestedAccountNumber: null,
  result: null,
  loading: false,
  error: null,
};
