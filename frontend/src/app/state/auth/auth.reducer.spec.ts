import { authActions } from './auth.actions';
import {
  authFeature,
  selectCurrentRole,
  selectCurrentUser,
  selectIsAdmin,
  selectIsAuthenticated,
} from './auth.reducer';
import { AuthState, CurrentUser, initialAuthState } from './auth.model';

const { reducer } = authFeature;

const adminUser: CurrentUser = {
  id: 'user-1',
  email: 'admin@findash.dev',
  documentNumber: '1010000001',
  role: 'ADMIN',
};

const clientUser: CurrentUser = {
  ...adminUser,
  id: 'user-2',
  email: 'basic@findash.dev',
  role: 'CLIENT',
};

describe('authReducer', () => {
  it('returns the initial state for an unknown action', () => {
    const state = reducer(undefined, { type: '@@INIT' });
    expect(state).toEqual(initialAuthState);
  });

  describe('login', () => {
    it('sets loading true and clears any previous error', () => {
      const previous: AuthState = { ...initialAuthState, error: 'Credenciales inválidas' };
      const state = reducer(previous, authActions.login({ email: 'a@a.com', password: 'x' }));
      expect(state.loading).toBe(true);
      expect(state.error).toBeNull();
    });
  });

  describe('loginSuccess', () => {
    it('populates user + tokens and clears loading/error', () => {
      const previous: AuthState = { ...initialAuthState, loading: true };
      const state = reducer(
        previous,
        authActions.loginSuccess({
          user: adminUser,
          accessToken: 'access-1',
          refreshToken: 'refresh-1',
        }),
      );
      expect(state).toEqual({
        user: adminUser,
        accessToken: 'access-1',
        refreshToken: 'refresh-1',
        loading: false,
        error: null,
        sessionRestoring: false,
      });
    });
  });

  describe('loginFailure', () => {
    it('clears any stale session data and stores the error message', () => {
      const previous: AuthState = {
        ...initialAuthState,
        loading: true,
        user: adminUser,
        accessToken: 'stale',
        refreshToken: 'stale',
      };
      const state = reducer(
        previous,
        authActions.loginFailure({ error: 'Credenciales inválidas' }),
      );
      expect(state.user).toBeNull();
      expect(state.accessToken).toBeNull();
      expect(state.refreshToken).toBeNull();
      expect(state.loading).toBe(false);
      expect(state.error).toBe('Credenciales inválidas');
    });
  });

  describe('logout', () => {
    it('resets to the initial state regardless of prior state', () => {
      const previous: AuthState = {
        user: adminUser,
        accessToken: 'a',
        refreshToken: 'r',
        loading: true,
        error: 'boom',
        sessionRestoring: true,
      };
      expect(reducer(previous, authActions.logout())).toEqual(initialAuthState);
    });
  });

  describe('refreshTokenSuccess', () => {
    it('replaces only the access token, leaving user/refreshToken untouched', () => {
      const previous: AuthState = {
        ...initialAuthState,
        user: clientUser,
        accessToken: 'old-access',
        refreshToken: 'refresh-1',
      };
      const state = reducer(
        previous,
        authActions.refreshTokenSuccess({ accessToken: 'new-access' }),
      );
      expect(state.accessToken).toBe('new-access');
      expect(state.refreshToken).toBe('refresh-1');
      expect(state.user).toEqual(clientUser);
    });
  });

  describe('refreshTokenFailure', () => {
    it('resets to the initial state (equivalent to a forced logout)', () => {
      const previous: AuthState = {
        ...initialAuthState,
        user: clientUser,
        accessToken: 'a',
        refreshToken: 'r',
      };
      expect(reducer(previous, authActions.refreshTokenFailure())).toEqual(initialAuthState);
    });
  });

  describe('restoreSession', () => {
    it('sets sessionRestoring true without touching the rest of the state', () => {
      const state = reducer(initialAuthState, authActions.restoreSession());
      expect(state.sessionRestoring).toBe(true);
      expect(state.user).toBeNull();
    });
  });

  describe('restoreSessionSuccess', () => {
    it('populates user + tokens and clears sessionRestoring', () => {
      const previous: AuthState = { ...initialAuthState, sessionRestoring: true };
      const state = reducer(
        previous,
        authActions.restoreSessionSuccess({
          user: clientUser,
          accessToken: 'access-2',
          refreshToken: 'refresh-2',
        }),
      );
      expect(state.user).toEqual(clientUser);
      expect(state.accessToken).toBe('access-2');
      expect(state.refreshToken).toBe('refresh-2');
      expect(state.sessionRestoring).toBe(false);
    });
  });

  describe('restoreSessionFailure', () => {
    it('resets to the initial state and clears sessionRestoring', () => {
      const previous: AuthState = {
        ...initialAuthState,
        sessionRestoring: true,
        user: clientUser,
        accessToken: 'stale',
        refreshToken: 'stale',
      };
      expect(reducer(previous, authActions.restoreSessionFailure())).toEqual(initialAuthState);
    });
  });
});

describe('auth selectors', () => {
  it('selectIsAuthenticated is true only when there is an accessToken', () => {
    expect(selectIsAuthenticated.projector(null)).toBe(false);
    expect(selectIsAuthenticated.projector('token')).toBe(true);
  });

  it('selectCurrentUser reads the user field off the feature state', () => {
    expect(selectCurrentUser.projector({ ...initialAuthState, user: clientUser })).toEqual(
      clientUser,
    );
    expect(selectCurrentUser.projector(initialAuthState)).toBeNull();
  });

  it('selectCurrentRole derives the role from the user, null when logged out', () => {
    expect(selectCurrentRole.projector(adminUser)).toBe('ADMIN');
    expect(selectCurrentRole.projector(clientUser)).toBe('CLIENT');
    expect(selectCurrentRole.projector(null)).toBeNull();
  });

  it('selectIsAdmin is true only for an ADMIN user', () => {
    expect(selectIsAdmin.projector(adminUser)).toBe(true);
    expect(selectIsAdmin.projector(clientUser)).toBe(false);
    expect(selectIsAdmin.projector(null)).toBe(false);
  });
});
