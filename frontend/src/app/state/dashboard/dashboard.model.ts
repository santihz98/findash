import { AccountType } from '../accounts/accounts.model';

/**
 * Contrato real de `GET /dashboard/kpis` y `GET /dashboard/volume-by-account-type`
 * (verificado contra `/api/docs-json` del backend real y contra un curl
 * real con el token de `admin@findash.dev` — mismo criterio que toda
 * sesión anterior). El propio Swagger del backend documenta que ambos
 * responden "en cero"/array vacío cuando todavía no hay transacciones —
 * **nunca un error** — así que el frontend no necesita distinguir "sin
 * datos todavía" de "el endpoint está roto" a partir del shape de una
 * respuesta 200 exitosa: un 200 siempre es una forma válida, incluida la
 * vacía.
 */
export interface DashboardKpis {
  totalVolumeTransacted: string;
  failedOrRejectedCount: number;
}

/**
 * Un `AccountType` sin ninguna transacción COMPLETED como origen está
 * AUSENTE del array — decisión ya tomada del lado del backend (ver
 * `PROGRESS.md` Sesión 7 del backend: evitar enumerar los 3 tipos a mano
 * para no acoplar la query a la lista actual de `AccountType`, mismo
 * espíritu Open/Closed que la Strategy+Factory de comisiones). El
 * frontend sigue el mismo criterio y NUNCA completa el hueco con
 * `totalVolume: '0.00'` — ver el comentario en `volume-chart.component.ts`
 * para el detalle completo de por qué.
 */
export interface AccountTypeVolume {
  accountType: AccountType;
  totalVolume: string;
}

/**
 * Dos sub-recursos independientes en un solo slice (no dos slices
 * separados): son la misma pantalla, se piden juntos al entrar, pero cada
 * uno tiene su propio ciclo de loading/loaded/error — si uno falla, el
 * otro debe poder seguir mostrando sus datos con normalidad (ver
 * `dashboard.actions.ts` para la justificación completa de mantenerlos
 * como acciones separadas). Mismo criterio de "loaded" que el resto del
 * proyecto (`AccountsState`, `MyAccountState`, ...): distingue loading
 * inicial de refetch.
 */
export interface DashboardState {
  kpis: DashboardKpis | null;
  kpisLoading: boolean;
  kpisLoaded: boolean;
  kpisError: string | null;

  volumeByAccountType: AccountTypeVolume[];
  volumeLoading: boolean;
  volumeLoaded: boolean;
  volumeError: string | null;
}

export const initialDashboardState: DashboardState = {
  kpis: null,
  kpisLoading: false,
  kpisLoaded: false,
  kpisError: null,
  volumeByAccountType: [],
  volumeLoading: false,
  volumeLoaded: false,
  volumeError: null,
};
