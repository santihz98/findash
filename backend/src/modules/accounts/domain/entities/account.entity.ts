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

/**
 * Resultado de `GET /accounts/lookup` (RF-02, Sesión 18) — resuelve el
 * `accountNumber` legible que ve un CLIENT en pantalla al `id` (UUID) que
 * pide `POST /transactions/transfer` en `destAccountId`. Deliberadamente
 * NO extiende `Account`: no es un subconjunto por descarte de campos en la
 * capa de interfaces, es una forma distinta con menos datos por diseño —
 * ni `balance` ni ningún dato del titular (`documentNumber`/`email`) tienen
 * cabida acá, así que ninguna capa por encima de este tipo puede filtrarlos
 * por accidente. Ver `IAccountRepository.findByAccountNumber`.
 */
export interface AccountLookupResult {
  id: string;
  accountNumber: string;
  accountType: AccountType;
}
