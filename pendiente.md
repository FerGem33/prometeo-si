# Lista Maestra de Tareas Pendientes y Hoja de Ruta (`pendiente.md`)

**Proyecto:** Prometeo SI / Nasa2GenUI  
**Rama activa:** `nasa2genui`  
**Fecha:** 2026-11-15  
**Estado:** Funcionalidad base completada y verificada con dataset `/home/alexteori/Descargas/lote` (23 archivos: 10 CSVs + 13 PDFs).

---

## 1. Requerimientos Prioritarios Inmediatos

### 1.1. Límite estricto de 30 archivos por lote (en vez de 10)
* **Objetivo:** Asegurar que tanto la interfaz de usuario como el backend y las validaciones de carga admitan explícitamente lotes de **hasta 30 documentos simultáneos** (CSV, TSV, JSON, PDF), evitando cualquier restricción residual de 10 archivos.
* **Detalle técnico de implementación:**
  * **Frontend (`web/src/ingest/`):**
    * Verificar `D3_LIMITS.maxDocuments = 30` en [types.ts](file:///home/alexteori/Documentos/programacion/Nasa2GenUI./Frontend/prometeo-si/web/src/ingest/types.ts#L6-L10).
    * Actualizar mensajes informativos, textos de ayuda y advertencias en [ScenarioStep.tsx](file:///home/alexteori/Documentos/programacion/Nasa2GenUI./Frontend/prometeo-si/web/src/components/ScenarioStep.tsx) y `flow.ts` para que indiquen siempre de forma visible y clara: *"Límite: hasta 30 archivos por lote (máx. 20 MB por archivo, 60 páginas por PDF)"*.
    * En `web/src/ingest/storage.ts`, asegurar que la función `mergeUploadedDocs` conserve exactamente hasta 30 archivos válidos descartando sólo los que excedan la posición 30 con código de advertencia `limit_exceeded`.
  * **Backend Python (`api/`):**
    * En [upload_tickets.py](file:///home/alexteori/Documentos/programacion/Nasa2GenUI./Frontend/prometeo-si/api/upload_tickets.py#L22-L40), asegurar que `Limits.max_documents` esté fijado por defecto en `30` en `UPLOAD_LIMITS_JSON`.
    * En [handler.py](file:///home/alexteori/Documentos/programacion/Nasa2GenUI./Frontend/prometeo-si/api/handler.py), actualizar la validación del payload de `POST /propose` para admitir hasta 30 metadatos de documentos sin truncar el array antes de evaluar tokens.
    * Actualizar las pruebas unitarias en `test_upload_tickets.py` y `test_deletions.py` para validar lotes completos de 30 documentos.

---

### 1.2. Detección automática de temática NASA e integración de diagramas isométricos en "Evidence report"
* **Objetivo:** Cuando el usuario suba documentos propios (custom corpus), si el sistema detecta que el contenido corresponde a investigaciones de la NASA, ciencias espaciales, microgravedad o hábitats extraterrestres, **debe activar e incrustar automáticamente los diagramas isométricos interactivos** (`ChamberFigure`, `HabitatFigure`, `IsoBenchFigure`) dentro de la interfaz del reporte final (`Evidence report` / `#report`), en lugar de ocultarlos como ocurre actualmente.
* **Detalle técnico de implementación:**
  * **Algoritmo de detección heurística (`web/src/ingest/nasaDetect.ts`):**
    * Analizar títulos de documentos, DOIs, nombres de autores, nombres de tablas y variables extraídas buscando términos clave aeroespaciales:
      * Términos de agencia y misiones: `NASA`, `ESA`, `JAXA`, `ISS`, `CIR`, `BASS`, `FBC`, `MABE`, `NPBX`, `PBE`, `SAFFIRE`, `Artemis`, `Gateway`, `Apollo`.
      * Fenomenología de microgravedad: `microgravity`, `reduced gravity`, `zero-g`, `0g`, `low-g`, `parabola`, `KC-135`, `spacecraft`, `flight experiment`.
      * Sistemas de hábitat y soporte vital: `lunar base`, `habitat`, `airlock`, `spacesuit`, `eva`, `rover`, `eclss`, `combustion chamber`.
    * Asignar un flag `isNasaCorpus: boolean` al `Pack` y al `EvaluationDraft`.
  * **Integración en la interfaz de "Evidence report" (`App.tsx` y `ScenarioPanel.tsx`):**
    * En [ScenarioPanel.tsx](file:///home/alexteori/Documentos/programacion/Nasa2GenUI./Frontend/prometeo-si/web/src/components/ScenarioPanel.tsx#L140-L165):
      * Si `isNasaCorpus === true`, renderizar el escenario isométrico interactivo (`HabitatFigure` o `ChamberFigure`) en la cabecera del panel lateral, seleccionando automáticamente el modelo más cercano a los papers detectados (por ejemplo: `ChamberFigure` si se detectan experimentos de cámara CIR/BASS/NPBX, o `HabitatFigure` con modelo de hábitat orbital/lunar si se mencionan condiciones presurizadas).
    * En [App.tsx](file:///home/alexteori/Documentos/programacion/Nasa2GenUI./Frontend/prometeo-si/web/src/App.tsx#L622-L635):
      * En la sección de **Métodos** o en un fold dedicado de **Aparato Experimental**, mostrar el diagrama tridimensional interactivo con selector de etapas (`1 · Load`, `2 · Laser scan`, `3 · Ignition`, `4 · Telemetry`) y telemetría en tiempo real.
    * En el **Resumen Gráfico (`GraphicalAbstract.tsx`)**:
      * Incluir una miniatura isométrica vinculada al entorno detectado con indicador de cobertura empírica.

---

## 2. Pendientes en el Flujo de "New Evaluation" (`#scenario`)

### 2.1. Gestión de archivos en el Paso 1 (`Documents`)
- [ ] **Barra de progreso por archivo durante la carga:**
  - Cuando se suben 30 archivos a la vez, mostrar una barra de progreso individual o spinner en cada fila de documento mientras se calculan el hash SHA-256 y se parsea el texto.
- [ ] **Acción de limpieza total ("Borrar todos"):**
  - Añadir un botón para limpiar todos los archivos cargados de una vez (`Clear all documents`) además del botón individual `Remove`/`Quitar`.
- [ ] **Soporte para carpetas mediante Drag & Drop:**
  - Permitir arrastrar carpetas completas (como `/home/alexteori/Descargas/lote`) leyendo recursivamente los archivos `.csv`, `.tsv`, `.json` y `.pdf` mediante la API `webkitGetAsEntry()`.

### 2.2. Mejoras en el Diseñador de GenUI en el Paso 2 (`Interface design`)
- [ ] **Generador de instrucciones guiadas con sugerencias clicables:**
  - Permitir hacer clic en las variables sugeridas para insertarlas directamente en el `<textarea>` de instrucciones (ej. `"Comparar temperatura y gravedad"`).
- [ ] **Previsualización interactiva del árbol de secciones:**
  - Permitir reordenar visualmente las secciones del reporte arrastrando tarjetas (Drag & Drop) en lugar de depender únicamente del texto escrito.
- [ ] **Conexión opcional con endpoint remoto Bedrock `/design`:**
  - Cuando el backend AWS Lambda esté activo con credenciales válidas, realizar llamada asíncrona a `POST /design` para generar descripciones y agrupaciones semánticas aún más ricas.

### 2.3. Control de Variables en el Paso 3 (`Variables`)
- [ ] **Buscador y filtro de variables:**
  - Al procesar lotes grandes (ej. 135 variables como en el lote de 23 archivos), añadir una barra de búsqueda para filtrar variables rápidamente por nombre o unidad.
- [ ] **Agrupación colapsable por documento de origen o por grupo temático:**
  - Permitir colapsar grupos completos de variables (ej. agrupar todas las variables de ebullición, todas las eléctricas y todas las térmicas) para facilitar la navegación en lotes extensos.
- [ ] **Conversión automática de unidades en la interfaz:**
  - Permitir al usuario cambiar la unidad de visualización de una variable (ej. de `K` a `°C`, o de `kPa` a `atm`) mediante un menú desplegable en la tarjeta de la variable.

---

## 3. Pendientes en el Reporte de Evidencia (`#report`)

### 3.1. Persistencia y Workspace
- [ ] **Guardar evaluaciones personalizadas en Workspace (`IndexedDB`):**
  - Implementar la función del botón `"Save to workspace"` (`Guardar en el espacio de trabajo`) para guardar el `Pack` generado dinámicamente junto con su `Lens` y `UiBlueprint`, permitiendo al usuario reabrir la evaluación en cualquier sesión futura sin volver a subir los archivos.
- [ ] **Historial de evaluaciones en la vista Workspace:**
  - Mostrar en la vista `#workspace` el listado de evaluaciones personalizadas guardadas con fecha, cantidad de documentos, variables analizadas y estado.

### 3.2. Exportación y Dossier Académico
- [ ] **Exportación completa a PDF imprimible (`Export PDF`):**
  - Adaptar la hoja de estilos de impresión (`@media print`) para incluir la carátula adaptativa, la tabla de variables del corpus subido y el desglose de los hasta 30 estudios.
- [ ] **Dossier modal con citas BibTeX reales:**
  - En `DossierModal.tsx`, generar dinámicamente las entradas BibTeX con los DOIs extraídos de los PDFs cargados en el lote.
- [ ] **Descarga del paquete de datos procesado (`Export JSON / CSV`):**
  - Permitir descargar el archivo `prometeo.pack.json` generado con todas las fuentes, registros armonizados y sumas de verificación SHA-256.

### 3.3. Asistente Local (`AssistantPanel`)
- [ ] **Consultas en lenguaje natural sobre el corpus personalizado:**
  - Extender el intérprete local `web/src/ingest/localAsk.ts` para responder preguntas del tipo *"¿Cuál es la temperatura máxima registrada en los papers?"* o *"¿Qué estudios evaluaron gravedad menor a 0.1g?"* consultando directamente los registros extraídos sin requerir backend externo.

---

## 4. Pendientes en el Backend AWS (`api/` e `infra/`)

### 4.1. Despliegue de Endpoints `/propose` y `/design`
- [ ] **Actualización de AWS SAM / Terraform / CDK:**
  - Incorporar en la plantilla de infraestructura de AWS Lambda los nuevos métodos HTTP `POST /propose` y `POST /design` definidos en `api/handler.py`.
- [ ] **Permisos IAM para Amazon Bedrock:**
  - Asignar la política `bedrock:InvokeModel` al rol de ejecución de la Lambda para invocar el modelo `anthropic.claude-haiku-4-5-20251001-v1:0`.
- [ ] **CORS y cuotas en API Gateway:**
  - Configurar límites de frecuencia (rate limiting) y cabeceras CORS para el dominio de producción del frontend.

### 4.2. Trabajador SQS Asíncrono para Lotes Pesados (`ingest_worker.py`)
- [ ] **Procesamiento en segundo plano de lotes grandes:**
  - Para usuarios autenticados con colecciones superiores a 30 documentos o PDFs extensos, habilitar el worker SQS (`api/ingest_worker.py`) que procesa archivos directamente en Amazon S3.

---

## 5. Matriz de Componentes y Archivos Clave a Modificar

| Componente / Módulo | Archivos Involucrados | Tarea Principal |
| :--- | :--- | :--- |
| **Límite de 30 archivos** | `web/src/ingest/types.ts`<br/>`web/src/ingest/storage.ts`<br/>`web/src/components/ScenarioStep.tsx`<br/>`api/upload_tickets.py` | Sincronizar límite estricto de 30 archivos y actualizar mensajes |
| **Detección NASA & Diagramas Isométricos** | `web/src/ingest/nasaDetect.ts` (nuevo)<br/>`web/src/components/ScenarioPanel.tsx`<br/>`web/src/App.tsx`<br/>`web/src/components/ChamberFigure.tsx` | Detectar temática espacial y renderizar `ChamberFigure`/`HabitatFigure` en `#report` |
| **Persistencia en Workspace** | `web/src/components/Workspace.tsx`<br/>`web/src/report/workspace.ts`<br/>`web/src/App.tsx` | Guardar y listar evaluaciones de documentos propios en IndexedDB |
| **Buscador de Variables** | `web/src/components/ScenarioStep.tsx`<br/>`web/src/styles/flow.css` | Añadir buscador y filtro por categorías en Paso 3 de New Evaluation |
| **Dossier & Exportación PDF** | `web/src/components/DossierModal.tsx`<br/>`web/src/report/dossier.ts`<br/>`web/src/styles/report.css` | Generar BibTeX y vista de impresión para corpus personalizado |
| **Despliegue Backend AWS** | `api/handler.py`<br/>`infra/20_api.sh`<br/>`infra/outputs.env` | Desplegar rutas `/propose` y `/design` en AWS Lambda |
