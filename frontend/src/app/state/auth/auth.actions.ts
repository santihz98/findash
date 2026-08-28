import { createActionGroup, emptyProps, props } from '@ngrx/store';

import { CurrentUser } from './auth.model';

/**
 * `refreshToken`/`restoreSession` se piden como una única acción en la
 * tarea, pero el reducer y los effects necesitan distinguir el intento del
 * resultado (éxito/fallo) — mismo criterio que el backend usa para sus
 * excepciones de dominio: cada resultado posible es explícito, no un
 * booleano genérico. Documentado en PROGRESS.md.
 */
export const authActions = createActionGroup({
  source: 'Auth',
  events: {
    Login: props<{ email: string; password: string }>(),
    'Login Success': props<{ user: CurrentUser; accessToken: string; refreshToken: string }>(),
    'Login Failure': props<{ error: string }>(),
    Logout: emptyProps(),

    'Refresh Token': emptyProps(),
    'Refresh Token Success': props<{ accessToken: string }>(),
    'Refresh Token Failure': emptyProps(),

    'Restore Session': emptyProps(),
    'Restore Session Success': props<{
      user: CurrentUser;
      accessToken: string;
      refreshToken: string;
    }>(),
    'Restore Session Failure': emptyProps(),
  },
});
