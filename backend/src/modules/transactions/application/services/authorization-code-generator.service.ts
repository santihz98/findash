import { Injectable } from '@nestjs/common';
import { randomBytes } from 'crypto';

/**
 * Código de autorización: 12 caracteres hexadecimales en mayúscula
 * (`crypto.randomBytes(6)` → 48 bits de entropía), ej. "3F9A2B7C1D4E".
 * Se eligió por sobre un UUID completo (36 caracteres) porque es lo que un
 * usuario ve/copia/dicta como comprobante de una transferencia — más corto
 * y sin guiones. 48 bits de entropía son más que suficientes para que una
 * colisión sea estadísticamente irrelevante a la escala de este proyecto, y
 * de todos modos `transactions.authorization_code` tiene su propio UNIQUE
 * constraint como red de seguridad (ver prisma/schema.prisma).
 */
@Injectable()
export class AuthorizationCodeGeneratorService {
  generate(): string {
    return randomBytes(6).toString('hex').toUpperCase();
  }
}
