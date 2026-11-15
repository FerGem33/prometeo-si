# Respuestas de ejemplo del backend del bloque C

Sirven para construir las pantallas de CU-05 a CU-08 antes de que exista el backend. Cumplen los tipos de `web/src/contracts/backend.ts` y se explican en `docs/CONTRATOS_FASE2.md` §5.

Todos los valores salen del pack real (tabla `PSI-25_Experimental table_BASS-II.csv` y su mapeo aprobado): no hay números inventados. Los identificadores (`prj_demo`, `doc_bass2_table`) y las fechas son de ejemplo.

| Archivo | Ruta que simula |
|---|---|
| `projects.json` | `GET /projects` |
| `documents.json` | `GET /projects/{id}/documents` |
| `jobs.json` | `GET /projects/{id}/jobs` |
| `schema_proposal.json` | `GET /projects/{id}/schema` |
| `records.json` | `GET /projects/{id}/records?limit=5` |

No hay ejemplo con cita de artículo (`kind: "paper"`): aún no se ha extraído ninguna de un PDF real y no se inventan citas.

En `schema_proposal.json`, las columnas sin variable (incluidas las de identificador y fecha) aparecen como `rejected`: el contrato aún no distingue "no usada" de "usada como etiqueta". Si la pantalla lo necesita, se agrega un campo `role` al contrato.
