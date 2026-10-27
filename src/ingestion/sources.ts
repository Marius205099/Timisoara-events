/**
 * Source catalogue. Each entry was checked on 2026-10-27 for: public access
 * without login, robots.txt permission for the paths used, and a structured
 * format (API / iCal / JSON-LD / stable HTML). See docs/SOURCE_AUDIT.md.
 */
export interface SourceDef {
  id: string;
  name: string;
  homepage: string;
  adapter: "ical" | "tribe" | "jsonld" | "teatrul-german" | "visit-timisoara" | "manual";
  config: Record<string, unknown>;
  enabled: boolean;
  autoPublish: boolean;
  accessNotes: string;
}

export const SOURCES: SourceDef[] = [
  {
    id: "tntm",
    name: "Teatrul Național Timișoara",
    homepage: "https://www.tntm.ro",
    adapter: "ical",
    config: { url: "https://www.tntm.ro/events.ics", organizer: "Teatrul Național „Mihai Eminescu” Timișoara", categoryHints: ["teatru"] },
    enabled: true,
    autoPublish: true,
    accessNotes: "Official iCal export (WP Events Manager) with GEO per venue. robots.txt: Allow /.",
  },
  {
    id: "filarmonica-banatul",
    name: "Filarmonica Banatul Timișoara",
    homepage: "https://filarmonicabanatul.ro",
    adapter: "tribe",
    config: { baseUrl: "https://filarmonicabanatul.ro", maxPages: 4, categoryHints: ["concert"] },
    enabled: true,
    autoPublish: true,
    accessNotes: "Official public REST API of The Events Calendar (/wp-json/tribe/events/v1). robots.txt disallows only /wp-admin/.",
  },
  {
    id: "teatrul-german",
    name: "Teatrul German de Stat Timișoara",
    homepage: "https://teatrulgerman.ro",
    adapter: "teatrul-german",
    config: { url: "https://teatrulgerman.ro/ro/program/" },
    enabled: true,
    autoPublish: true,
    accessNotes: "Public programme page (HTML). No robots.txt restrictions. Touring dates outside 50 km are rejected by the geofence.",
  },
  {
    id: "iabilet",
    name: "iaBilet.ro",
    homepage: "https://www.iabilet.ro",
    adapter: "jsonld",
    config: {
      listUrls: [
        "https://www.iabilet.ro/bilete-in-timisoara/",
        "https://www.iabilet.ro/bilete-in-timisoara/bilete-concerte/",
        "https://www.iabilet.ro/bilete-in-timisoara/bilete-teatru/",
        "https://www.iabilet.ro/bilete-in-timisoara/bilete-stand-up-comedy/",
        "https://www.iabilet.ro/bilete-in-timisoara/bilete-festivaluri/",
        "https://www.iabilet.ro/bilete-in-timisoara/bilete-pentru-copii/",
      ],
      linkPattern: "^/bilete-[a-z0-9-]+-\\d+/$",
      excludePattern: "-venue-\\d+/$|voucher",
      maxEvents: 80,
    },
    enabled: true,
    autoPublish: true,
    accessNotes:
      "Ticketing platform; schema.org Event JSON-LD on public event pages. robots.txt allows these paths (disallows /cos/, /account/ etc.). Events in other cities are rejected by the geofence. Review terms of use before commercial use.",
  },
  {
    id: "visit-timisoara",
    name: "Visit Timișoara (Primăria Timișoara)",
    homepage: "https://visit-timisoara.com/ro/evenimente-si-activitati/",
    adapter: "visit-timisoara",
    config: { baseUrl: "https://visit-timisoara.com", maxPages: 3, maxFollow: 40 },
    enabled: true,
    autoPublish: true,
    accessNotes:
      "Official tourism portal of the City of Timișoara (OMD Timișoara / Primăria). Public WordPress REST API /wp-json/wp/v2/events-visit; robots.txt disallows only /wp-admin/. Records have no venue: it is read from the ticket page's schema.org data or the venue registry, otherwise the event goes to review.",
  },
  {
    id: "zilesinopti",
    name: "Zile și Nopți Timișoara",
    homepage: "https://zilesinopti.ro/evenimente-timisoara/",
    adapter: "jsonld",
    config: {
      listUrls: [
        "https://zilesinopti.ro/evenimente-timisoara/",
        "https://zilesinopti.ro/evenimente-timisoara-weekend/",
        "https://zilesinopti.ro/evenimente-copii-timisoara/",
        "https://zilesinopti.ro/junior-timisoara/",
        "https://zilesinopti.ro/timisoara/cultura-timisoara/",
      ],
      dayListUrl: "https://zilesinopti.ro/evenimente-timisoara/?zi={date}",
      days: 21,
      linkPattern: "^/evenimente/[a-z0-9-]+/$",
      maxEvents: 150,
    },
    enabled: true,
    autoPublish: true,
    accessNotes:
      "City guide (Timișoara edition). Event pages publish schema.org Event JSON-LD with venue address and coordinates, one node per performance. robots.txt disallows only /wp-admin/.",
  },
  {
    id: "timisoreni",
    name: "Timisoreni.ro",
    homepage: "https://www.timisoreni.ro/hub/evenimente/",
    adapter: "jsonld",
    config: {
      listUrls: ["https://www.timisoreni.ro/hub/evenimente/"],
      linkPattern: "^/despre/[a-z0-9-]+/$",
      // Daily multiplex film listings are not events.
      excludeVenuePattern: "^Cinema City",
      maxEvents: 40,
    },
    enabled: true,
    autoPublish: true,
    accessNotes:
      "Local city portal. The events hub lists schema.org Events (ItemList) with venue names; detail pages give exact times. robots.txt disallows only /editeaza/, /adauga/, /oauth/.",
  },
  {
    id: "faber",
    name: "FABER Timișoara",
    homepage: "https://faber.ro/ro/evenimente/",
    adapter: "jsonld",
    config: {
      listUrls: ["https://faber.ro/ro/", "https://faber.ro/ro/evenimente/"],
      linkPattern: "^/ro/evenimente/[a-z0-9-]+/$",
      venueNamePrefix: "FABER Timișoara",
      maxEvents: 30,
    },
    enabled: true,
    autoPublish: true,
    accessNotes: "Cultural hub (former factory). Event pages publish schema.org Event JSON-LD. No robots.txt restrictions.",
  },
  {
    id: "submissions",
    name: "Trimiteri organizatori",
    homepage: "/adauga-eveniment",
    adapter: "manual",
    config: {},
    enabled: true,
    autoPublish: false,
    accessNotes: "Public submission form — always moderated.",
  },
  {
    id: "admin",
    name: "Redacția Ce Facem în Timișoara",
    homepage: "/",
    adapter: "manual",
    config: {},
    enabled: true,
    autoPublish: false,
    accessNotes: "Manual entries by administrators.",
  },
];
