import type { SourceAdapter } from "../types";
import { icalAdapter } from "./ical";
import { jsonLdAdapter } from "./jsonld";
import { teatrulGermanAdapter } from "./teatrul-german";
import { tribeAdapter } from "./tribe";
import { visitTimisoaraAdapter } from "./visit-timisoara";

export const ADAPTERS: Record<string, SourceAdapter> = {
  [icalAdapter.id]: icalAdapter,
  [tribeAdapter.id]: tribeAdapter,
  [jsonLdAdapter.id]: jsonLdAdapter,
  [teatrulGermanAdapter.id]: teatrulGermanAdapter,
  [visitTimisoaraAdapter.id]: visitTimisoaraAdapter,
};
