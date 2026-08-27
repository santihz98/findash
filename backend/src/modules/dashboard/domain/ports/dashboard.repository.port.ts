import { AccountType } from '@prisma/client';

/**
 * RF-07. `totalVolumeTransacted` ya viene formateado a 2 decimales fijos
 * (`.toFixed(2)`, mismo criterio que `Account.balance`/`Transaction.amount`
 * en el resto del proyecto) — nunca un `number` ni un `Prisma.Decimal`
 * crudo cruzando el límite de infraestructura.
 *
 * Decisión (PROGRESS.md Sesión 7): `totalVolumeTransacted` suma únicamente
 * `amount` de transacciones COMPLETED — el dinero que efectivamente se
 * movió. Sumar también REJECTED/FAILED sería engañoso para un ADMIN
 * mirando el dashboard: esas transferencias nunca tocaron un balance real
 * (RF-07 pide "volumen transaccionado", no "volumen intentado").
 * `failedOrRejectedCount` es la contraparte — cuenta ambos status juntos
 * (REJECTED + FAILED) en un solo número, tal como lo pide RF-07 ("cantidad
 * de transacciones fallidas/rechazadas"); no había necesidad de negocio de
 * separarlos en dos campos.
 */
export interface DashboardKpis {
  totalVolumeTransacted: string;
  failedOrRejectedCount: number;
}

/**
 * RF-08. Un elemento por cada `AccountType` que tenga al menos una
 * transacción COMPLETED como origen — mismo criterio que `DashboardKpis`
 * (solo COMPLETED, ver PROGRESS.md Sesión 7): un tipo de cuenta sin
 * transferencias completadas simplemente no aparece en el array, en vez de
 * aparecer con `totalVolume: '0.00'`. `totalVolume` ya viene formateado a 2
 * decimales, listo para graficar sin transformación adicional.
 */
export interface AccountTypeVolume {
  accountType: AccountType;
  totalVolume: string;
}

export interface IDashboardRepository {
  getKpis(): Promise<DashboardKpis>;
  getVolumeByAccountType(): Promise<AccountTypeVolume[]>;
}

export const DASHBOARD_REPOSITORY = Symbol('DASHBOARD_REPOSITORY');
