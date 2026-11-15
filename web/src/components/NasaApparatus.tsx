import { ChamberFigure } from "./ChamberFigure";
import { HabitatFigure } from "./HabitatFigure";
import type { NasaApparatusKind } from "../ingest/nasaDetect";
import { t } from "../i18n";

export interface NasaInfo {
  apparatus: NasaApparatusKind;
  matched: string[];
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
