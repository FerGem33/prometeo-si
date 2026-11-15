# Revisión humana final pendiente

Consolidado por instrucción del dueño: avanzar técnicamente por etapas y dejar las decisiones de datos y producto para
revisión humana. No se infieren aprobaciones de mensajes de continuidad. El 15-nov el dueño cerró casi todas
(`D7_DECISIONES.md` y `DECISIONES_CIERRE.md`).

## Abiertas

| Revisión | Evidencia concreta | Resultado que debe registrar una persona |
|---|---|---|
| Soporte semántico y alcance de los PDF (T32) | Candidatos y rechazos de `T32_EVALUACION.md`; artefactos en `/tmp/prometeo-t32/` de la laptop AWS; parser nuevo en `T34_WORKER_PREPARACION.md` | Firmar `T32_PDF_DECISIONES.md` (la prepara un agente en la laptop AWS, `RELEVO_LAPTOP_AWS.md` §5): la cita respalda valor, unidad y experimentos. No propagar presión a todas las filas sin evidencia |
| Fuente, esquema y versiones (T35/T37) | Propuesta conjunta, cuando el worker la genere | Aprobación explícita de la versión, vinculada a hashes; nunca la emite el modelo |

## Cerradas el 2026-11-15 (Daniel Sun)

| Revisión | Dónde | Resultado |
|---|---|---|
| D7: discrepancias de mapping | `D7_DECISIONES.md` | Mapping vigente conservado en las 79 filas |
| T30: resto del contrato C | `DECISIONES_CIERRE.md` §1 | Aprobado; se añade §5.10 (exportación para ML → T38) |
| D4: ficha ML | `DECISIONES_CIERRE.md` §2 | Cuatro veredictos con umbrales de partida en `lens` |
| D10: segundo dominio | `DECISIONES_CIERRE.md` §3 | Ebullición y cambio de fase (PSI, Fluid Physics); lote de 23 documentos |
| Costos y operación | `DECISIONES_CIERRE.md` §5 | Tope operativo de USD 30 en Bedrock; reintentos SQS ×3 → DLQ, sin reenvío automático |
| Permiso `s3:ListBucket` del worker | `DECISIONES_CIERRE.md` §4 | Aprobado, solo sobre el bucket de corpus |
| CORS con localhost | `DECISIONES_CIERRE.md` §6 | Solo CloudFront por defecto |

Las APIs de revisión se pueden implementar antes. La extracción y la publicación siguen bloqueadas hasta que se
apruebe la versión correspondiente. No se publican candidatos PDF ni se da T32 por hecha sin su revisión. Ni la
aprobación de límites ni un deploy exitoso aprueban contenido científico.

Los permisos administrativos de AWS (`t33-deployer-policy.json`, `t34-deployer-policy.json`) son una acción operativa
distinta de esta revisión.
