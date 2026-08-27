/**
 * Handle opaco para "la transacción de DB en curso". Los puertos de dominio
 * (IAccountRepository, ITransactionRepository, ...) lo reciben y lo pasan
 * de un método a otro sin saber qué es en realidad — solo la capa de
 * infraestructura (PrismaAccountRepository, PrismaTransactionRepository)
 * sabe que por debajo es un Prisma.TransactionClient. Así el dominio sigue
 * sin importar nada de Prisma para esto (mismo criterio que ya se usa para
 * los enums de Prisma — ver AuthUser/Account — pero acá se evita del todo,
 * no hace falta ni la excepción).
 */
export type TransactionContext = unknown;
