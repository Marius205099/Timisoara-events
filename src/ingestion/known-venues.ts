/**
 * Registry of verified venues. Coordinates were checked against OpenStreetMap
 * (Nominatim, 2026-10-27) by address. Admin-verified venues in the database
 * extend this list at runtime. Matching is by alias, never by locality alone.
 */
export interface KnownVenue {
  key: string;
  name: string;
  address: string;
  locality: string;
  lat: number;
  lng: number;
  aliases: string[];
}

export const KNOWN_VENUES: KnownVenue[] = [
  { key: "sala-capitol", name: "Sala Capitol (Filarmonica Banatul)", address: "Bd. C.D. Loga nr. 2, Timișoara", locality: "Timișoara", lat: 45.7505647, lng: 21.2262177, aliases: ["sala capitol", "filarmonica banatul", "loga 2"] },
  { key: "teatrul-national", name: "Teatrul Național „Mihai Eminescu”", address: "Str. Mărășești nr. 2, Timișoara", locality: "Timișoara", lat: 45.754389, lng: 21.2260602, aliases: ["teatrul national", "sala mare tntm", "utu strugari", "studio utu strugari", "sala fabric"] },
  { key: "opera", name: "Opera Națională Română Timișoara", address: "Str. Mărășești nr. 2, Timișoara", locality: "Timișoara", lat: 45.7541, lng: 21.225943, aliases: ["opera nationala romana timisoara", "opera romana timisoara", "onr timisoara"] },
  { key: "teatrul-german", name: "Teatrul German de Stat Timișoara", address: "Str. Alba Iulia nr. 2, Timișoara", locality: "Timișoara", lat: 45.754378, lng: 21.2263816, aliases: ["teatrul german de stat", "teatrul german", "deutsches staatstheater"] },
  { key: "bastion", name: "Bastionul Maria Theresia", address: "Str. Hector / Str. Martin Luther, Timișoara", locality: "Timișoara", lat: 45.7569331, lng: 21.2346116, aliases: ["bastionul maria theresia", "bastionul theresia", "mansarda bastionului"] },
  { key: "muzeul-de-arta", name: "Muzeul Național de Artă Timișoara (Palatul Baroc)", address: "Piața Unirii nr. 1, Timișoara", locality: "Timișoara", lat: 45.7572258, lng: 21.2290794, aliases: ["muzeul de arta timisoara", "muzeul national de arta", "palatul baroc"] },
  { key: "academia-romana", name: "Academia Română – Filiala Timișoara", address: "Bd. Mihai Viteazu nr. 24, Timișoara", locality: "Timișoara", lat: 45.745328, lng: 21.2250983, aliases: ["academia romana - filiala timisoara", "academia romana filiala timisoara"] },
  { key: "primaria", name: "Primăria Municipiului Timișoara", address: "Bd. C.D. Loga nr. 1, Timișoara", locality: "Timișoara", lat: 45.7512016, lng: 21.226939, aliases: ["primaria municipiului timisoara", "sala de consiliu a primariei"] },
  { key: "muzeul-satului", name: "Muzeul Satului Bănățean", address: "Str. Avram Imbroane nr. 31, Timișoara", locality: "Timișoara", lat: 45.7790109, lng: 21.2644882, aliases: ["muzeul satului banatean", "muzeul satului"] },
  { key: "parcul-rozelor", name: "Parcul Rozelor", address: "Parcul Rozelor, Timișoara", locality: "Timișoara", lat: 45.7499905, lng: 21.2323892, aliases: ["parcul rozelor", "teatrul de vara"] },
  { key: "muzeul-banatului", name: "Muzeul Banatului (Castelul Huniade)", address: "Piața Iancu Huniade nr. 1, Timișoara", locality: "Timișoara", lat: 45.7530496, lng: 21.2270516, aliases: ["muzeul banatului", "castelul huniade"] },
  { key: "casa-tineretului", name: "Casa Tineretului", address: "Str. Arieș nr. 19, Timișoara", locality: "Timișoara", lat: 45.7411952, lng: 21.2397278, aliases: ["casa tineretului", "fitt"] },
  { key: "teatrul-merlin", name: "Teatrul pentru Copii și Tineret „Merlin”", address: "Bd. Regele Carol I nr. 3, Timișoara", locality: "Timișoara", lat: 45.7458014, lng: 21.2143715, aliases: ["teatrul merlin", "teatrul pentru copii si tineret merlin"] },
  { key: "iulius-town", name: "Iulius Town", address: "Piața Consiliul Europei nr. 2, Timișoara", locality: "Timișoara", lat: 45.7663807, lng: 21.2283909, aliases: ["iulius town", "iulius mall timisoara"] },
  { key: "muzeul-consumatorului", name: "Muzeul Consumatorului Comunist", address: "Str. Arh. László Székely, Timișoara", locality: "Timișoara", lat: 45.7432619, lng: 21.2243079, aliases: ["muzeul consumatorului comunist"] },
  { key: "fikl-art-stage", name: "Fikl Art Stage Gallery", address: "Str. Gheorghe Lazăr nr. 4, Timișoara", locality: "Timișoara", lat: 45.7579016, lng: 21.226602, aliases: ["fikl art stage gallery", "fikl art stage"] },
  { key: "faber", name: "FABER", address: "Splaiul Peneș Curcanul, Timișoara", locality: "Timișoara", lat: 45.7613915, lng: 21.2515801, aliases: ["faber", "faber timisoara"] },
  { key: "cinema-victoria", name: "Cinema Victoria", address: "Str. Coriolan Băran, Timișoara", locality: "Timișoara", lat: 45.7413111, lng: 21.2245278, aliases: ["cinema victoria"] },
  { key: "cinema-studio", name: "Cinema Studio", address: "Str. Nikolaus Lenau nr. 2, Timișoara", locality: "Timișoara", lat: 45.7524281, lng: 21.2260403, aliases: ["cinema studio"] },
  { key: "cinema-timis", name: "Cinema Timiș", address: "Piața Victoriei nr. 7, Timișoara", locality: "Timișoara", lat: 45.7515198, lng: 21.2255149, aliases: ["cinema timis"] },
];

const norm = (s: string) =>
  s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[„”"'’.,]/g, " ").replace(/\s+/g, " ").trim();

/** Exact-alias or contains-alias match on the venue NAME (addresses are geocoded instead). */
export function matchKnownVenue(name: string | null | undefined, extra: KnownVenue[] = []): KnownVenue | null {
  if (!name) return null;
  const n = norm(name);
  const all = [...extra, ...KNOWN_VENUES];
  for (const v of all) if ([v.name, ...v.aliases].some((a) => norm(a) === n)) return v;
  // Longest alias contained in the name wins ("Sala Capitol Timișoara" → sala capitol).
  let best: { v: KnownVenue; len: number } | null = null;
  for (const v of all)
    for (const a of v.aliases) {
      const na = norm(a);
      if (na.length >= 6 && new RegExp(`\\b${na.replace(/[-]/g, "\\-")}\\b`).test(n) && (!best || na.length > best.len)) best = { v, len: na.length };
    }
  return best?.v ?? null;
}
