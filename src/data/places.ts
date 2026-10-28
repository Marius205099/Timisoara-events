/**
 * Places to visit and things to do any day (not one-off events), shown in the
 * "Locuri & activități" section. Curated by hand on 2026-10-28.
 * Coordinates were checked against OpenStreetMap (Nominatim); `approx` marks a place whose pin is
 * the surrounding area (forest, park) because the map has no exact point for it. Addresses and
 * websites come from the operators' own sites where one exists. Opening hours and prices are NOT
 * stored here: they change, so the page sends visitors to the official site.
 * Every place must be within 50 km of the centre of Timișoara (re-checked by the build).
 */

export type PlaceCategory = "copii" | "sport" | "muzee" | "natura" | "repere" | "excursii";
export type AgeGroupId = "0-2" | "3-7" | "8-12" | "13-17" | "18-64" | "65+";

export interface Place {
  id: string;
  name: string;
  cat: PlaceCategory;
  desc: string;
  address: string;
  locality: string;
  lat: number;
  lng: number;
  approx?: boolean;
  url?: string;
  ages: AgeGroupId[];
  io: "indoor" | "outdoor" | "mixed";
  free?: boolean;
}

export const PLACE_CATEGORIES: Record<PlaceCategory, string> = {
  copii: "Copii & familie",
  sport: "Sport & aventură",
  muzee: "Muzee",
  natura: "Parcuri & natură",
  repere: "Repere & arhitectură",
  excursii: "Excursii (sub 50 km)",
};

const ALL: AgeGroupId[] = ["0-2", "3-7", "8-12", "13-17", "18-64", "65+"];
const FROM_3: AgeGroupId[] = ["3-7", "8-12", "13-17", "18-64", "65+"];
const FROM_8: AgeGroupId[] = ["8-12", "13-17", "18-64", "65+"];
const ADULTS: AgeGroupId[] = ["18-64", "65+"];

export const PLACES: Place[] = [
  // ---------- Copii & familie ----------
  {
    id: "muzeul-interactiv-al-copiilor", name: "Muzeul Interactiv al Copiilor (MIC)", cat: "copii",
    desc: "Primul muzeu interactiv pentru copii din Timișoara, despre istoria orașului: instalații cu senzori, proiecții, puzzle-uri 3D și ateliere. Pentru copii de la câteva luni până la 14 ani.",
    address: "Bastionul Maria Theresia, Str. Hector / Str. Martin Luther", locality: "Timișoara", lat: 45.7569331, lng: 21.2346116,
    url: "https://visit-timisoara.com/", ages: ["0-2", "3-7", "8-12", "13-17"], io: "indoor",
  },
  {
    id: "green-kart", name: "Green Kart", cat: "copii",
    desc: "Karting electric indoor pentru copii de 3–14 ani, cu două circuite: unul pentru 3–8 ani și unul pentru 8–14 ani.",
    address: "Str. Albăstrelelor nr. 6A, Cartierul Plopi", locality: "Timișoara", lat: 45.7480092, lng: 21.2795762,
    url: "https://greenkart.ro/", ages: ["3-7", "8-12", "13-17"], io: "indoor",
  },
  {
    id: "parcul-copiilor", name: "Parcul Copiilor „Ion Creangă”", cat: "copii",
    desc: "Parc central amenajat pentru copii, cu locuri de joacă, lângă Bastion și Parcul Rozelor.",
    address: "Parcul Copiilor Ion Creangă", locality: "Timișoara", lat: 45.752719, lng: 21.2373526,
    ages: ALL, io: "outdoor", free: true,
  },
  {
    id: "liziera-park", name: "L'iziera Park", cat: "copii",
    desc: "Parc de agrement privat în Pădurea Bistra: trambulină, tiroliană, tobogane, trasee de îndemânare, zone cu nisip, hamace și două lacuri cu pontoane. Se poate ajunge și pe pista de biciclete spre Ghiroda.",
    address: "Pădurea Bistra, lângă Ghiroda", locality: "Ghiroda", lat: 45.7624675, lng: 21.3426298, approx: true,
    ages: ["3-7", "8-12", "13-17", "18-64"], io: "outdoor",
  },

  // ---------- Sport & aventură ----------
  {
    id: "red-motor", name: "Red Motor Karting", cat: "sport",
    desc: "Circuit de karting cu porțiune indoor și outdoor (420 m doar indoor, 720 m complet), cronometrare pe fiecare tur, karturi termice sau electrice; are și program pentru copii.",
    address: "Str. Ovidiu Cotruș nr. 30, Freidorf", locality: "Timișoara", lat: 45.7151902, lng: 21.1901962,
    url: "https://redmotor.ro/", ages: FROM_8, io: "mixed",
  },
  {
    id: "vmax-karting", name: "VMax Electric Indoor Karting", cat: "sport",
    desc: "Karting electric indoor pe un circuit pe mai multe niveluri, bun și pentru zilele ploioase; are evenimente pentru adulți și juniori.",
    address: "Calea Stan Vidrighin nr. 5", locality: "Timișoara", lat: 45.7384881, lng: 21.2587191,
    url: "https://vmaxtimisoara.ro/", ages: FROM_8, io: "indoor",
  },
  {
    id: "one-move-nord", name: "One Move Nord — sală de escaladă", cat: "sport",
    desc: "Sală de escaladă și bouldering a clubului One Move, cu trasee pentru toate nivelurile, inclusiv începători.",
    address: "Str. Marginii nr. 4", locality: "Timișoara", lat: 45.7874767, lng: 21.2242228,
    url: "https://onemove.ro/", ages: FROM_8.filter((a) => a !== "65+") as AgeGroupId[], io: "indoor",
  },
  {
    id: "one-move-sagului", name: "One Move Șagului — sală de escaladă", cat: "sport",
    desc: "A doua sală One Move, pentru bouldering; aici s-au ținut și etape ale Cupei României. Intrarea este prin curtea interioară.",
    address: "Bd. 16 Decembrie 1989 nr. 75", locality: "Timișoara", lat: 45.7376895, lng: 21.2102147,
    url: "https://onemove.ro/", ages: FROM_8.filter((a) => a !== "65+") as AgeGroupId[], io: "indoor",
  },

  // ---------- Muzee ----------
  {
    id: "muzeul-banatului", name: "Muzeul Național al Banatului — Castelul Huniade", cat: "muzee",
    desc: "Muzeul de istorie al Banatului, în cea mai veche clădire a orașului, Castelul Huniade.",
    address: "Piața Iancu Huniade nr. 1", locality: "Timișoara", lat: 45.7530496, lng: 21.2270516,
    url: "https://www.muzeulbanatului.ro/", ages: FROM_3, io: "indoor",
  },
  {
    id: "muzeul-de-arta", name: "Muzeul Național de Artă — Palatul Baroc", cat: "muzee",
    desc: "Colecții de artă românească și europeană în Palatul Baroc din Piața Unirii, plus expoziții temporare.",
    address: "Piața Unirii nr. 1", locality: "Timișoara", lat: 45.7572258, lng: 21.2290794,
    url: "https://www.muzeuldeartatm.ro/", ages: FROM_8, io: "indoor",
  },
  {
    id: "muzeul-satului", name: "Muzeul Satului Bănățean", cat: "muzee",
    desc: "Muzeu în aer liber cu gospodării tradiționale bănățene, biserică de lemn și ateliere, la marginea Pădurii Verzi.",
    address: "Str. Avram Imbroane nr. 31", locality: "Timișoara", lat: 45.7790109, lng: 21.2644882,
    url: "https://muzeulsatuluibanatean.ro/", ages: ALL, io: "outdoor",
  },
  {
    id: "memorialul-revolutiei", name: "Memorialul Revoluției 16–22 Decembrie 1989", cat: "muzee",
    desc: "Muzeu și centru de documentare despre Revoluția din 1989, care a început la Timișoara.",
    address: "Str. Toró Tibor", locality: "Timișoara", lat: 45.7601932, lng: 21.231755,
    url: "https://www.memorialulrevolutiei.ro/", ages: ["13-17", "18-64", "65+"], io: "indoor",
  },
  {
    id: "muzeul-consumatorului", name: "Muzeul Consumatorului Comunist", cat: "muzee",
    desc: "Colecție de obiecte de zi cu zi din perioada comunistă, amenajată ca o locuință a anilor '70–'80.",
    address: "Str. Arh. László Székely", locality: "Timișoara", lat: 45.7432619, lng: 21.2243079,
    ages: FROM_8, io: "indoor",
  },
  {
    id: "bastionul", name: "Bastionul Maria Theresia", cat: "muzee",
    desc: "Cel mai mare fragment păstrat al fortificațiilor Timișoarei, cu spații de expoziție, cafenele și Muzeul Interactiv al Copiilor.",
    address: "Str. Hector / Str. Martin Luther", locality: "Timișoara", lat: 45.7569331, lng: 21.2346116,
    ages: ALL, io: "mixed",
  },
  {
    id: "muzeul-presei-jimbolia", name: "Muzeul Presei „Sever Bocu”", cat: "excursii",
    desc: "Muzeu dedicat istoriei presei, cu colecții de ziare și reviste vechi, în orașul Jimbolia.",
    address: "Str. Lorena nr. 35", locality: "Jimbolia", lat: 45.7895257, lng: 20.7249154,
    ages: ["13-17", "18-64", "65+"], io: "indoor",
  },

  // ---------- Parcuri & natură ----------
  {
    id: "parcul-rozelor", name: "Parcul Rozelor", cat: "natura",
    desc: "Parcul emblematic al „orașului trandafirilor”, pe malul Begăi, cu mii de trandafiri și Teatrul de Vară.",
    address: "Parcul Rozelor", locality: "Timișoara", lat: 45.7499905, lng: 21.2323892, ages: ALL, io: "outdoor", free: true,
  },
  {
    id: "parcul-central", name: "Parcul Central", cat: "natura",
    desc: "Parc mare în centrul orașului, cu alei umbrite, locuri de joacă și bănci, lângă Catedrala Mitropolitană.",
    address: "Bd. 16 Decembrie 1989", locality: "Timișoara", lat: 45.7511492, lng: 21.2233911, ages: ALL, io: "outdoor", free: true,
  },
  {
    id: "parcul-botanic", name: "Parcul Botanic", cat: "natura",
    desc: "Grădină cu specii de plante din toată lumea, sere și alei liniștite, potrivită pentru plimbări.",
    address: "Parcul Botanic", locality: "Timișoara", lat: 45.7601991, lng: 21.2248472, ages: ALL, io: "outdoor", free: true,
  },
  {
    id: "parcul-regina-maria", name: "Parcul Regina Maria", cat: "natura",
    desc: "Parc pe malul Begăi, în cartierul Fabric, bun pentru plimbări de-a lungul râului.",
    address: "Parcul Regina Maria, Fabric", locality: "Timișoara", lat: 45.7554665, lng: 21.2424264, ages: ALL, io: "outdoor", free: true,
  },
  {
    id: "padurea-verde", name: "Pădurea Verde și Grădina Zoologică", cat: "natura",
    desc: "Pădurea din estul orașului, cu alei, zonă de picnic, Grădina Zoologică și Muzeul Satului Bănățean în apropiere.",
    address: "Pădurea Verde", locality: "Timișoara", lat: 45.7847877, lng: 21.2643508, approx: true, ages: ALL, io: "outdoor",
  },

  // ---------- Repere & arhitectură ----------
  {
    id: "piata-unirii", name: "Piața Unirii", cat: "repere",
    desc: "Piața barocă a orașului, cu Domul romano-catolic, Palatul Baroc și Coloana Ciumei; înconjurată de terase.",
    address: "Piața Unirii", locality: "Timișoara", lat: 45.7579403, lng: 21.2298369, ages: ALL, io: "outdoor", free: true,
  },
  {
    id: "piata-victoriei", name: "Piața Victoriei și Opera", cat: "repere",
    desc: "Bulevardul pietonal dintre Operă și Catedrala Mitropolitană, locul Revoluției din 1989.",
    address: "Piața Victoriei", locality: "Timișoara", lat: 45.7526802, lng: 21.2254959, ages: ALL, io: "outdoor", free: true,
  },
  {
    id: "catedrala-mitropolitana", name: "Catedrala Mitropolitană", cat: "repere",
    desc: "Catedrala ortodoxă a orașului, cu acoperiș din țiglă colorată, la capătul Pieței Victoriei.",
    address: "Bd. Regele Ferdinand I", locality: "Timișoara", lat: 45.7516842, lng: 21.223276, ages: ALL, io: "indoor", free: true,
  },
  {
    id: "domul", name: "Domul Sfântul Gheorghe (romano-catolic)", cat: "repere",
    desc: "Catedrala romano-catolică barocă din Piața Unirii.",
    address: "Piața Unirii", locality: "Timișoara", lat: 45.7581288, lng: 21.2303957, ages: ALL, io: "indoor", free: true,
  },
  {
    id: "sinagoga-din-cetate", name: "Sinagoga din Cetate", cat: "repere",
    desc: "Sinagogă în stil maur din secolul XIX, restaurată, folosită și pentru evenimente culturale.",
    address: "Str. Mărășești nr. 6", locality: "Timișoara", lat: 45.7564667, lng: 21.2261282, ages: FROM_8, io: "indoor",
  },
  {
    id: "turnul-de-apa-iosefin", name: "Turnul de Apă Iosefin", cat: "repere",
    desc: "Turn de apă de la începutul secolului XX, simbol al cartierului Iosefin.",
    address: "Splaiul Nicolae Titulescu", locality: "Timișoara", lat: 45.7453739, lng: 21.2015496, ages: ALL, io: "mixed",
  },

  // ---------- Excursii (sub 50 km) ----------
  {
    id: "cramele-recas", name: "Cramele Recaș", cat: "excursii",
    desc: "Una dintre cele mai mari crame din țară, la circa 25 km de Timișoara; vizite și degustări pentru adulți.",
    address: "DC66, Recaș", locality: "Recaș", lat: 45.8273196, lng: 21.5257433,
    url: "https://www.recaswine.ro/", ages: ADULTS, io: "mixed",
  },
  {
    id: "parcul-buzias", name: "Parcul Dendrologic Buziaș", cat: "excursii",
    desc: "Parcul stațiunii balneare Buziaș, cu arbori seculari și colonada de lemn, la circa 35 km de Timișoara.",
    address: "Parcul Dendrologic, Buziaș", locality: "Buziaș", lat: 45.6502524, lng: 21.6033832, ages: ALL, io: "outdoor", free: true,
  },
];
