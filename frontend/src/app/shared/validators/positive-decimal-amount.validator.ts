import { AbstractControl, ValidationErrors } from '@angular/forms';

/**
 * Replica en el cliente, byte a byte, la forma que exige
 * `@IsPositiveDecimalString` en el backend
 * (`backend/src/modules/transactions/interfaces/dto/validators/is-positive-decimal-string.validator.ts`):
 * string con al menos un dígito entero, opcionalmente hasta 2 decimales,
 * sin signo (ya excluye negativos), y estrictamente mayor a cero — así
 * "0"/"0.00" también se rechazan acá, no solo del lado del servidor.
 * Mismo regex exacto, para que el feedback del formulario nunca diga "OK"
 * en un caso que el backend va a rechazar con 400 (o viceversa).
 */
const DECIMAL_STRING_SHAPE = /^\d+(\.\d{1,2})?$/;

export function positiveDecimalAmountValidator(control: AbstractControl): ValidationErrors | null {
  const value: unknown = control.value;

  if (typeof value !== 'string' || value.trim() === '') {
    // Vacío es responsabilidad de Validators.required, no de este.
    return null;
  }

  if (!DECIMAL_STRING_SHAPE.test(value) || Number(value) <= 0) {
    return { positiveDecimalAmount: true };
  }

  return null;
}
