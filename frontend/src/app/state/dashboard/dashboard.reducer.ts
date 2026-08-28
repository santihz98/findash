import { createFeature, createReducer, createSelector, on } from '@ngrx/store';

import { dashboardActions } from './dashboard.actions';
import { initialDashboardState } from './dashboard.model';

const reducer = createReducer(
  initialDashboardState,

  on(dashboardActions.loadKpis, (state) => ({ ...state, kpisLoading: true, kpisError: null })),

  on(dashboardActions.loadKpisSuccess, (state, { kpis }) => ({
    ...state,
    kpis,
    kpisLoading: false,
    kpisLoaded: true,
    kpisError: null,
  })),

  on(dashboardActions.loadKpisFailure, (state, { error }) => ({
    ...state,
    kpisLoading: false,
    kpisLoaded: true,
    kpisError: error,
  })),

  on(dashboardActions.loadVolumeByAccountType, (state) => ({
    ...state,
    volumeLoading: true,
    volumeError: null,
  })),

  on(dashboardActions.loadVolumeByAccountTypeSuccess, (state, { volumeByAccountType }) => ({
    ...state,
    volumeByAccountType,
    volumeLoading: false,
    volumeLoaded: true,
    volumeError: null,
  })),

  on(dashboardActions.loadVolumeByAccountTypeFailure, (state, { error }) => ({
    ...state,
    volumeLoading: false,
    volumeLoaded: true,
    volumeError: error,
  })),
);

export const dashboardFeature = createFeature({
  name: 'dashboard',
  reducer,
  extraSelectors: ({ selectKpisLoading, selectKpisLoaded, selectVolumeLoading, selectVolumeLoaded }) => ({
    selectKpisIsInitialLoading: createSelector(
      selectKpisLoading,
      selectKpisLoaded,
      (loading, loaded) => loading && !loaded,
    ),
    selectKpisIsRefetching: createSelector(
      selectKpisLoading,
      selectKpisLoaded,
      (loading, loaded) => loading && loaded,
    ),
    selectVolumeIsInitialLoading: createSelector(
      selectVolumeLoading,
      selectVolumeLoaded,
      (loading, loaded) => loading && !loaded,
    ),
    selectVolumeIsRefetching: createSelector(
      selectVolumeLoading,
      selectVolumeLoaded,
      (loading, loaded) => loading && loaded,
    ),
  }),
});

export const {
  name: dashboardFeatureKey,
  reducer: dashboardReducer,
  selectKpis,
  selectKpisLoading,
  selectKpisLoaded,
  selectKpisError,
  selectVolumeByAccountType,
  selectVolumeLoading,
  selectVolumeLoaded,
  selectVolumeError,
  selectKpisIsInitialLoading,
  selectKpisIsRefetching,
  selectVolumeIsInitialLoading,
  selectVolumeIsRefetching,
} = dashboardFeature;
