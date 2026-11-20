/**
 * منطقة الخدمة: مدينة بلبيس.
 * عدّل القيم هنا بس، وهتتغير في شاشة العناوين وشاشة الخريطة مع بعض.
 * (حطّه في lib/service-area.ts)
 */
export const SERVICE_AREA = { latitude: 30.42292, longitude: 31.557884, radiusKm: 10 } as const;

/** المسافة بالكيلومتر بين نقطتين (Haversine). */
export function distanceKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const toRad = (v: number) => (v * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/** الحكم بالمسافة وليس باسم المدينة، لأن اسم المدينة بيتغير حسب لغة الجهاز (Bilbeis / بلبيس). */
export const isOutsideServiceArea = (lat: number, lng: number): boolean =>
  distanceKm(SERVICE_AREA.latitude, SERVICE_AREA.longitude, lat, lng) > SERVICE_AREA.radiusKm;