import { ChamberFigure } from "./ChamberFigure";
import { HabitatFigure } from "./HabitatFigure";
import type { NasaApparatusKind } from "../ingest/nasaDetect";
import type { Preset } from "../engine";
import { t } from "../i18n";

export interface NasaInfo {
  apparatus: NasaApparatusKind;
  matched: string[];
  /** Habitat scenarios of the reference pack; no longer offered in the wizard, shown first in the report. */
  scenarios?: Preset[];
}

/** Reference habitat scenarios drawn for context. Illustrative only: they are not compared with the uploaded corpus. */
export function ReferenceScenarios({ scenarios }: { scenarios: Preset[] }) {
  if (scenarios.length === 0) return null;
  return (
    <figure className="ref-scenarios">
      <div className="ref-scenarios-grid">
        {scenarios.map((p) => (
          <div key={p.id} className="ref-scn">
            <HabitatFigure name={p.id} size="sm" />
            <b>{p.label}</b>
            {p.source && <small>{p.source}</small>}
          </div>
        ))}
      </div>
      <figcaption>
        <b>{t("Reference scenarios")}</b>{" "}
        {t("Scenarios of the reference pack, drawn for context. Their values come from the cited source; they are not compared with the uploaded corpus, whose variables differ.")}
      </figcaption>
    </figure>
  );
}

/** Isometric apparatus for a space-research corpus. Illustrates the experiment type only; it shows no measured value. */
export function NasaApparatus({ apparatus, matched, compact = false }: NasaInfo & { compact?: boolean }) {
  return (
    <figure className="nasa-apparatus">
      {apparatus === "chamber" ? (
        <ChamberFigure interactive={!compact} />
      ) : (
        <HabitatFigure name="lunar_base" size={compact ? "sm" : "lg"} />
      )}
      <figcaption>
        <b>{apparatus === "chamber" ? t("Experimental apparatus · microgravity combustion chamber") : t("Experimental setting · pressurized habitat")}</b>{" "}
        {t("Detected in the uploaded corpus: {0}.", matched.join(", "))}{" "}
        {t("The diagram illustrates the type of apparatus the documents describe; it is not a measured result.")}
      </figcaption>
    </figure>
  );
}
