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
// Both params are required: composition.ts owns which fetch to wire and always passes `navigator`.
export function createBrowserGeolocation(
  nav: { geolocation?: Geolocation },
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
