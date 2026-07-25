// src/domain/state-machine.ts
import { hasLocation } from './guards';
import type { StoreEvent, UiState } from './types';

export const initialState: UiState = { state: 'default' };

export function reduce(state: UiState, event: StoreEvent): UiState {
  switch (event.type) {
    case 'SUBMIT':
      return { state: 'loading', query: event.query, slow: false, origin: event.origin };
    case 'SELECT_CANDIDATE':
      // A candidate tap is a product choice, not a scanned code — provenance ends here.
      return { state: 'loading', query: event.query, slow: false };
    case 'CHANGE_STORE':
      return { state: 'default' };
    case 'SLOW':
      return state.state === 'loading' ? { ...state, slow: true } : state;
    case 'NO_MATCH':
      return {
        state: 'empty',
        query: event.query,
        suggestions: event.suggestions.slice(0, 3),
        // Same threading shape RESULT/FAILURE use for query: only a loading state carries provenance.
        origin: state.state === 'loading' ? state.origin : undefined,
      };
    case 'CANDIDATES':
      return { state: 'candidates', query: event.query, candidates: event.candidates.slice(0, 3) };
    case 'RESULT': {
      const query = state.state === 'loading' ? state.query : '';
      const { answer, freshness } = event;
      if (answer.kind === 'inStock' && !hasLocation(answer))
        return { state: 'partial', trigger: 'locationMissing', query, answer, freshness };
      if (answer.kind === 'franchiseUndeterminable')
        return { state: 'partial', trigger: 'franchise', query, answer, freshness };
      return { state: 'success', query, answer, freshness };
    }
    case 'FAILURE': {
      const query = state.state === 'loading' ? state.query : '';
      const c = event.cache;
      if (c.kind === 'withinThreshold')
        return {
          state: 'error',
          variant: 'cached',
          query,
          answer: c.answer,
          freshness: c.freshness,
        };
      if (c.kind === 'beyondThreshold')
        return {
          state: 'partial',
          trigger: 'staleCache',
          query,
          answer: c.answer,
          freshness: c.freshness,
        };
      return { state: 'error', variant: 'noCache', query };
    }
    case 'DISMISS_AI':
      return state;
    default:
      return state;
  }
}
