import { AccountStatus, AccountType } from '../accounts/accounts.model';

/**
 * Contrato real de GET /accounts/me (verificado contra /api/docs-json del
 * backend real y un curl real con token de basic@findash.dev, mismo
 * criterio que Sesiones 13/14): devuelve un ARRAY de cuentas propias, no
 * un objeto único — aunque `CreateTransferUseCase` (backend, Sesión 4)
 * asume que cada CLIENT tiene exactamente una cuenta (0 o >1 rechazan la
 * transferencia con 422/`NoOriginAccountException`). Se sigue el mismo
 * criterio acá: se toma la primera cuenta del array como "la" cuenta del
 * usuario — `null` si el array viene vacío (confirmado con curl real: un
 * ADMIN, que no tiene cuentas propias, recibe `[]`).
 *
 * A diferencia de `Account` (listado admin, `state/accounts/`), esta forma
 * NO trae `documentNumber`/`email` — el endpoint no los expone (confirmado
 * contra el JSON real devuelto por `/accounts/me`), así que es un tipo
 * propio, no una reutilización de `Account`. Sí reutiliza `AccountType`/
 * `AccountStatus` de `state/accounts/accounts.model.ts` — son el mismo
 * enum del backend en ambos casos.
 */
export interface MyAccount {
  id: string;
  accountNumber: string;
  balance: string;
  accountType: AccountType;
  status: AccountStatus;
  avatarUrl: string | null;
}

export interface MyAccountState {
  account: MyAccount | null;
  loading: boolean;
  /**
   * true una vez que la primera carga terminó (éxito o error) — mismo
   * criterio que `AccountsState.loaded` (Sesión 14): permite distinguir
   * loading inicial (`loading && !loaded`, skeleton de página completa) de
   * refetch (`loading && loaded`, el saldo viejo sigue visible mientras se
   * refresca — ver transfer-form.page.ts, que despacha `loadMyAccount` de
   * nuevo tras cada transferencia exitosa).
   */
  loaded: boolean;
  error: string | null;
}

export const initialMyAccountState: MyAccountState = {
  account: null,
  loading: false,
  loaded: false,
  error: null,
};
