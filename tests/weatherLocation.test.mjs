import assert from 'node:assert/strict';
import test from 'node:test';

import {
  geolocationErrorMessage,
  locationFromBigDataCloud,
  locationFromNominatim,
  reverseGeocodeCoordinates
} from '../src/services/weatherLocation.js';

test('extracts the real city name from Nominatim address data', () => {
  const location = locationFromNominatim({
    address: {
      city: '深圳市',
      state: '广东省',
      country: '中国',
      country_code: 'cn'
    }
  }, { latitude: 22.5431, longitude: 114.0579 });

  assert.deepEqual(location, {
    name: '深圳市',
    admin1: '广东省',
    country: '中国',
    countryCode: 'CN',
    latitude: 22.5431,
    longitude: 114.0579,
    timezone: 'auto'
  });
});

test('uses the fallback reverse geocoder when Nominatim is unavailable', async () => {
  const calls = [];
  const location = await reverseGeocodeCoordinates(22.3193, 114.1694, {
    fetchImpl: async (url) => {
      calls.push(String(url));
      if (String(url).includes('nominatim')) return { ok: false, status: 503, json: async () => ({}) };
      return {
        ok: true,
        status: 200,
        json: async () => ({ city: '香港', principalSubdivision: '香港', countryName: '中国', countryCode: 'HK' })
      };
    }
  });

  assert.equal(calls.length, 2);
  assert.deepEqual(location, locationFromBigDataCloud({
    city: '香港',
    principalSubdivision: '香港',
    countryName: '中国',
    countryCode: 'HK'
  }, { latitude: 22.3193, longitude: 114.1694 }));
});

test('returns readable browser geolocation errors', () => {
  assert.match(geolocationErrorMessage({ code: 1 }), /权限/);
  assert.match(geolocationErrorMessage({ code: 3 }), /超时/);
});
