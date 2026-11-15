import type { DataRecord } from "../engine/types";
import type { Mapping } from "../components/ctx";

export type OutcomeValue = { value: string; records: DataRecord[] };
export type OutcomeSummary = {
  study: string;
  sourceId: string;
  kind: DataRecord["kind"];
  column: string;
  unit: string | null;
  denominator: number;
  records: DataRecord[];
  observed: DataRecord[];
  missing: number;
  missingRecords: DataRecord[];
  values: OutcomeValue[];
  duplicateCandidates: DataRecord[];
  inputComplete: number;
  inputTotal: number;
  inputCompleteRecords: DataRecord[];
  unitsSpecified: number;
  unitsTotal: number;
};

/** Describes approved outcome columns independently; it never merges labels or units. */
export function summarizeOutcomes(records: DataRecord[], mapping: Mapping): OutcomeSummary[] {
  const columns = new Map<string, { column: string; unit: string | null }[]>();
  for (const table of mapping.tables) {
    columns.set(table.source, table.columns
      .filter((column) => column.role === "outcome" && column.status === "approved")
      .map((column) => ({ column: column.column, unit: column.unit?.trim() || null })));
  }

  const groups = new Map<string, OutcomeSummary>();
  for (const record of records) {
    const outcomes = columns.get(record.source.id) ?? [];
    const inputCols = mapping.tables.find((table) => table.source === record.source.id)?.columns
      .filter((column) => column.status === "approved" && column.variable) ?? [];
    for (const outcome of outcomes) {
      const key = JSON.stringify([record.study, record.source.id, record.kind, outcome.column]);
      let group = groups.get(key);
      if (!group) {
        group = {
          study: record.study, sourceId: record.source.id, kind: record.kind,
          column: outcome.column, unit: outcome.unit, denominator: 0, records: [], observed: [], missing: 0, missingRecords: [],
          values: [], duplicateCandidates: [], inputComplete: 0, inputTotal: 0,
          inputCompleteRecords: [],
          unitsSpecified: inputCols.filter((column) => column.unit?.trim()).length,
          unitsTotal: inputCols.length,
        };
        groups.set(key, group);
      }
      group.denominator += 1;
      group.records.push(record);
      const value = record.outcomes?.[outcome.column]?.trim();
      if (!value) {
        group.missing += 1;
        group.missingRecords.push(record);
        continue;
      }
      group.observed.push(record);
      const valueGroup = group.values.find((item) => item.value === value);
      if (valueGroup) valueGroup.records.push(record);
      else group.values.push({ value, records: [record] });
      group.inputTotal += 1;
      if (inputCols.every((column) => column.variable && record.values[column.variable] !== undefined && record.values[column.variable] !== "")) {
        group.inputComplete += 1;
        group.inputCompleteRecords.push(record);
      }
    }
  }

  // Candidate only: exact matching normalized inputs and raw outcome across distinct files.
  const signatures = new Map<string, Set<string>>();
  for (const group of groups.values()) {
    for (const record of group.observed) {
      const value = record.outcomes?.[group.column]?.trim();
      if (!value) continue;
      const signature = JSON.stringify([record.study, record.kind, group.column, record.values, value]);
      const sources = signatures.get(signature) ?? new Set<string>();
      sources.add(record.source.id);
      signatures.set(signature, sources);
    }
    group.values.sort((a, b) => a.value.localeCompare(b.value, "en"));
  }
  const repeated = new Set([...signatures].filter(([, sources]) => sources.size > 1).map(([signature]) => signature));
  for (const group of groups.values()) {
    group.duplicateCandidates = group.observed.filter((record) =>
      repeated.has(JSON.stringify([record.study, record.kind, group.column, record.values, record.outcomes?.[group.column]?.trim()])),
    );
  }
  return [...groups.values()].sort((a, b) =>
    a.study.localeCompare(b.study, "en") || a.sourceId.localeCompare(b.sourceId, "en") || a.column.localeCompare(b.column, "en"),
  );
}
