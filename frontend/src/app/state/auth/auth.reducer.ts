import { createFeature, createReducer, createSelector, on } from '@ngrx/store';

import { authActions } from './auth.actions';
import { initialAuthState } from './auth.model';

const reducer = createReducer(
  initialAuthState,

  on(authActions.login, (state) => ({ ...state, loading: true, error: null })),
  on(authActions.loginSuccess, (state, { user, accessToken, refreshToken }) => ({
    ...state,
    user,
    accessToken,
    refreshToken,
    loading: false,
    error: null,
    sessionRestoring: false,
  })),
  on(authActions.loginFailure, (state, { error }) => ({
    ...state,
    user: null,
    accessToken: null,
    refreshToken: null,
    loading: false,
    error,
  })),

  on(authActions.logout, () => initialAuthState),

  // No hay un estado de "loading" propio para el refresh: es una operación
  // de fondo, transparente para la UI (ver jwt.interceptor.ts) — a
  // diferencia de `login`, que sí bloquea el form con `loading`.
  on(authActions.refreshTokenSuccess, (state, { accessToken }) => ({ ...state, accessToken })),
  on(authActions.refreshTokenFailure, () => initialAuthState),

  on(authActions.restoreSession, (state) => ({ ...state, sessionRestoring: true })),
  on(authActions.restoreSessionSuccess, (state, { user, accessToken, refreshToken }) => ({
    ...state,
    user,
    accessToken,
    refreshToken,
    sessionRestoring: false,
  })),
  on(authActions.restoreSessionFailure, (state) => ({
    ...initialAuthState,
    sessionRestoring: false,
  })),
);

export const authFeature = createFeature({
  name: 'auth',
  reducer,
  extraSelectors: ({ selectUser, selectAccessToken }) => ({
    selectIsAuthenticated: createSelector(selectAccessToken, (accessToken) => !!accessToken),
    selectCurrentRole: createSelector(selectUser, (user) => user?.role ?? null),
    selectIsAdmin: createSelector(selectUser, (user) => user?.role === 'ADMIN'),
  }),
});

export const {
  name: authFeatureKey,
  reducer: authReducer,
  selectAuthState,
  selectUser: selectCurrentUser,
  selectAccessToken,
  selectRefreshToken,
  selectLoading,
  selectError,
  selectSessionRestoring,
  selectIsAuthenticated,
  selectCurrentRole,
  selectIsAdmin,
} = authFeature;
