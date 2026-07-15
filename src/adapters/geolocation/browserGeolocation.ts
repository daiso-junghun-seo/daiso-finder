// src/adapters/geolocation/browserGeolocation.ts
import type { GeolocationPort } from '../../domain/ports';
// GPS RECOMMENDS ONLY (D082): never sets the store; failure/denial → empty list, search is never blocked.
export function createBrowserGeolocation(
  nav: { geolocation?: Geolocation } = navigator,
): GeolocationPort {
  return {
    async getNearbyStores() {
      if (!nav.geolocation) return [];
      // Increment 1 wires real coordinates → nearby-store lookup; here the seam returns [] safely.
      return [];
    },
  };
}
