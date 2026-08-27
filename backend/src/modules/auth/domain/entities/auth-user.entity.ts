import { Role } from '@prisma/client';

/**
 * Representación de dominio de un usuario autenticable. Deliberadamente NO
 * es el tipo `User` que genera Prisma (ARCHITECTURE.md sección 3: "El
 * dominio nunca importa nada de... Prisma") — es un shape propio, mapeado
 * desde la fila de Postgres en la capa de infraestructura
 * (`PrismaUserRepository`).
 *
 * Única excepción: el enum `Role`. Es un value type puro (equivalente a
 * `'ADMIN' | 'CLIENT'`), no acopla el dominio a PrismaClient ni a ninguna
 * máquina de infraestructura, así que reusarlo no viola el espíritu de la
 * regla — evita mantener un enum duplicado que se puede desincronizar del
 * schema.
 */
export interface AuthUser {
  id: string;
  email: string;
  documentNumber: string;
  passwordHash: string;
  role: Role;
}
