// Where prayer times are calculated for. "Auto" guesses the city from the
// phone's time zone (the native side gets this same table, so a time zone
// change while travelling moves the azan by itself). Cities can also be picked
// by hand, or the phone's location used once.

export interface Place {
  /** Stable id: the time zone for zone cities, "bd-<name>" etc. for the rest */
  id: string
  name: string
  /** ISO country code: picks the usual calculation method and Asr */
  country: string
  lat: number
  lng: number
}

type Row = [tz: string, name: string, country: string, lat: number, lng: number]

// One representative city per time zone (the zone's own city). Older ids that
// phones still report (Asia/Calcutta, Asia/Dacca...) are listed too.
const ZONE_ROWS: Row[] = [
  ["Asia/Dhaka", "Dhaka", "BD", 23.8103, 90.4125],
  ["Asia/Dacca", "Dhaka", "BD", 23.8103, 90.4125],
  ["Asia/Kolkata", "Kolkata", "IN", 22.5726, 88.3639],
  ["Asia/Calcutta", "Kolkata", "IN", 22.5726, 88.3639],
  ["Asia/Karachi", "Karachi", "PK", 24.8607, 67.0011],
  ["Asia/Kabul", "Kabul", "AF", 34.5553, 69.2075],
  ["Asia/Kathmandu", "Kathmandu", "NP", 27.7172, 85.324],
  ["Asia/Katmandu", "Kathmandu", "NP", 27.7172, 85.324],
  ["Asia/Colombo", "Colombo", "LK", 6.9271, 79.8612],
  ["Asia/Thimphu", "Thimphu", "BT", 27.4728, 89.639],
  ["Asia/Yangon", "Yangon", "MM", 16.8409, 96.1735],
  ["Asia/Rangoon", "Yangon", "MM", 16.8409, 96.1735],
  ["Indian/Maldives", "Malé", "MV", 4.1755, 73.5093],
  ["Asia/Riyadh", "Riyadh", "SA", 24.7136, 46.6753],
  ["Asia/Dubai", "Dubai", "AE", 25.2048, 55.2708],
  ["Asia/Qatar", "Doha", "QA", 25.2854, 51.531],
  ["Asia/Kuwait", "Kuwait City", "KW", 29.3759, 47.9774],
  ["Asia/Bahrain", "Manama", "BH", 26.2235, 50.5876],
  ["Asia/Muscat", "Muscat", "OM", 23.588, 58.3829],
  ["Asia/Aden", "Aden", "YE", 12.7855, 45.0187],
  ["Asia/Baghdad", "Baghdad", "IQ", 33.3152, 44.3661],
  ["Asia/Tehran", "Tehran", "IR", 35.6892, 51.389],
  ["Asia/Amman", "Amman", "JO", 31.9454, 35.9284],
  ["Asia/Beirut", "Beirut", "LB", 33.8938, 35.5018],
  ["Asia/Damascus", "Damascus", "SY", 33.5138, 36.2765],
  ["Asia/Jerusalem", "Jerusalem", "PS", 31.7683, 35.2137],
  ["Asia/Gaza", "Gaza", "PS", 31.5017, 34.4668],
  ["Asia/Hebron", "Hebron", "PS", 31.5326, 35.0998],
  ["Europe/Istanbul", "Istanbul", "TR", 41.0082, 28.9784],
  ["Asia/Istanbul", "Istanbul", "TR", 41.0082, 28.9784],
  ["Asia/Baku", "Baku", "AZ", 40.4093, 49.8671],
  ["Asia/Tashkent", "Tashkent", "UZ", 41.2995, 69.2401],
  ["Asia/Samarkand", "Samarkand", "UZ", 39.6542, 66.9597],
  ["Asia/Almaty", "Almaty", "KZ", 43.222, 76.8512],
  ["Asia/Bishkek", "Bishkek", "KG", 42.8746, 74.5698],
  ["Asia/Dushanbe", "Dushanbe", "TJ", 38.5598, 68.787],
  ["Asia/Ashgabat", "Ashgabat", "TM", 37.9601, 58.3261],
  ["Asia/Kuala_Lumpur", "Kuala Lumpur", "MY", 3.139, 101.6869],
  ["Asia/Singapore", "Singapore", "SG", 1.3521, 103.8198],
  ["Asia/Jakarta", "Jakarta", "ID", -6.2088, 106.8456],
  ["Asia/Makassar", "Makassar", "ID", -5.1477, 119.4327],
  ["Asia/Brunei", "Bandar Seri Begawan", "BN", 4.9031, 114.9398],
  ["Asia/Manila", "Manila", "PH", 14.5995, 120.9842],
  ["Asia/Bangkok", "Bangkok", "TH", 13.7563, 100.5018],
  ["Asia/Ho_Chi_Minh", "Ho Chi Minh City", "VN", 10.8231, 106.6297],
  ["Asia/Saigon", "Ho Chi Minh City", "VN", 10.8231, 106.6297],
  ["Asia/Shanghai", "Shanghai", "CN", 31.2304, 121.4737],
  ["Asia/Urumqi", "Ürümqi", "CN", 43.8256, 87.6168],
  ["Asia/Hong_Kong", "Hong Kong", "HK", 22.3193, 114.1694],
  ["Asia/Tokyo", "Tokyo", "JP", 35.6762, 139.6503],
  ["Asia/Seoul", "Seoul", "KR", 37.5665, 126.978],
  ["Africa/Cairo", "Cairo", "EG", 30.0444, 31.2357],
  ["Africa/Casablanca", "Casablanca", "MA", 33.5731, -7.5898],
  ["Africa/Algiers", "Algiers", "DZ", 36.7538, 3.0588],
  ["Africa/Tunis", "Tunis", "TN", 36.8065, 10.1815],
  ["Africa/Tripoli", "Tripoli", "LY", 32.8872, 13.1913],
  ["Africa/Khartoum", "Khartoum", "SD", 15.5007, 32.5599],
  ["Africa/Lagos", "Lagos", "NG", 6.5244, 3.3792],
  ["Africa/Nairobi", "Nairobi", "KE", -1.2921, 36.8219],
  ["Africa/Addis_Ababa", "Addis Ababa", "ET", 8.9806, 38.7578],
  ["Africa/Mogadishu", "Mogadishu", "SO", 2.0469, 45.3182],
  ["Africa/Dakar", "Dakar", "SN", 14.7167, -17.4677],
  ["Africa/Johannesburg", "Johannesburg", "ZA", -26.2041, 28.0473],
  ["Europe/London", "London", "GB", 51.5074, -0.1278],
  ["Europe/Dublin", "Dublin", "IE", 53.3498, -6.2603],
  ["Europe/Paris", "Paris", "FR", 48.8566, 2.3522],
  ["Europe/Berlin", "Berlin", "DE", 52.52, 13.405],
  ["Europe/Madrid", "Madrid", "ES", 40.4168, -3.7038],
  ["Europe/Lisbon", "Lisbon", "PT", 38.7223, -9.1393],
  ["Europe/Rome", "Rome", "IT", 41.9028, 12.4964],
  ["Europe/Amsterdam", "Amsterdam", "NL", 52.3676, 4.9041],
  ["Europe/Brussels", "Brussels", "BE", 50.8503, 4.3517],
  ["Europe/Vienna", "Vienna", "AT", 48.2082, 16.3738],
  ["Europe/Zurich", "Zurich", "CH", 47.3769, 8.5417],
  ["Europe/Stockholm", "Stockholm", "SE", 59.3293, 18.0686],
  ["Europe/Oslo", "Oslo", "NO", 59.9139, 10.7522],
  ["Europe/Copenhagen", "Copenhagen", "DK", 55.6761, 12.5683],
  ["Europe/Helsinki", "Helsinki", "FI", 60.1699, 24.9384],
  ["Europe/Warsaw", "Warsaw", "PL", 52.2297, 21.0122],
  ["Europe/Athens", "Athens", "GR", 37.9838, 23.7275],
  ["Europe/Sarajevo", "Sarajevo", "BA", 43.8563, 18.4131],
  ["Europe/Moscow", "Moscow", "RU", 55.7558, 37.6173],
  ["America/New_York", "New York", "US", 40.7128, -74.006],
  ["America/Chicago", "Chicago", "US", 41.8781, -87.6298],
  ["America/Denver", "Denver", "US", 39.7392, -104.9903],
  ["America/Los_Angeles", "Los Angeles", "US", 34.0522, -118.2437],
  ["America/Toronto", "Toronto", "CA", 43.6532, -79.3832],
  ["America/Vancouver", "Vancouver", "CA", 49.2827, -123.1207],
  ["America/Mexico_City", "Mexico City", "MX", 19.4326, -99.1332],
  ["America/Sao_Paulo", "São Paulo", "BR", -23.5505, -46.6333],
  ["America/Argentina/Buenos_Aires", "Buenos Aires", "AR", -34.6037, -58.3816],
  ["Europe/Bucharest", "Bucharest", "RO", 44.4268, 26.1025],
  ["Europe/Sofia", "Sofia", "BG", 42.6977, 23.3219],
  ["Europe/Belgrade", "Belgrade", "RS", 44.7866, 20.4489],
  ["Europe/Budapest", "Budapest", "HU", 47.4979, 19.0402],
  ["Europe/Prague", "Prague", "CZ", 50.0755, 14.4378],
  ["Europe/Bratislava", "Bratislava", "SK", 48.1486, 17.1077],
  ["Europe/Zagreb", "Zagreb", "HR", 45.815, 15.9819],
  ["Europe/Ljubljana", "Ljubljana", "SI", 46.0569, 14.5058],
  ["Europe/Skopje", "Skopje", "MK", 41.9981, 21.4254],
  ["Europe/Tirane", "Tirana", "AL", 41.3275, 19.8187],
  ["Europe/Kyiv", "Kyiv", "UA", 50.4501, 30.5234],
  ["Europe/Kiev", "Kyiv", "UA", 50.4501, 30.5234],
  ["Europe/Chisinau", "Chișinău", "MD", 47.0105, 28.8638],
  ["Europe/Minsk", "Minsk", "BY", 53.9006, 27.559],
  ["Europe/Riga", "Riga", "LV", 56.9496, 24.1052],
  ["Europe/Vilnius", "Vilnius", "LT", 54.6872, 25.2797],
  ["Europe/Tallinn", "Tallinn", "EE", 59.437, 24.7536],
  ["Europe/Luxembourg", "Luxembourg", "LU", 49.6116, 6.1319],
  ["Europe/Malta", "Valletta", "MT", 35.8989, 14.5146],
  ["Asia/Nicosia", "Nicosia", "CY", 35.1856, 33.3823],
  ["Asia/Tbilisi", "Tbilisi", "GE", 41.7151, 44.8271],
  ["Asia/Yerevan", "Yerevan", "AM", 40.1792, 44.4991],
  ["Asia/Yekaterinburg", "Yekaterinburg", "RU", 56.8389, 60.6057],
  ["Asia/Kuching", "Kuching", "MY", 1.5533, 110.3592],
  ["Asia/Pontianak", "Pontianak", "ID", -0.0263, 109.3425],
  ["Asia/Jayapura", "Jayapura", "ID", -2.5337, 140.718],
  ["Asia/Taipei", "Taipei", "TW", 25.033, 121.5654],
  ["Asia/Phnom_Penh", "Phnom Penh", "KH", 11.5564, 104.9282],
  ["Africa/Abidjan", "Abidjan", "CI", 5.36, -4.0083],
  ["Africa/Accra", "Accra", "GH", 5.6037, -0.187],
  ["Africa/Bamako", "Bamako", "ML", 12.6392, -8.0029],
  ["Africa/Conakry", "Conakry", "GN", 9.6412, -13.5784],
  ["Africa/Niamey", "Niamey", "NE", 13.5116, 2.1254],
  ["Africa/Ndjamena", "N'Djamena", "TD", 12.1348, 15.0557],
  ["Africa/Nouakchott", "Nouakchott", "MR", 18.0735, -15.9582],
  ["Africa/Douala", "Douala", "CM", 4.0511, 9.7679],
  ["Africa/Kampala", "Kampala", "UG", 0.3476, 32.5825],
  ["Africa/Dar_es_Salaam", "Dar es Salaam", "TZ", -6.7924, 39.2083],
  ["Africa/Djibouti", "Djibouti", "DJ", 11.5721, 43.1456],
  ["Africa/Kinshasa", "Kinshasa", "CD", -4.4419, 15.2663],
  ["Africa/Maputo", "Maputo", "MZ", -25.9692, 32.5732],
  ["America/Detroit", "Detroit", "US", 42.3314, -83.0458],
  ["America/Phoenix", "Phoenix", "US", 33.4484, -112.074],
  ["America/Anchorage", "Anchorage", "US", 61.2181, -149.9003],
  ["Pacific/Honolulu", "Honolulu", "US", 21.3069, -157.8583],
  ["America/Halifax", "Halifax", "CA", 44.6488, -63.5752],
  ["America/Winnipeg", "Winnipeg", "CA", 49.8951, -97.1384],
  ["America/Edmonton", "Edmonton", "CA", 53.5461, -113.4938],
  ["America/Bogota", "Bogotá", "CO", 4.711, -74.0721],
  ["America/Lima", "Lima", "PE", -12.0464, -77.0428],
  ["America/Santiago", "Santiago", "CL", -33.4489, -70.6693],
  ["America/Caracas", "Caracas", "VE", 10.4806, -66.9036],
  ["America/Port_of_Spain", "Port of Spain", "TT", 10.6596, -61.5089],
  ["America/Guyana", "Georgetown", "GY", 6.8013, -58.1551],
  ["America/Paramaribo", "Paramaribo", "SR", 5.852, -55.2038],
  ["Australia/Adelaide", "Adelaide", "AU", -34.9285, 138.6007],
  ["Australia/Darwin", "Darwin", "AU", -12.4634, 130.8456],
  ["Pacific/Fiji", "Suva", "FJ", -18.1248, 178.4501],
  ["Australia/Sydney", "Sydney", "AU", -33.8688, 151.2093],
  ["Australia/Melbourne", "Melbourne", "AU", -37.8136, 144.9631],
  ["Australia/Brisbane", "Brisbane", "AU", -27.4698, 153.0251],
  ["Australia/Perth", "Perth", "AU", -31.9505, 115.8605],
  ["Pacific/Auckland", "Auckland", "NZ", -36.8485, 174.7633],
]

// Bangladesh: divisional and big district towns, so the azan isn't minutes off
// outside Dhaka (one degree east or west is four minutes).
const BD_ROWS: [name: string, lat: number, lng: number][] = [
  ["Dhaka", 23.8103, 90.4125],
  ["Gazipur", 23.9999, 90.4203],
  ["Narayanganj", 23.6238, 90.5],
  ["Savar", 23.8583, 90.2667],
  ["Tangail", 24.2513, 89.9167],
  ["Mymensingh", 24.7471, 90.4203],
  ["Chattogram", 22.3569, 91.7832],
  ["Cox's Bazar", 21.4272, 92.0058],
  ["Cumilla", 23.4607, 91.1809],
  ["Feni", 23.0159, 91.3976],
  ["Noakhali", 22.8696, 91.0995],
  ["Brahmanbaria", 23.9571, 91.1119],
  ["Sylhet", 24.8949, 91.8687],
  ["Rajshahi", 24.3745, 88.6042],
  ["Bogura", 24.8465, 89.3773],
  ["Pabna", 24.0064, 89.2372],
  ["Rangpur", 25.7439, 89.2752],
  ["Dinajpur", 25.6217, 88.6355],
  ["Khulna", 22.8456, 89.5403],
  ["Jashore", 23.1664, 89.2081],
  ["Kushtia", 23.9013, 89.1205],
  ["Barishal", 22.701, 90.3535],
  ["Faridpur", 23.607, 89.8429],
]

const toPlace = ([tz, name, country, lat, lng]: Row): Place => ({ id: tz, name, country, lat, lng })

export const ZONE_PLACES: Place[] = ZONE_ROWS.map(toPlace)
const byZone = new Map(ZONE_PLACES.map((p) => [p.id, p]))

/** Cities for the picker: Bangladesh first, then one per time zone (no duplicates) */
export const CITIES: Place[] = (() => {
  const bd = BD_ROWS.map(([name, lat, lng]) => ({ id: `bd-${name.toLowerCase().replace(/[^a-z]+/g, "-")}`, name, country: "BD", lat, lng }))
  const seen = new Set(bd.map((p) => p.name))
  const world = ZONE_PLACES.filter((p) => !seen.has(p.name) && !seen.has(p.id) && (seen.add(p.name), true))
  return [...bd, ...world.sort((a, b) => a.name.localeCompare(b.name))]
})()

export const cityById = (id: string) => CITIES.find((c) => c.id === id) ?? byZone.get(id) ?? null

export function deviceZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC"
  } catch {
    return "UTC"
  }
}

export const placeForZone = (tz: string) => byZone.get(tz) ?? null

/** UTC offset of a zone right now, in minutes (null if the browser doesn't know the zone) */
function offsetMinutes(tz: string, at: Date): number | null {
  try {
    const name = new Intl.DateTimeFormat("en-US", { timeZone: tz, timeZoneName: "longOffset" })
      .formatToParts(at)
      .find((p) => p.type === "timeZoneName")?.value
    if (!name || name === "GMT") return 0
    const m = name.match(/GMT([+-])(\d{2}):?(\d{2})?/)
    return m ? (m[1] === "-" ? -1 : 1) * (Number(m[2]) * 60 + Number(m[3] ?? 0)) : null
  } catch {
    return null
  }
}

/**
 * A zone we have no city for: the closest-sounding known one (same region,
 * same clock time). Only approximate (minutes off), so the screen asks you to
 * pick your city.
 */
export function approxPlaceForZone(tz: string, at = new Date()): Place | null {
  const offset = offsetMinutes(tz, at)
  if (offset === null) return null
  const region = tz.split("/")[0]
  const same = ZONE_PLACES.filter((p) => offsetMinutes(p.id, at) === offset)
  return same.find((p) => p.id.split("/")[0] === region) ?? same[0] ?? null
}

export const COUNTRY_NAMES: Record<string, string> = {
  BD: "Bangladesh", IN: "India", PK: "Pakistan", SA: "Saudi Arabia", AE: "UAE", QA: "Qatar", KW: "Kuwait", MY: "Malaysia",
  SG: "Singapore", GB: "United Kingdom", US: "United States", CA: "Canada", TR: "Turkey", EG: "Egypt",
}
