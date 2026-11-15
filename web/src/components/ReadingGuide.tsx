import { useRef } from "react";
import { useData } from "./ctx";

/** A quiet link that opens the reading notes in a dialog. The notes are still printed with the report. */
export function ReadingGuide() {
  const { lens } = useData();
  const dialog = useRef<HTMLDialogElement>(null);
  return (
    <>
      <button type="button" className="guide-link noprint" onClick={() => dialog.current?.showModal()}>
        How to read this summary
      </button>
      <dialog
        ref={dialog}
        className="modal"
        aria-labelledby="guide-title"
        onClick={(e) => {
          if (e.target === dialog.current) dialog.current?.close();
        }}
      >
        <div className="guide">
          <h2 id="guide-title">How to read this report</h2>
          <p>
            Every recorded test is placed in the space of experimental conditions and compared with the scenario. Change a value and every figure, table and sentence is recomputed in the browser. Underlined values open their source: file, row, original text, conversion and dataset DOI. Sections marked with + open the full tables.
          </p>
          <h3>Grades</h3>
          <ul>
            <li>
              <b>A</b> · a comparable record lies within one σ-distance and nothing is missing.
            </li>
            <li>
              <b>B</b> · inside the tested range, with missing variables or a larger distance.
            </li>
            <li>
              <b>C</b> · outside the tested range.
            </li>
            <li>
              <b>D</b> · no comparable record.
            </li>
          </ul>
          <p className="guide-note">{lens.disclaimer}</p>
          <div className="modal-actions">
            <button type="button" className="cta" onClick={() => dialog.current?.close()}>
              Close
            </button>
          </div>
        </div>
      </dialog>
    </>
  );
}
