// Spanish interface. Key: the English sentence exactly as written in the code; a missing key falls back to English.
import { FLOW } from "./flow";
import { NASA } from "./nasa";
import { REPORT } from "./report";
import { SHOWCASE } from "./showcase";
import { UPLOAD } from "./upload";
import { WORKSPACE } from "./workspace";

export const ES: Record<string, string> = { ...REPORT, ...FLOW, ...SHOWCASE, ...UPLOAD, ...WORKSPACE, ...NASA };
