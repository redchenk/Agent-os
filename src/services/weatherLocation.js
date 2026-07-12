const NOMINATIM_REVERSE_URL = 'https://nominatim.openstreetmap.org/reverse';
const BIG_DATA_CLOUD_REVERSE_URL = 'https://api.bigdatacloud.net/data/reverse-geocode-client';

function asText(value) {
  return String(value || '').trim();
}

function firstText(...values) {
  return values.map(asText).find(Boolean) || '';
}

function coordinateLabel(latitude, longitude) {
  return `${Number(latitude).toFixed(3)}, ${Number(longitude).toFixed(3)}`;
}

export function locationFromNominatim(payload = {}, coordinates = {}) {
  const address = payload.address || {};
  const name = firstText(
    address.city,
    address.municipality,
    address.town,
    address.village,
    address.county,
    payload.name,
    asText(payload.display_name).split(',')[0]
  );
  if (!name) return null;
  return {
    name,
    admin1: firstText(address.state, address.region, address.province),
    country: firstText(address.country),
    countryCode: asText(address.country_code).toUpperCase(),
    latitude: Number(coordinates.latitude),
    longitude: Number(coordinates.longitude),
    timezone: 'auto'
  };
}

export function locationFromBigDataCloud(payload = {}, coordinates = {}) {
  const name = firstText(payload.city, payload.locality, payload.localityInfo?.informative?.[0]?.name);
  if (!name) return null;
  return {
    name,
    admin1: firstText(payload.principalSubdivision, payload.principalSubdivisionCode),
    country: firstText(payload.countryName),
    countryCode: asText(payload.countryCode).toUpperCase(),
    latitude: Number(coordinates.latitude),
    longitude: Number(coordinates.longitude),
    timezone: 'auto'
  };
}

async function fetchJson(url, fetchImpl, timeoutMs = 7000) {
  const controller = typeof AbortController === 'undefined' ? null : new AbortController();
  const timer = controller ? globalThis.setTimeout(() => controller.abort(), timeoutMs) : 0;
  try {
    const response = await fetchImpl(url, {
      headers: { Accept: 'application/json' },
      signal: controller?.signal
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return await response.json();
  } finally {
    if (timer) globalThis.clearTimeout(timer);
  }
}

export async function reverseGeocodeCoordinates(latitude, longitude, options = {}) {
  const coordinates = { latitude: Number(latitude), longitude: Number(longitude) };
  if (!Number.isFinite(coordinates.latitude) || !Number.isFinite(coordinates.longitude)) {
    throw new Error('定位坐标无效。');
  }
  const fetchImpl = options.fetchImpl || globalThis.fetch;
  if (typeof fetchImpl !== 'function') throw new Error('当前环境无法查询城市名称。');

  const nominatimUrl = new URL(NOMINATIM_REVERSE_URL);
  nominatimUrl.searchParams.set('lat', String(coordinates.latitude));
  nominatimUrl.searchParams.set('lon', String(coordinates.longitude));
  nominatimUrl.searchParams.set('format', 'jsonv2');
  nominatimUrl.searchParams.set('addressdetails', '1');
  nominatimUrl.searchParams.set('zoom', '10');
  nominatimUrl.searchParams.set('accept-language', options.language || 'zh-CN,zh,en');

  try {
    const payload = await fetchJson(nominatimUrl, fetchImpl);
    const location = locationFromNominatim(payload, coordinates);
    if (location) return location;
  } catch (_) {
    // Fall through to the browser-oriented reverse geocoder.
  }

  const fallbackUrl = new URL(BIG_DATA_CLOUD_REVERSE_URL);
  fallbackUrl.searchParams.set('latitude', String(coordinates.latitude));
  fallbackUrl.searchParams.set('longitude', String(coordinates.longitude));
  fallbackUrl.searchParams.set('localityLanguage', options.language || 'zh');
  try {
    const payload = await fetchJson(fallbackUrl, fetchImpl);
    const location = locationFromBigDataCloud(payload, coordinates);
    if (location) return location;
  } catch (_) {
    // Report one stable error after both providers fail.
  }

  throw new Error(`已获取位置 ${coordinateLabel(latitude, longitude)}，但暂时无法识别城市名称。`);
}

export function geolocationErrorMessage(error = {}) {
  if (Number(error.code) === 1) return '定位权限被拒绝，可在浏览器网站设置中允许位置权限。';
  if (Number(error.code) === 2) return '当前设备暂时无法确定位置。';
  if (Number(error.code) === 3) return '获取位置超时，请稍后重试。';
  return asText(error.message) || '无法获取当前地理位置。';
}
