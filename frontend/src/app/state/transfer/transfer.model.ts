/**
 * Contrato real de POST /transactions/transfer (verificado contra
 * /api/docs-json y curl real contra el backend local con
 * basic@findash.dev — 201 obtenido en el primer intento real, ver
 * PROGRESS.md). `status` siempre es 'COMPLETED' en un 201 — las otras
 * variantes de `TransactionStatus` (REJECTED/FAILED, backend Sesión 6.5)
 * nunca llegan al frontend como cuerpo de una respuesta 2xx: cualquier
 * intento que termina en REJECTED/FAILED del lado del backend se refleja
 * acá como un error HTTP (422/404/504), nunca como un 201 con otro status.
 */
export interface TransferResult {
  id: string;
  originAccountId: string;
  destAccountId: string;
  amount: string;
  commission: string;
  authorizationCode: string;
  status: 'COMPLETED';
  createdAt: string;
}

export interface TransferState {
  submitting: boolean;
  result: TransferResult | null;
  /**
   * `status`/`message` separados (no un solo objeto `error`) para que el
   * reducer pueda declarar cada campo con `on()` sin desestructurar dos
   * veces — mismo nivel de explicitud que el resto del estado de este
   * proyecto (ej. `AccountsState`, sin un campo `error` genérico que
   * mezcle forma).
   */
  errorStatus: number | null;
  errorMessage: string | null;
}

export const initialTransferState: TransferState = {
  submitting: false,
  result: null,
  errorStatus: null,
  errorMessage: null,
};
