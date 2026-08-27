import { registerDecorator, ValidationArguments, ValidationOptions } from 'class-validator';
import { Prisma } from '@prisma/client';

// Como mucho 2 decimales (Decimal(14,2), ver prisma/schema.prisma) y al
// menos un dígito entero — sin signo, así que ya excluye negativos.
const DECIMAL_STRING_SHAPE = /^\d+(\.\d{1,2})?$/;

/**
 * Valida que `amount` llegue como string (no number: un `number` de JS ya
 * habría perdido precisión antes de que este validador lo vea) con forma de
 * monto positivo y hasta 2 decimales — rechaza "0", "0.00", negativos,
 * `NaN`, más de 2 decimales, y cualquier cosa que no sea un decimal bien
 * formado.
 */
export function IsPositiveDecimalString(validationOptions?: ValidationOptions) {
  return function (object: object, propertyName: string) {
    registerDecorator({
      name: 'isPositiveDecimalString',
      target: object.constructor,
      propertyName,
      options: validationOptions,
      validator: {
        validate(value: unknown): boolean {
          if (typeof value !== 'string' || !DECIMAL_STRING_SHAPE.test(value)) {
            return false;
          }
          try {
            return new Prisma.Decimal(value).greaterThan(0);
          } catch {
            return false;
          }
        },
        defaultMessage(args: ValidationArguments): string {
          return `${args.property} debe ser un monto positivo con hasta 2 decimales (ej. "100.50")`;
        },
      },
    });
  };
}
