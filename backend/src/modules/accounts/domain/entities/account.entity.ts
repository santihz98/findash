import { AccountStatus, AccountType } from '@prisma/client';

/**
 * Representación de dominio de una cuenta. No es el tipo `Account` que
 * genera Prisma (mismo criterio que `AuthUser` en modules/auth — ver ese
 * archivo para la justificación de por qué sí se reusan los enums de
 * Prisma). `balance` es `string`, no `Decimal` de Prisma ni `number`: se
 * serializa con `.toString()` en la capa de infraestructura para no perder
 * precisión ni acoplar el dominio a `decimal.js` — y porque JSON no tiene
 * tipo decimal, así que un `number` en la respuesta HTTP arriesgaría el
 * mismo problema de precisión de punto flotante que ya se evitó en el
 * schema (ver prisma/schema.prisma).
 */
export interface Account {
  id: string;
  accountNumber: string;
  balance: string;
  accountType: AccountType;
  status: AccountStatus;
  avatarUrl: string | null;
}

/**
 * Una cuenta más los datos mínimos de su titular que un admin necesita ver
 * en un listado (RF-03) — nunca `passwordHash`, ver domain/ports.
 */
export interface AccountWithOwner extends Account {
  documentNumber: string;
  email: string;
}
