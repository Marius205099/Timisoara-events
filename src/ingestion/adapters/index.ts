import type { SourceAdapter } from "../types";
import { icalAdapter } from "./ical";
import { jsonLdAdapter } from "./jsonld";
import { teatrulGermanAdapter } from "./teatrul-german";
import { tribeAdapter } from "./tribe";
import { visitTimisoaraAdapter } from "./visit-timisoara";
import { mallAdapter } from "./malls";
import { pressAdapter } from "./press";

export const ADAPTERS: Record<string, SourceAdapter> = {
  [icalAdapter.id]: icalAdapter,
  [tribeAdapter.id]: tribeAdapter,
  [jsonLdAdapter.id]: jsonLdAdapter,
  [teatrulGermanAdapter.id]: teatrulGermanAdapter,
  [visitTimisoaraAdapter.id]: visitTimisoaraAdapter,
  [mallAdapter.id]: mallAdapter,
  [pressAdapter.id]: pressAdapter,
};
