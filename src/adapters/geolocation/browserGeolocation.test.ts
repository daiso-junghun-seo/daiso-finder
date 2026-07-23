// src/adapters/geolocation/browserGeolocation.test.ts
import { createBrowserGeolocation } from './browserGeolocation';

test('geolocation absence yields an empty recommendation list, not a thrown error (D082)', async () => {
  const geo = createBrowserGeolocation({}, async () => []); // no navigator.geolocation
  await expect(geo.getNearbyStores()).resolves.toEqual([]);
});

test('a successful position fetch calls fetchNearby with the coordinates and returns its result', async () => {
  const nav = {
    geolocation: {
      getCurrentPosition: (success: PositionCallback) => {
        success({
          coords: { latitude: 37.5, longitude: 127.0 },
        } as GeolocationPosition);
      },
    } as unknown as Geolocation,
  };
  const calls: Array<[number, number]> = [];
  const fetchNearby = async (lat: number, lng: number) => {
    calls.push([lat, lng]);
    return [{ strCd: '1', strNm: '명동역점', distanceM: 120 }];
  };
  const geo = createBrowserGeolocation(nav, fetchNearby);
  await expect(geo.getNearbyStores()).resolves.toEqual([
    { strCd: '1', strNm: '명동역점', distanceM: 120 },
  ]);
  expect(calls).toEqual([[37.5, 127.0]]);
});

test('a position error (denial/failure) degrades to [] without throwing', async () => {
  const nav = {
    geolocation: {
      getCurrentPosition: (_success: PositionCallback, error?: PositionErrorCallback) => {
        error?.({ code: 1, message: 'denied' } as GeolocationPositionError);
      },
    } as unknown as Geolocation,
  };
  const geo = createBrowserGeolocation(nav, async () => [
    { strCd: '1', strNm: '명동역점', distanceM: 120 },
  ]);
  await expect(geo.getNearbyStores()).resolves.toEqual([]);
});

test('a rejecting fetchNearby degrades to [] without throwing', async () => {
  const nav = {
    geolocation: {
      getCurrentPosition: (success: PositionCallback) => {
        success({
          coords: { latitude: 37.5, longitude: 127.0 },
        } as GeolocationPosition);
      },
    } as unknown as Geolocation,
  };
  const geo = createBrowserGeolocation(nav, async () => {
    throw new Error('network');
  });
  await expect(geo.getNearbyStores()).resolves.toEqual([]);
});
