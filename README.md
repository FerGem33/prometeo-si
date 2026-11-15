# Prometeo

Prometeo is an interactive evidence report for the NASA Space Apps 2026 challenge, *Flame in Freefall*. It compares a proposed atmosphere and material with recorded combustion experiments. It describes what has been studied; it does not predict whether a material will ignite or whether a flame will spread.

## Demo

[Open the public report](https://dursf4nho4zl6.cloudfront.net)

The CloudFront site is live. The latest source changes still need the project owner's final web deployment before this URL reflects them.

## Use the report

1. Choose a preset or edit the scenario controls for oxygen, pressure, flow, gravity, and material.
2. Read the evidence levels, figures, findings, and study ranking. Select a linked value to open its source file, row, original value, and dataset DOI.
3. Ask a question about scenario conditions, or read the Analysis section. Analysis sentences include supporting sources; when the API is unavailable the report labels its rule-based text as a template.

## Evidence and method

The report uses NASA Physical Sciences Informatics (PSI) Combustion Science records. The current pack contains 24 investigations, 22 experimental tables, 1,889 individual tests, and 97 campaign rows. The PSI dataset is identified as CC0 in the source metadata; dataset DOIs appear with each investigation in the report.

Grades, evidence levels, findings, and comparisons are computed deterministically in the browser from the versioned evidence pack and the human-reviewed column mapping. In the published runtime, Bedrock is used only to interpret scenario-condition questions and draft sourced analysis. It does not calculate grades, infer missing measurements, or make ignition predictions.

Examples of scope: the 268 solid-fuel tests in the current pack contain no recorded pressure; the highest oxygen concentration among those tests is 22.2% in BASS-II. These are statements about this dataset's coverage, not conclusions about untested conditions.

## Scope

This MVP includes an interactive report, provenance links, PDF printing, scenario questions, and source-backed analysis. It does not include user accounts, file uploads, content-question answering, or an ML model trained on these records. The ML data card is descriptive: no approved target classes or model-suitability thresholds are defined.

The latest source build must be published by the project owner before the public URL can be used to verify the final acceptance checklist. See [`infra/README.md`](infra/README.md) for the deployment and contributor handoff steps.
