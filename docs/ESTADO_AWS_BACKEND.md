# Qué falta para cerrar la parte AWS y backend

Estado al 15-nov, después del despliegue acotado T33. El responsable técnico
puede preparar API, procesamiento, permisos y despliegues desde esta laptop;
el equipo de interfaz construye/conecta las pantallas. La infraestructura base
no equivale al recorrido completo operativo.

| Entrega | Comprobado | Falta para cerrar |
|---|---|---|
| T31 recursos base | DynamoDB, S3 privado, SQS/DLQ, pool/cliente Cognito; dos corridas reales | Hecha; conservar scripts e IDs |
| T33 cuentas/proyectos | Registro/confirmación/login SRP y 14 checks A/B reales pasan. API drafts y cuatro rutas JWT desplegadas; MVP operativo | Cargas D3 y gestión completa de proyectos (DELETE/lente); conexión de pantallas por interfaz. Evidencia `T33_PRUEBA_USUARIOS.md` |
| T30/D3 | Dueño aprobó D3: 20 MB/60 páginas/30 documentos; permiso acotado drafts | Aprobar resto del contrato; verificar enforcement y medir costo efectivo del worker. Límites no son tope monetario |
| T32 extracción | CLI local y evaluación real documentadas | Revisión humana D7, citas PDF y alcance; fuente/OCR legible del PDF pendiente |
| T33 cargas | D3 aprobada; reserva/complete/encolado/listado/jobs/resume locales | Permiso CORS bloquea deploy; smoke S3/complete real y limpieza pendientes. Ver `T33_CARGAS_PREPARACION.md` |
| T34 worker | Cola/DLQ creadas; worker local hasta propuesta, parser real PDF y ZIP Linux comprobados | Script de provisión, permisos, Lambda y asociación SQS, lote/DLQ y extracción tras aprobación pendientes |
| T35 revisión | Revisión/aprobación local versionada disponible | API persistente/autenticada y arranque de extracción tras aprobación; pantallas con equipo de interfaz |
| T36 correcciones y originales | Contratos preparados | API de correcciones/conflictos/claims, auditoría y URLs PDF por propietario; pruebas y pantallas |
| T37 publicación | Motor y pack MVP disponibles | Publicación versionada por proyecto, síntesis verificada y segundo dominio D10; aceptación real |
| Entrega final | Guía general y scripts MVP/T31/T33 parciales | Recorrido de extremo a extremo, recuperación probada, revisión privada/móvil y registro del commit desplegado |

## Intervenciones concretas del dueño

1. Registro/confirmación y prueba `node tools/cognito/cli.mjs ab` ya completados
   con dos cuentas propias. Conservar control de esas cuentas para regresiones;
   no compartir ni versionar credenciales.
2. D3 ya aprobada. Aprobar resto del contrato T30, asignar revisor científico
   D7/PDF y seleccionar segundo dominio D10. El código no toma esas decisiones.
3. Aprobar permisos adicionales específicos cuando se entregue el worker y
   las cargas. El permission set de T33 no es permiso general para toda AWS.

Bloqueo administrativo actual: añadir s3:GetBucketCORS/s3:PutBucketCORS al
bucket del corpus conforme a `T33_PERMISOS_DESPLIEGUE.md`. Revisión de datos y
producto agrupada al final en `REVISION_FINAL_PENDIENTE.md`.

El resto técnico puede continuar aquí y documentarse/desplegarse por etapas
según la autorización del dueño. No corresponde marcar el backend terminado
porque las pantallas estén listas o porque los recursos existan. T33–T37
requieren sus verificaciones reales antes de cerrarse en `PROGRESS.md`.

Guía completa: `GUIA_INTEGRACION_DEPLOY_FINAL.md`. Evidencia T33:
`T33_API_PROYECTOS.md`. Evidencia científica: `T32_EVALUACION.md`.
