// src/adapters/geolocation/browserGeolocation.ts
import type { GeolocationPort } from '../../domain/ports';
import type { StoreContext } from '../../domain/types';

export type NearbyStoreFetch = (
  lat: number,
  lng: number,
) => Promise<Array<StoreContext & { distanceM: number }>>;

function getPosition(geo: Geolocation): Promise<GeolocationPosition> {
  return new Promise((resolve, reject) => {
    geo.getCurrentPosition(resolve, reject);
  });
}

// GPS RECOMMENDS ONLY (D082): never sets the store; failure/denial/no-geolocation/fetch-failure all
// degrade to an empty list — the sheet's search field remains the fallback (never a dead end).
// nav keeps its `= navigator` default (production convenience) even though fetchNearby after it is
// required with no safe default — composition.ts always owns which fetch to wire in.
export function createBrowserGeolocation(
  // biome-ignore lint/style/useDefaultParameterLast: see note above; fetchNearby has no safe default.
  nav: { geolocation?: Geolocation } = navigator,
  fetchNearby: NearbyStoreFetch,
): GeolocationPort {
  return {
    async getNearbyStores() {
      if (!nav.geolocation || typeof nav.geolocation.getCurrentPosition !== 'function') return [];
      try {
        const pos = await getPosition(nav.geolocation);
        return await fetchNearby(pos.coords.latitude, pos.coords.longitude);
      } catch {
        return [];
      }
    },
  };
}
