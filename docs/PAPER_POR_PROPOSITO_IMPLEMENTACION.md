# Paper guiado por propósito: implementación y relevo

Fecha: 15-nov-2026. Rama: `nasa2genui`. Referencia: [especificación recibida](SPEC_PAPER_INTELIGENTE_POR_PROPOSITO.md).

## Alcance de esta entrega

La especificación pide confirmar cuatro decisiones de producto antes de implementar los comportamientos dependientes. La consulta al dueño sigue pendiente. Esta entrega implementa las etapas 1–3 y la captura/confirmación del caso y fuentes que no dependen de esas decisiones; **no declara terminado el paper inteligente completo**.

| Etapa | Estado | Evidencia / siguiente paso |
|---|---|---|
| `UiBlueprint.purpose` y contratos de módulos | Implementado | El compilador local genera propósito y módulos; validación local y en `/design`, con descarte informado |
| Puntuación de variables | Implementado | Algoritmo determinista, componentes/pesos visibles, citas de filas/páginas, pruebas con datos reales |
| Variables: selección sin valores | Implementado | Sin sliders ni asignación de medianas; definición manual de nombre/tipo/unidad, marcada user-defined |
| Propósito obligatorio | Implementado | Bloquea Continue, navegación al paso Variables y envío; ejemplo derivado del corpus |
| Propagación al informe | Implementado | El draft conserva el blueprint también para una evaluación de la referencia; se conservan las variables de partición del motor |
| Renderizador registrado de módulos | Parcial | `scenario_input`, `case_notes` y `key_papers` registrados; faltan `classification/free_chat` |
| Clasificación A–D de cobertura | Pendiente de decisión §7.1 | No se reinterpretaron las notas A–D existentes de cercanía de estudios |
| `key_papers`, `case_notes` | Implementado local | Fuentes/plantillas con citas y desglose assess/explainRank; condiciones interpretadas localmente solo se aplican al confirmar |
| Resúmenes narrativos globales/por documento | Parcial | Se conserva Abstract y se muestran plantillas de registros citados; no hay síntesis narrativa nueva verificada por IA |
| Chat libre | Pendiente de decisión §7.2 | El asistente existente conserva su alcance; no se lo presenta como un nuevo chat abierto |
| Clasificación de variables manuales | Pendiente de decisión §7.3 | No se añadieron mediciones ni citas para variables del usuario |
| Persistencia del caso | Pendiente de decisión §7.4 | Se conserva el almacenamiento previo; no se declara cerrado el nuevo flujo de caso |
| Publicación | No realizada | Requiere revisión visual humana; esta entrega no cambia AWS ni el modelo D6 |

La base correcta es `origin/nasa2genui` en `0f08553`, no `main`. Se trabajó en `/private/tmp/prometeo-paper-proposito` para no tocar los cambios locales previos de `main`. No fusionar la rama completa a ciegas: contiene una divergencia anterior importante de frontend/API respecto de `main`.

## Contratos y puntos de extensión

- [types.ts](../web/src/ingest/types.ts): `ModuleSpec`, `ModuleType`, puntuación y citas. `purpose/modules` son opcionales en el tipo solo para compatibilidad con guardados anteriores; toda compilación nueva los genera.
- [modules.ts](../web/src/ingest/modules.ts): registro de esquemas para `scenario_input`, `classification`, `key_papers`, `case_notes`, `free_chat`; valida IDs, tipo, textos, referencias seleccionadas y claves permitidas. Un tipo nuevo requiere esquema y renderizador; no modificar el motor para pintar UI.
- [blueprint.ts](../web/src/ingest/blueprint.ts): el propósito siempre es el texto de la persona; una propuesta remota no lo reemplaza. Los módulos inválidos quedan en `discardedModules` con razones sin código ejecutable; si ninguno sirve, se recupera el conjunto local y permanece el reporte base.
- [handler.py](../api/handler.py): `/design` recibe el propósito en su campo existente `instruction`; la respuesta incluye `purpose/modules/discardedModules`. El texto de la persona permanece delimitado como dato. El frontend valida otra vez. El handler no se desplegó en esta entrega.
- [ScenarioStep.tsx](../web/src/components/ScenarioStep.tsx): selección, puntuaciones y fuentes. El propósito y sus chips secundarios se conservan al editar. Se filtra por texto y documento.
- [ManualVariable.tsx](../web/src/components/ManualVariable.tsx): definición sin captura de valor. Una variable que ya existe se incluye en lugar de duplicarla. Los datos del usuario nunca se suman a las propuestas extraídas.
- [PurposeModules.tsx](../web/src/components/PurposeModules.tsx): registro de renderizadores independientes del motor; `scenario_input` captura condiciones seleccionadas sin valores por defecto, `case_notes` propone y espera confirmación, `key_papers` usa assess/explainRank y enlaces de procedencia. Las notas A–D que aparecen en fuentes conservan explícitamente su significado previo de cercanía de estudios.
- [case.ts](../web/src/contracts/case.ts): validación de condiciones seleccionadas, números finitos dentro del esquema y unidades compatibles. Errores inline y resumen enfocable. El modo estricto del parser de descripción no recorta valores fuera de rango ni acepta unidades incompatibles; la pregunta de texto no se aplica al escribirla.

Un informe generado puede tener un esquema seleccionado distinto del pack completo del servidor. Por eso su asistente existente usa el modo local/plantilla, incluso si las fuentes son de referencia; no envía ese esquema parcial a las rutas públicas de la demo. La demo abierta directamente conserva su comportamiento previo. Esto no implementa el nuevo chat libre pendiente.

Los títulos/descripciones de módulos salen del blueprint/compilador. Las reglas locales detectan intención de comparar/evaluar/decidir, sin IDs ni vocabulario científico específico: con variables seleccionadas generan los cinco tipos; una intención de síntesis genera `key_papers/free_chat`. Los ajustes de comparación pueden solicitar módulos de caso. `classification/free_chat` todavía no tienen renderizador; no se presentan como interacciones operativas. Los módulos de caso exigen al menos una variable seleccionada. Un tipo desconocido no desactiva el informe base.

## Puntuación: fórmula reproducible

Implementación: [relevance.ts](../web/src/ingest/relevance.ts). Escala de priorización 0–100:

`score = 100 × (0.25 F + 0.25 C + 0.15 P + 0.25 R + 0.10 M)`

| Componente | Cálculo |
|---|---|
| F, frecuencia ponderada | Una cabecera pesa 3; una mención textual pesa 1. Se cuentan fragmentos con coincidencia léxica y se limita el texto a 20 menciones por documento. Normalización `log(1+f) / max(log(1+f))` entre candidatas citadas |
| C, cobertura | Documentos distintos citados por la variable / documentos fuente del conjunto activo |
| P, posición | Coincidencias en título y ventanas de abstract/conclusión / 3 por documento citado; máximo 1 |
| R, relevancia al propósito | Fracción de términos únicos del ID/etiqueta de la variable presentes en el propósito, normalizados Unicode, sin modelo ni embeddings |
| M, medibilidad | 0.5 si existe unidad; 0.5 si es numérica y tiene límites finitos extraídos |

Se redondean componentes y score a tres decimales; el desempate usa ID con orden inglés. `scoreComponents` y `reasons[]` permiten explicar el resultado. La unidad o un rango extraíble ayudan a priorizar, pero **no prueban calidad científica**. Una variable categórica sigue siendo elegible. Cambiar el propósito puede cambiar R y el orden; no cambia las mediciones ni los niveles del motor.

Las ventanas de abstract/conclusión son una **heurística**, hasta 1500 caracteres desde el encabezado en la página donde aparece. No se atribuye una estructura de artículo que el parser no ha demostrado. Para el pack de referencia no se simula texto PDF ni títulos: ese componente puede ser cero. La fórmula no se calibró como modelo científico ni como probabilidad.

## Procedencia y límites de evidencia

Una variable sin cita verificable queda fuera de la lista propuesta. Para tablas se cotejan fila, columna y texto original; para PDF se coteja la cita con su página física, con normalización Unicode/espacios. Se conserva DOI cuando existe en la fuente o el estudio.

Las propuestas del pack de referencia usan filas reales y valores originales, en lugar de la antigua cita sintética «NASA PSI Reference Pack». Cuando el pack aprobado tiene una condición normalizada sin texto original por variable (por ejemplo, metadatos atribuidos a la investigación), se usa `basis: approved_pack`, ID de registro, variable y valor del pack cotejados. Se muestra expresamente como **registro normalizado del pack, no cita literal ni medición tabular demostrada**. Esa atribución no se convierte en una cabecera observada para el componente F.

El score es relevancia de una variable para el propósito, **no nivel de evidencia, nota A–D, riesgo ni causalidad**. Proponer presión no significa que esté registrada en sólidos: se preservan los controles de 0/268 pruebas con presión y máximo 22.2 % O₂. El preset lunar conserva O₂ «near» y presión «not_studied» en el motor original.

Las variables manuales no tienen puntuación ni cita inventada y se identifican `user-defined`. En esta entrega no se cambia su clasificación; la decisión correspondiente está pendiente. No se generaron resúmenes IA sin verificador ni respuestas de chat disfrazadas de IA.

## Verificación realizada

El corpus original sigue fuera de Git (D9). La prueba del lote anteriormente tenía una ruta fija de Linux; ahora admite `PROMETEO_LOTE_DIR`. Las pruebas nuevas usan el pack PSI versionado y el bundle externo ya revisado de ebullición (2 estudios, 51 registros). Los fixtures de batería escritos a mano que ya había no se usan como evidencia de un segundo dominio real.

Comandos desde este checkout, indicando las rutas reales disponibles en la laptop:

```bash
PROMETEO_LOTE_DIR=/ruta/al/lote-real-de-23-documentos \
PROMETEO_PUBLICATION_PATH=/ruta/al/bundle-revisado \
  npm test --prefix web
npm run build --prefix web
python3.12 -m pytest api/ -q
bash scripts/check_agnostic.sh
git diff --check
```

Resultado actual: 223 pruebas web pasan, 1 omitida preexistente por su propia ruta local de detección NASA; el lote real de 23 documentos y las pruebas del bundle externo sí se ejecutaron. API: 164 pasan con Python 3.12 y el entorno ya instalado de la laptop. Build TypeScript/Vite y comprobación agnóstica pasan. Persiste el aviso de bundle mayor de 500 kB. No se afirma una prueba de IA desplegada a partir de estos dobles locales. Pruebas nuevas comprueban también campos vacíos sin aplicación al renderizar, conversión de la presión del preset real, exclusión de campos no seleccionados, rechazo de unidades/valores inválidos y propuesta estricta de notas.

Incidencias corregidas durante la verificación: ruta de lote de Linux inexistente (ahora parametrizada), cobertura de traducciones de cuatro frases nuevas y campos de procedencia ubicados inicialmente en el tipo equivocado. La corrida final pasó; no se alteraron los vectores científicos congelados del motor.

Comprobación de UI parcial en Chrome nativo: el propósito vacío muestra el aviso y bloquea Continue y el paso Variables. El navegador integrado estaba indisponible. La interacción posterior fue interrumpida por cambios de foco del usuario: no se declara revisión visual completa, móvil, ni aceptación humana. No se desplegó web/API.

## Decisiones y siguiente paso exacto

La pregunta al dueño agrupa las cuatro propuestas de §7:

1. A=Studied, B=Near, C=Scarce evidence, D=Not studied, exclusivamente cobertura.
2. Chat solo sobre el corpus, con citas.
3. Variable manual incluida en el caso, sin evidencia encontrada, nivel Not studied.
4. Caso guardado junto con su evaluación en Workspace.

Tras confirmarlas o recibir sus cambios, completar los renderizadores de clasificación reutilizando el motor, chat acotado con fallback rotulado, política de variables manuales y persistencia. Completar la síntesis narrativa citada, probar las interacciones en navegador y realizar la revisión humana antes de cualquier publicación. Esta entrega no cierra esos criterios de aceptación.
