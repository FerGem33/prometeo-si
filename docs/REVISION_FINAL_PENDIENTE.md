# Revisión humana final pendiente

Consolidado por instrucción del dueño: avanzar técnicamente por etapas y dejar
las decisiones de datos/producto para revisión final. No se infieren aprobaciones
de mensajes de continuidad. D3 sí está aprobada: 20 MB/60 páginas/30 documentos.

| Revisión | Evidencia concreta | Resultado que debe registrar una persona |
|---|---|---|
| D7: discrepancias de mapping | `T32_EVALUACION.md` y `agnostic_proof.md` | Decisión por discrepancia, responsable y razón; conservar referencia anterior |
| Soporte semántico y alcance PDF | Candidatos y rechazos de `T32_EVALUACION.md`; parser nuevo en `T34_WORKER_PREPARACION.md` | Cita respalda valor/unidad/experimentos; texto legible cuando haga falta. No propagar presión a todas las filas sin evidencia |
| T30: resto del contrato C | `CONTRATOS_FASE2.md` §5 y límites técnicos documentados | Aprobación/corrección explícita de las partes aún no aprobadas |
| T12/T27, D4 | Ficha ML descriptiva y criterios propuestos | Definir clases destino/umbrales antes de afirmar aptitud ML |
| D10, segundo dominio | Corpus público a seleccionar para T37 | Dominio, fuentes, responsable y referencias aprobadas |
| Fuente/esquema/versiones | Propuesta conjunta cuando esté generada | Aprobación explícita de versión vinculada a hashes; nunca aprobación emitida por el modelo |
| Costos y operación | `T33_CARGAS_PREPARACION.md` y mediciones reales del futuro worker | Presupuesto operativo, política de reintentos/uso; límites D3 no fijan gasto máximo |

Las APIs de revisión se pueden implementar antes; extracción/publicación deben
seguir bloqueadas hasta aprobación de la versión correspondiente. No publicar
candidatos PDF ni dar T32 por hecha sin su revisión. La aprobación de límites o
un deploy exitoso no aprueba contenido científico.

El permiso administrativo AWS pendiente para desplegar cargas (CORS) es una
acción operativa distinta de esta revisión. Ver `T33_PERMISOS_DESPLIEGUE.md`.
