import { createFeature, createReducer, on } from '@ngrx/store';

import { transferActions } from './transfer.actions';
import { initialTransferState } from './transfer.model';

/**
 * `destAccountId`/`amount` NUNCA vivieron en este slice de estado — son
 * valores de un formulario reactivo (`TransferFormPage`, no el Store), así
 * que "no limpiarlos en `transferFailure`" (tarea 8) no es responsabilidad
 * de este reducer: es, estructuralmente, que el componente nunca resetea
 * el `FormGroup` salvo en éxito. Probado explícitamente en
 * `transfer-form.page.spec.ts`, no acá — este reducer no tiene ese dato
 * para poder perderlo.
 */
const reducer = createReducer(
  initialTransferState,

  on(transferActions.submitTransfer, (state) => ({
    ...state,
    submitting: true,
    result: null,
    errorStatus: null,
    errorMessage: null,
  })),

  on(transferActions.transferSuccess, (state, { result }) => ({
    ...state,
    submitting: false,
    result,
    errorStatus: null,
    errorMessage: null,
  })),

  on(transferActions.transferFailure, (state, { status, message }) => ({
    ...state,
    submitting: false,
    result: null,
    errorStatus: status,
    errorMessage: message,
  })),
);

export const transferFeature = createFeature({
  name: 'transfer',
  reducer,
});

export const {
  name: transferFeatureKey,
  reducer: transferReducer,
  selectSubmitting: selectTransferSubmitting,
  selectResult: selectTransferResult,
  selectErrorStatus: selectTransferErrorStatus,
  selectErrorMessage: selectTransferErrorMessage,
} = transferFeature;
