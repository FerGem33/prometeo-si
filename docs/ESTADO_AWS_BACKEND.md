# Qué falta para cerrar la parte AWS y backend

Estado al 15-nov, después del despliegue acotado T33. El responsable técnico
puede preparar API, procesamiento, permisos y despliegues desde esta laptop;
el equipo de interfaz construye/conecta las pantallas. La infraestructura base
no equivale al recorrido completo operativo.

| Entrega | Comprobado | Falta para cerrar |
|---|---|---|
| T31 recursos base | DynamoDB, S3 privado, SQS/DLQ, pool/cliente Cognito; dos corridas reales | Hecha; conservar scripts e IDs |
| T33 cuentas/proyectos | API drafts desplegada, cuatro rutas JWT; 401 sin sesión/token inválido, CORS 204; MVP /ask y /analysis 200 | Ejecutar registro/confirmación/login y A/B con dos usuarios reales. Herramienta local lista en `tools/cognito/README.md`. Cargas y gestión completa pendientes |
| T30/D3 | Contrato y límites propuestos; permiso acotado para desplegar drafts | Aprobar resto del contrato y límites/costo del corpus. 20 MB/60 páginas/30 documentos no están aprobados por inferencia |
| T32 extracción | CLI local y evaluación real documentadas | Revisión humana D7, citas PDF y alcance; fuente/OCR legible del PDF pendiente |
| T33 cargas | Bucket privado creado; contrato de tickets y finalización | Backend de tickets/cargas/comprobación hash/límites, permisos S3 y pruebas reales; no habilitar sin D3 |
| T34 worker | Cola/DLQ creadas; pipeline local disponible | Lambda empaquetada con parser PDF, permisos, asociación SQS, progreso/reanudación, lote real y corrupto aislado |
| T35 revisión | Revisión/aprobación local versionada disponible | API persistente/autenticada y arranque de extracción tras aprobación; pantallas con equipo de interfaz |
| T36 correcciones y originales | Contratos preparados | API de correcciones/conflictos/claims, auditoría y URLs PDF por propietario; pruebas y pantallas |
| T37 publicación | Motor y pack MVP disponibles | Publicación versionada por proyecto, síntesis verificada y segundo dominio D10; aceptación real |
| Entrega final | Guía general y scripts MVP/T31/T33 parciales | Recorrido de extremo a extremo, recuperación probada, revisión privada/móvil y registro del commit desplegado |

## Intervenciones concretas del dueño

1. Ejecutar registro/confirmación de dos correos bajo su control y la prueba
   `node tools/cognito/cli.mjs ab`. Credenciales solo en la terminal local.
2. Resolver T30/D3 con límites y costos revisados, asignar revisor científico
   D7/PDF y seleccionar segundo dominio D10. El código no toma esas decisiones.
3. Aprobar permisos adicionales específicos cuando se entregue el worker y
   las cargas. El permission set de T33 no es permiso general para toda AWS.

El resto técnico puede continuar aquí y documentarse/desplegarse por etapas
según la autorización del dueño. No corresponde marcar el backend terminado
porque las pantallas estén listas o porque los recursos existan. T33–T37
requieren sus verificaciones reales antes de cerrarse en `PROGRESS.md`.

Guía completa: `GUIA_INTEGRACION_DEPLOY_FINAL.md`. Evidencia T33:
`T33_API_PROYECTOS.md`. Evidencia científica: `T32_EVALUACION.md`.
