import { createActionGroup, emptyProps, props } from '@ngrx/store';

import { AccountTypeVolume, DashboardKpis } from './dashboard.model';

/**
 * Dos pares de acciones independientes (no una única "Load Dashboard"
 * combinada) — decisión explícita, tarea 2: `GET /dashboard/kpis` y
 * `GET /dashboard/volume-by-account-type` son dos recursos separados que
 * `DashboardPage` pide en paralelo al entrar. Si uno falla, el otro tiene
 * que poder seguir mostrando sus datos con total normalidad (ej. el
 * gráfico carga bien pero el conteo de fallidas da 500 en ese momento) —
 * combinarlos en una sola acción de éxito/fallo forzaría a tratar "uno de
 * los dos falló" como "todo el dashboard falló", perdiendo la mitad de la
 * información que sí llegó bien. Es el mismo criterio de independencia
 * que ya separa `myAccount`/`transfer` en slices propios en vez de uno
 * solo "billetera" — acá ambos recursos comparten slice (son la misma
 * pantalla) pero no comparten ciclo de loading/error.
 */
export const dashboardActions = createActionGroup({
  source: 'Dashboard',
  events: {
    'Load Kpis': emptyProps(),
    'Load Kpis Success': props<{ kpis: DashboardKpis }>(),
    'Load Kpis Failure': props<{ error: string }>(),
    'Load Volume By Account Type': emptyProps(),
    'Load Volume By Account Type Success': props<{ volumeByAccountType: AccountTypeVolume[] }>(),
    'Load Volume By Account Type Failure': props<{ error: string }>(),
  },
});
