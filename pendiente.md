# Lista Maestra de Tareas Pendientes y Hoja de Ruta (`pendiente.md`)

**Proyecto:** Prometeo SI / Nasa2GenUI  
**Rama activa:** `nasa2genui`  
**Fecha:** 2026-11-15  
**Estado:** Funcionalidad base completada y verificada al 100% con dataset `/home/alexteori/Descargas/lote` (23 archivos: 10 CSVs + 13 PDFs). Nuevas implementaciones de límite de 30 archivos, detección de NASA, diagramas isométricos en Evidence Report y persistencia en Workspace completadas y verificadas con suite de 212 pruebas unitarias vitest y 161 pruebas pytest.

---

## 1. Requerimientos Prioritarios Inmediatos

### 1.1. Límite estricto de 30 archivos por lote (en vez de 10) `[COMPLETADO Y VERIFICADO]`
* **Objetivo:** Asegurar que tanto la interfaz de usuario como el backend y las validaciones de carga admitan explícitamente lotes de **hasta 30 documentos simultáneos** (CSV, TSV, JSON, PDF), evitando cualquier restricción residual de 10 archivos.
* **Estado:** **Completado y verificado.**
* **Detalle técnico implementado:**
  * **Frontend (`web/src/ingest/`):**
    * `D3_LIMITS.maxDocuments = 30` en [types.ts](file:///home/alexteori/Documentos/programacion/Nasa2GenUI./Frontend/prometeo-si/web/src/ingest/types.ts).
    * Textos informativos y banners actualizados en [ScenarioStep.tsx](file:///home/alexteori/Documentos/programacion/Nasa2GenUI./Frontend/prometeo-si/web/src/components/ScenarioStep.tsx) indicando *"Límite: hasta 30 archivos por lote (máx. 20 MB por archivo, 60 páginas por PDF)"*.
    * En [storage.ts](file:///home/alexteori/Documentos/programacion/Nasa2GenUI./Frontend/prometeo-si/web/src/ingest/storage.ts), `mergeUploadedDocs` preserva hasta 30 documentos emitiendo advertencia `limit_exceeded` a partir del 31.
    * Soporte para carga de carpetas completas mediante drag & drop y selector de carpetas en [folderDrop.ts](file:///home/alexteori/Documentos/programacion/Nasa2GenUI./Frontend/prometeo-si/web/src/ingest/folderDrop.ts).
  * **Backend Python (`api/`):**
    * `Limits.max_documents = 30` por defecto en [upload_tickets.py](file:///home/alexteori/Documentos/programacion/Nasa2GenUI./Frontend/prometeo-si/api/upload_tickets.py).
    * Test unitario `test_full_batch_of_30_documents_then_limit` añadido y pasando en [test_upload_tickets.py](file:///home/alexteori/Documentos/programacion/Nasa2GenUI./Frontend/prometeo-si/api/test_upload_tickets.py).

---

### 1.2. Detección automática de temática NASA e integración de diagramas isométricos en "Evidence report" `[COMPLETADO Y VERIFICADO]`
* **Objetivo:** Cuando el usuario suba documentos propios (custom corpus), si el sistema detecta que el contenido corresponde a investigaciones de la NASA, ciencias espaciales, microgravedad o hábitats extraterrestres, **debe activar e incrustar automáticamente los diagramas isométricos interactivos** (`ChamberFigure`, `HabitatFigure`, `IsoBenchFigure`) dentro de la interfaz del reporte final (`Evidence report` / `#report`), en lugar de ocultarlos como ocurre actualmente.
* **Estado:** **Completado y verificado.**
* **Detalle técnico implementado:**
  * **Algoritmo de detección heurística ([nasaDetect.ts](file:///home/alexteori/Documentos/programacion/Nasa2GenUI./Frontend/prometeo-si/web/src/ingest/nasaDetect.ts)):**
    * Analiza títulos de documentos, DOIs, nombres de autores, nombres de tablas y variables extraídas buscando términos clave aeroespaciales (`NASA`, `ISS`, `CIR`, `BASS`, `FBC`, `MABE`, `NPBX`, `microgravity`, `parabola`, `combustion chamber`, `flight experiment`, etc.).
    * Retorna clasificación de misión (`chamber`, `habitat`, `bench`), nivel de confianza, términos coincidentes y descripción en español/inglés.
    * Probado con cobertura exhaustiva en `nasaDetect.test.ts`.
  * **Integración en la interfaz de "Evidence report" ([App.tsx](file:///home/alexteori/Documentos/programacion/Nasa2GenUI./Frontend/prometeo-si/web/src/App.tsx) y [ScenarioPanel.tsx](file:///home/alexteori/Documentos/programacion/Nasa2GenUI./Frontend/prometeo-si/web/src/components/ScenarioPanel.tsx)):**
    * Cuando `pack.meta?.nasa?.isNasaCorpus` es positivo, [ScenarioPanel.tsx](file:///home/alexteori/Documentos/programacion/Nasa2GenUI./Frontend/prometeo-si/web/src/components/ScenarioPanel.tsx) renderiza el escenario isométrico interactivo con telemetría en tiempo real y selector de hardware.
    * Sección dedicada de aparato experimental [NasaApparatus.tsx](file:///home/alexteori/Documentos/programacion/Nasa2GenUI./Frontend/prometeo-si/web/src/components/NasaApparatus.tsx) incrustada en `#report` con selector interactivo de 4 fases experimentales (`1 · Load`, `2 · Laser scan`, `3 · Ignition`, `4 · Telemetry`).
    * [GraphicalAbstract.tsx](file:///home/alexteori/Documentos/programacion/Nasa2GenUI./Frontend/prometeo-si/web/src/components/GraphicalAbstract.tsx) muestra tarjeta de contexto espacial e indicador de misión identificada.

---

## 2. Flujo de "New Evaluation" (`#scenario`)

### 2.1. Gestión de archivos en el Paso 1 (`Documents`)
- [x] **Barra de progreso por archivo durante la carga:**
  - Cuando se suben 30 archivos a la vez, mostrar una barra de progreso individual o spinner en cada fila de documento mientras se calculan el hash SHA-256 y se parsea el texto.
- [x] **Acción de limpieza total ("Borrar todos"):**
  - Botón "Limpiar lista" (`Clear all`) implementado en `ScenarioStep.tsx` para restablecer la selección rápidamente.
- [x] **Soporte para carpetas mediante Drag & Drop y Folder Picker:**
  - Implementado en `web/src/ingest/folderDrop.ts` y cableado al botón "Subir carpeta" y zona de arrastre.

### 2.2. Mejoras en el Diseñador de GenUI en el Paso 2 (`Interface design`)
- [x] **Generador de instrucciones guiadas con sugerencias clicables:**
  - Permitir hacer clic en las variables sugeridas para insertarlas directamente en el `<textarea>` de instrucciones (ej. `"Comparar temperatura y gravedad"`).
- [x] **Previsualización interactiva del árbol de secciones:**
  - Permitir reordenar visualmente las secciones del reporte arrastrando tarjetas (Drag & Drop) en lugar de depender únicamente del texto escrito.
- [x] **Conexión opcional con endpoint remoto Bedrock `/design`:**
  - Cuando el backend AWS Lambda esté activo con credenciales válidas, realizar llamada asíncrona a `POST /design` para generar descripciones y agrupaciones semánticas aún más ricas.

### 2.3. Control de Variables en el Paso 3 (`Variables`)
- [x] **Buscador y filtro de variables:**
  - Implementado en `web/src/ingest/variableView.ts` y en `ScenarioStep.tsx` con input de búsqueda en tiempo real y filtro por tipo (`numéricas` / `categóricas`).
- [x] **Agrupación colapsable por documento de origen o por grupo temático:**
  - Implementado con recuento dinámico de variables activas por archivo de procedencia.
- [x] **Conversión automática de unidades en la interfaz:**
  - Permitir al usuario cambiar la unidad de visualización de una variable (ej. de `K` a `°C`, o de `kPa` a `atm`) mediante un menú desplegable en la tarjeta de la variable.

---

## 3. Reporte de Evidencia (`#report`)

### 3.1. Persistencia y Workspace
- [x] **Guardar evaluaciones personalizadas en Workspace (`IndexedDB`):**
  - Implementado en `web/src/report/customStore.ts` y `web/src/report/workspace.ts` permitiendo guardar y reabrir packs personalizados.
- [x] **Historial de evaluaciones en la vista Workspace:**
  - La vista `#workspace` muestra evaluaciones personalizadas junto con las predefinidas, con etiquetas de fecha y conteo de fuentes.

### 3.2. Exportación y Dossier Académico
- [x] **Exportación completa a PDF imprimible (`Export PDF`):**
  - Adaptar la hoja de estilos de impresión (`@media print`) para incluir la carátula adaptativa, la tabla de variables del corpus subido y el desglose de los hasta 30 estudios.
- [x] **Dossier modal con citas BibTeX reales:**
  - Implementado en `web/src/report/dossier.ts` y `web/src/components/DossierModal.tsx`, generando entradas BibTeX a partir de los documentos cargados.
- [x] **Descarga del paquete de datos procesado (`Export JSON / CSV`):**
  - Implementado en el menú de exportación del reporte.

### 3.3. Asistente Local (`AssistantPanel`)
- [x] **Consultas en lenguaje natural sobre el corpus personalizado:**
  - Implementado en `web/src/ingest/localAsk.ts`, respondiendo consultas analíticas locales sobre variables y fuentes cargadas.

---

## 4. Pendientes en el Backend AWS (`api/` e `infra/`)

### 4.1. Despliegue de Endpoints `/propose` y `/design`
- [x] **Rutas `/propose` y `/design`:** ya cubiertas: `infra/20_api.sh` crea un HTTP API con ruta `$default` hacia la Lambda. Falta volver a ejecutar `infra/20_api.sh` para publicar el `handler.py` actual (AWS, requiere confirmación humana).
  - (original) **Actualización de AWS SAM / Terraform / CDK:**
  - Incorporar en la plantilla de infraestructura de AWS Lambda los nuevos métodos HTTP `POST /propose` y `POST /design` definidos en `api/handler.py`.
- [x] **Permisos IAM para Amazon Bedrock:** ya en `infra/20_api.sh` (`bedrock:InvokeModel` acotado al perfil de `MODEL_ID`).
  - (original)
  - Asignar la política `bedrock:InvokeModel` al rol de ejecución de la Lambda para invocar el modelo `anthropic.claude-haiku-4-5-20251001-v1:0`.
- [x] **CORS y cuotas en API Gateway:** ya en `infra/20_api.sh` (orígenes CloudFront, throttling burst 10 / rate 5).
  - (original)
  - Configurar límites de frecuencia (rate limiting) y cabeceras CORS para el dominio de producción del frontend.

### 4.2. Trabajador SQS Asíncrono para Lotes Pesados (`ingest_worker.py`)
- [ ] **Procesamiento en segundo plano de lotes grandes:** BLOQUEADO por T34 (AccessDenied en `iam:GetRole` / `iam:SimulateCustomPolicy`); requiere permisos de una persona.
  - (original)
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
