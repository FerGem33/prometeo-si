// Spanish interface. Key: the English sentence exactly as written in the code; a missing key falls back to English.
import { FLOW } from "./flow";
import { REPORT } from "./report";
import { SHOWCASE } from "./showcase";

export const ES: Record<string, string> = { ...REPORT, ...FLOW, ...SHOWCASE };
