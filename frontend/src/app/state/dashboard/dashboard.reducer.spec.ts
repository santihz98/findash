import { dashboardActions } from './dashboard.actions';
import { AccountTypeVolume, DashboardKpis, DashboardState, initialDashboardState } from './dashboard.model';
import {
  dashboardFeature,
  selectKpisIsInitialLoading,
  selectKpisIsRefetching,
  selectVolumeIsInitialLoading,
  selectVolumeIsRefetching,
} from './dashboard.reducer';

const { reducer } = dashboardFeature;

const kpis: DashboardKpis = { totalVolumeTransacted: '434.00', failedOrRejectedCount: 48 };

const volume: AccountTypeVolume[] = [
  { accountType: 'BASIC', totalVolume: '427.00' },
  { accountType: 'PREMIUM', totalVolume: '7.00' },
];

describe('dashboardReducer', () => {
  it('returns the initial state for an unknown action', () => {
    expect(reducer(undefined, { type: '@@INIT' })).toEqual(initialDashboardState);
  });

  describe('loadKpis', () => {
    it('sets kpisLoading and clears any previous kpisError, without touching the volume sub-state', () => {
      const previous: DashboardState = {
        ...initialDashboardState,
        kpisError: 'boom',
        volumeByAccountType: volume,
        volumeLoaded: true,
      };
      const state = reducer(previous, dashboardActions.loadKpis());

      expect(state.kpisLoading).toBe(true);
      expect(state.kpisError).toBeNull();
      expect(state.volumeByAccountType).toEqual(volume);
      expect(state.volumeLoaded).toBe(true);
    });
  });

  describe('loadKpisSuccess', () => {
    it('stores the kpis and marks kpisLoaded', () => {
      const state = reducer(
        { ...initialDashboardState, kpisLoading: true },
        dashboardActions.loadKpisSuccess({ kpis }),
      );

      expect(state.kpis).toEqual(kpis);
      expect(state.kpisLoading).toBe(false);
      expect(state.kpisLoaded).toBe(true);
      expect(state.kpisError).toBeNull();
    });
  });

  describe('loadKpisFailure', () => {
    it('sets the error, marks kpisLoaded, and keeps whatever kpis were already there (stale data)', () => {
      const previous: DashboardState = { ...initialDashboardState, kpis, kpisLoading: true };
      const state = reducer(previous, dashboardActions.loadKpisFailure({ error: 'No se pudo' }));

      expect(state.kpisError).toBe('No se pudo');
      expect(state.kpisLoading).toBe(false);
      expect(state.kpisLoaded).toBe(true);
      expect(state.kpis).toEqual(kpis);
    });
  });

  describe('loadVolumeByAccountType', () => {
    it('sets volumeLoading and clears any previous volumeError, without touching the kpis sub-state', () => {
      const previous: DashboardState = { ...initialDashboardState, volumeError: 'boom', kpis, kpisLoaded: true };
      const state = reducer(previous, dashboardActions.loadVolumeByAccountType());

      expect(state.volumeLoading).toBe(true);
      expect(state.volumeError).toBeNull();
      expect(state.kpis).toEqual(kpis);
      expect(state.kpisLoaded).toBe(true);
    });
  });

  describe('loadVolumeByAccountTypeSuccess', () => {
    it('stores the array as-is (including a partial one, missing an AccountType) and marks volumeLoaded', () => {
      const state = reducer(
        { ...initialDashboardState, volumeLoading: true },
        dashboardActions.loadVolumeByAccountTypeSuccess({ volumeByAccountType: volume }),
      );

      expect(state.volumeByAccountType).toEqual(volume);
      expect(state.volumeLoading).toBe(false);
      expect(state.volumeLoaded).toBe(true);
      expect(state.volumeError).toBeNull();
    });

    it('stores an empty array as-is (no transactions yet) without treating it as an error', () => {
      const state = reducer(
        { ...initialDashboardState, volumeLoading: true },
        dashboardActions.loadVolumeByAccountTypeSuccess({ volumeByAccountType: [] }),
      );

      expect(state.volumeByAccountType).toEqual([]);
      expect(state.volumeError).toBeNull();
    });
  });

  describe('loadVolumeByAccountTypeFailure', () => {
    it('sets the error, marks volumeLoaded, and keeps whatever data was already there (stale data)', () => {
      const previous: DashboardState = {
        ...initialDashboardState,
        volumeByAccountType: volume,
        volumeLoading: true,
      };
      const state = reducer(
        previous,
        dashboardActions.loadVolumeByAccountTypeFailure({ error: 'No se pudo' }),
      );

      expect(state.volumeError).toBe('No se pudo');
      expect(state.volumeLoading).toBe(false);
      expect(state.volumeLoaded).toBe(true);
      expect(state.volumeByAccountType).toEqual(volume);
    });
  });
});

describe('dashboard selectors', () => {
  it('selectKpisIsInitialLoading is true only on the very first load', () => {
    expect(selectKpisIsInitialLoading.projector(true, false)).toBe(true);
    expect(selectKpisIsInitialLoading.projector(true, true)).toBe(false);
    expect(selectKpisIsInitialLoading.projector(false, false)).toBe(false);
  });

  it('selectKpisIsRefetching is true only when loading again after already having loaded once', () => {
    expect(selectKpisIsRefetching.projector(true, true)).toBe(true);
    expect(selectKpisIsRefetching.projector(true, false)).toBe(false);
    expect(selectKpisIsRefetching.projector(false, true)).toBe(false);
  });

  it('selectVolumeIsInitialLoading is true only on the very first load', () => {
    expect(selectVolumeIsInitialLoading.projector(true, false)).toBe(true);
    expect(selectVolumeIsInitialLoading.projector(false, true)).toBe(false);
  });

  it('selectVolumeIsRefetching is true only when loading again after already having loaded once', () => {
    expect(selectVolumeIsRefetching.projector(true, true)).toBe(true);
    expect(selectVolumeIsRefetching.projector(false, true)).toBe(false);
  });
});
