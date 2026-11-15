# Prometeo: guía de estudio para preguntas técnicas y de diseño

15-nov-2026. Complementa `PITCH.md` §6, que ya trae las respuestas cortas de valor, IA, escala y negocio. Esta guía explica cómo funciona cada pieza por dentro, para poder contestar la segunda pregunta, la que viene después de la respuesta corta.

Los números de los ejemplos salen de correr el motor real (`web/src/engine/`) sobre el pack de la demo (`web/public/demo/pack.json`). No hay valores inventados.

## 0. Cómo usar esta guía

- La §1 es el mapa. Si solo tienes 10 minutos, lee la §1, la §3.6 (el ejemplo de la base lunar) y la §11 (números de memoria).
- Cada respuesta del Q&A se puede decir en 20 o 30 segundos. Si el juez quiere más, la sección indicada tiene el detalle.
- Regla de oro al responder: decir qué calcula el motor, qué hace la IA y qué decide una persona. Casi todas las preguntas técnicas se resuelven con esa separación.

## 1. El sistema en una página

Prometeo responde una pregunta: "¿qué tan cubiertas por la evidencia están estas condiciones?". No responde "¿arde o no arde?".

| Pieza | Qué hace | Dónde vive | Tecnología |
|---|---|---|---|
| Pack | Los datos ya armonizados: variables, estudios, registros con procedencia | `web/public/demo/pack.json` (demo) o S3 privado (proyectos) | JSON, contrato `prometeo.pack/1` |
| Lente | Lo que cambia por área: títulos, presets, umbrales de evidencia, partes de la propuesta, huecos conocidos | `lens.json` | JSON |
| Motor | Calcula niveles, notas A–D, ranking, hallazgos, mapa de huecos, grafo, diferencias entre variantes, ficha ML | `web/src/engine/` | TypeScript puro, sin DOM ni red ni dependencias. Corre en el navegador |
| Informe | Muestra lo que calcula el motor con forma de artículo | `web/src/components/` | React 19 + Vite |
| API de IA | `/ask` traduce una pregunta a un escenario; `/analysis` elige oraciones ya verificadas | `api/handler.py`, `api/verify.py` | Lambda Python 3.12 + Bedrock (Claude Haiku 4.5) |
| Backend de proyectos | Cuentas, subida de documentos, propuesta de esquema, revisión humana, extracción, publicación versionada | `api/projects.py`, `api/ingest_worker.py`, `api/schema_review.py`, `api/evidence.py` | Cognito, API Gateway, Lambda, SQS + DLQ, DynamoDB, S3 |
| Pipeline fuera de línea | Genera el pack de la demo desde las tablas de PSI con un mapping revisado por personas | `pipeline/build_pack.py`, `pipeline/validate_pack.py` | Python, solo librería estándar |

Flujo de una persona que trae sus documentos:

1. Crea una cuenta y un proyecto con su intención ("qué combinaciones de X se han estudiado para Y").
2. Sube CSV y PDF directo a S3 con una URL firmada. El archivo no pasa por la Lambda.
3. El worker lee cada documento, comprueba su SHA-256 y pide al modelo una propuesta de esquema: variables, unidades, columnas, constantes, cada una con su cita.
4. Un validador revisa la propuesta. Una cita que no aparece literal en el documento hace que la propuesta se rechace.
5. Una persona revisa el esquema: renombra, fusiona, cambia unidades, rechaza columnas, marca la partición. Nada sigue sin su aprobación.
6. La extracción tabular es determinista: aplica el esquema aprobado fila por fila. Las celdas ambiguas se rechazan, no se adivinan.
7. Se corrigen valores (se guarda el original, quién y por qué) y se resuelven conflictos.
8. Se publica una versión privada del pack. La misma interfaz y el mismo motor la abren igual que la demo.

## 2. Los datos de la demo

Fuente: NASA Physical Sciences Informatics (PSI), investigaciones de combustión.

| Dato | Valor |
|---|---|
| Investigaciones (estudios) | 24 |
| Tablas experimentales usadas | 22 |
| Registros | 1,986: 1,889 pruebas individuales y 97 campañas |
| Registros con bandera | 147 |
| Publicaciones asociadas | 352 |
| Documentos en los metadatos | 522 |
| Variables numéricas | O₂ (%), presión (atm), flujo (cm/s), gravedad (g) |
| Variables categóricas | material; fase (gas, sólido, líquido, aerosol), que es la partición |
| Pruebas por fase | gas 1,141 · líquido 361 · sólido 268 · aerosol 119 |

Puntos que conviene saber explicar:

- **Prueba y campaña.** Una prueba es una fila con condiciones propias. Una campaña es un registro que resume varias corridas sin detalle por corrida. Los conteos del informe usan solo pruebas.
- **Todos los registros vienen de tablas.** En la demo, `confidence` es `table` en los 1,986. Los PDF sirven de contexto (alcance, notas), pero nunca rellenan una fila de tabla. Es una decisión de calidad, no una limitación oculta.
- **Rangos, no puntos.** Cada valor numérico se guarda como intervalo `[min, max]`. Una prueba a 22.2 % es `[22.2, 22.2]`; una tabla que dice "60-78" sería `[60, 78]`. Así el motor trata igual valores exactos y rangos.
- **Unidades.** Todo se convierte a una unidad canónica con un factor lineal, y el valor original se guarda en `orig`: columna, texto literal, unidad y factor. Ejemplo real: PSI-10 registra O₂ como fracción molar `0.37082819`, que se guarda como 37.0828 % con factor 100.
- **Banderas.** Hay tres tipos, y cada una afecta solo a las variables que nombra:
  - `unit_unconverted` (129 registros, todos de BASS-II): el flujo está como ajuste del ventilador (voltaje o pasos), no en cm/s. Se deja sin convertir y no entra a ninguna distancia. El O₂ de esos mismos registros sí cuenta, porque la bandera es solo del flujo.
  - `mapping_uncertain` (18): la presión (~1 atm) sale de una nota de la tabla, no de una columna por prueba.
  - `suspect_value` (5): una columna de control tiene un valor imposible, posible error de transcripción en la fuente.
- **Constantes por tabla.** La gravedad de las investigaciones de vuelo sale de los metadatos de PSI (tipo "Microgravity Investigation"), no de una columna. Por eso las 1,889 pruebas tienen g = 0. La lente lo declara como hueco conocido: ningún registro se tomó en gravedad parcial.
- **Mapping humano.** `web/public/demo/mapping.json` dice, columna por columna de cada tabla, qué variable es, en qué unidad, con qué conversión y si se aprueba, se rechaza o entra con bandera. Lo revisó el equipo. Ejemplo: de las 17 columnas de BASS-II se usan el material, el O₂ inicial calibrado y el ventilador (con bandera); el O₂ final solo sirve para detectar valores sospechosos.

## 3. El motor, paso a paso

Todo es determinista: el mismo pack, la misma lente y el mismo escenario dan siempre el mismo resultado. Hay vectores de prueba con datos reales en `web/src/engine/golden.test.ts`.

### 3.1 Escenario

Valores por variable más la lista de variables activas. Ejemplo, la base lunar: O₂ 30 %, presión 0.694 atm (10.2 psi), material PMMA.

### 3.2 Partición y pool comparable

No tiene sentido comparar una llama de gas con un sólido que arde. La lente marca una variable categórica como partición (aquí, la fase).

- Si el escenario no fija la fase, el motor la deduce: si todos los registros con PMMA son sólidos, el escenario es de sólidos.
- El pool son las pruebas de esa partición. Para la base lunar, 268 pruebas de sólidos.
- Las pruebas de otras particiones no cuentan, pero el motor las menciona como contexto ("tested elsewhere"). Ejemplo: 107 pruebas de otras fases sí tienen presión cercana a 0.694 atm.

### 3.3 Envolvente y nivel por variable

Para cada variable activa, la envolvente es el rango mínimo a máximo que cubren las pruebas del pool. Se usan tres umbrales del pack, visibles en Methods:

| Umbral | Valor demo | Para qué |
|---|---|---|
| `tolerance` | 0.25 σ | Margen para decir "dentro del rango" |
| `closeness_reach` | 3 σ | Hasta dónde fuera del rango se dice "cerca" |
| `grade_a` | 1.0 | Distancia máxima para nota A |
| `min_studies` (lente) | 2 | Estudios distintos necesarios para "Studied" |

σ es la escala de cada variable, elegida por el equipo: 5 puntos de O₂, 0.3 atm, 10 cm/s, 0.05 g. Es la respuesta a "¿qué diferencia es significativa?", y el revisor la puede cambiar (`set_sigma`).

| Nivel | Regla |
|---|---|
| Studied | El valor cae dentro del rango y lo cubren pruebas sin bandera de al menos 2 estudios |
| Scarce evidence | Dentro del rango, pero lo cubre un solo estudio, solo pruebas con bandera, o hay un hueco interno sin pruebas en ese valor |
| Near, not covered | Fuera del rango, a menos de 3 σ del borde |
| Not studied | Nadie registró la variable, o el valor está a más de 3 σ |

El hueco interno importa: si las pruebas cubren 14–16 % y 20–22 %, la envolvente es 14–22 %, pero 18 % sale "Scarce" porque ninguna prueba lo cubre de verdad.

### 3.4 Nota A–D por estudio y ranking

Para cada estudio, el motor busca su prueba más cercana al escenario:

- Distancia = raíz de la suma de (hueco / σ)² sobre las variables numéricas activas. El hueco es 0 si el valor cae dentro del intervalo de la prueba.
- Una categórica distinta suma una penalización fija (material: 2).
- Variables que el estudio no registró no suman distancia, pero se listan como "not recorded".

| Nota | Regla |
|---|---|
| A | Todo dentro de lo probado, distancia ≤ 1.0 y ninguna variable faltante |
| B | Todo dentro de lo probado, pero con distancia mayor o con variables faltantes |
| C | Alguna variable fuera de lo probado o alguna categoría sin probar |
| D | El estudio no tiene pruebas comparables (otra fase) o no comparte ninguna variable |

Orden del ranking: nota, después variables faltantes, después distancia. `explainRank` descompone la distancia variable por variable, para responder "¿por qué este estudio quedó primero?".

### 3.5 Hallazgos, partes y nivel global

- **Hallazgos.** El motor produce frases tipo con parámetros y fuentes: `never_measured`, `above_tested`, `below_tested`, `tested_elsewhere`, `known_gap`, `within_tested`, `category_tested`, `full_coverage` y `quality_flags`. Primero salen los de atención y al final los de apoyo. La IA no los inventa; como mucho elige cuáles mostrar.
- **Partes de la propuesta.** La lente agrupa variables: atmósfera (O₂ y presión), ventilación, gravedad y material. El nivel de una parte lo decide su variable más débil: una atmósfera con O₂ "Near" y presión "Not studied" queda "Not studied".
- **Nivel global.** Es fuerte si algún estudio tiene A, parcial si el mejor es B, escaso si el mejor es C y nulo si todos son D.

### 3.6 Ejemplo completo: la base lunar (salida real del motor)

Escenario: O₂ 30 %, presión 0.694 atm, PMMA.

| Paso | Resultado |
|---|---|
| Partición | Sólido, deducida del PMMA. Pool: 268 pruebas |
| O₂ | Probado de 13.6 a 22.2 %. 30 % queda 7.8 puntos arriba. 3 σ son 15 puntos, así que es "Near, not covered" |
| Presión | 0 de 268 pruebas la registran: "Not studied" |
| Material | 91 pruebas con PMMA en más de un estudio: "Studied" |
| Partes | Atmósfera "Not studied" (la decide la presión); material "Studied" |
| Ranking | BASS-II (PSI-25) primero, nota C, distancia 1.56 = 7.8 / 5. Después SAFFIRE-II con 1.58 y SAFFIRE-I con 3.66. Ningún estudio tiene A ni B |
| Nivel global | Escaso |
| Contexto | 36 pruebas de otras fases sí cubren 30 % de O₂, y 107 cubren la presión. No son comparables y se dicen como contexto |
| Calidad | Las 129 pruebas de BASS-II tienen bandera, pero es del flujo, que no está en este escenario |

Comparación útil: con la estación (21 %, 1 atm) el O₂ sale "Studied" con 56 pruebas que lo cubren, y BASS-II sube a nota B. Si se agrega la gravedad lunar (0.17 g), sale "Not studied": todas las pruebas son de 0 g y 0.17 está a más de 3 σ (0.15). Además aparece el hueco conocido de la lente.

### 3.7 Otras funciones del motor

- **Mapa de huecos.** Una cuadrícula de dos variables con cortes en cuantiles, que muestra cuántas pruebas hay en cada celda y dónde cae el escenario.
- **Grafo de conocimiento.** Conecta estudios con variables, valores categóricos compartidos y atributos como el hardware. Los nombres parecidos se unen con similitud de Levenshtein ≥ 0.9. Solo usa lo que está en el pack.
- **Diferencias.** `diffAssessment` compara dos evaluaciones (antes y después de mover un parámetro, o dos variantes guardadas) y dice qué niveles, notas y hallazgos subieron o bajaron.
- **Ficha ML.** `assessDataset`: ver §7.
- **Velocidad.** En T06 se midieron unos 42 ms por actualización del motor al mover un slider. El objetivo era menos de 200 ms.

## 4. La IA: qué hace y qué nunca hace

Modelo: Claude Haiku 4.5 en Amazon Bedrock, con el SDK oficial de Anthropic. El ID del modelo sale de configuración, no del código.

| Uso | Entrada | Lo que hace el modelo | Lo que hace el código después |
|---|---|---|---|
| `/ask` | Pregunta en inglés + esquema | Extrae condiciones: variable, número y unidad tal como se escribieron | Convierte unidades (la conversión es del código, no del modelo), descarta variables desconocidas, valores fuera de rango y categorías inexistentes, y deja nota de cada descarte |
| `/analysis` | Hallazgos del motor | Elige de 3 a 5 oraciones de una lista ya escrita y las ordena | Acepta solo oraciones copiadas exactas. Si descarta más de la mitad, usa la versión por plantilla y lo marca |
| Propuesta de esquema (worker) | Muestra de un documento | Propone variables, unidades y columnas, con citas | El validador comprueba cada cita literal en el documento; luego una persona aprueba |
| Síntesis de estudios | Extractos citados | Elige hasta 5 extractos | Solo pasan citas verificadas; si no, plantilla |

Defensas concretas:

- **No hay números de la IA.** En `/analysis` el modelo no redacta: elige entre frases que el código armó con los parámetros del motor. Antes, `validate_facts` recalcula cada hallazgo contra los registros, así que un cliente no puede mandar un hallazgo falso para que el servidor lo "verifique".
- **Preguntas fuera de alcance.** Antes de llamar al modelo, el código detecta preguntas sobre ignición, seguridad, riesgo o predicción y contesta "Only scenario changes are supported". El modelo también tiene la instrucción de devolver `unsupported`.
- **Inyección de instrucciones.** El texto del usuario va dentro de `<untrusted_data>`, con `<` y `>` escapados, y el sistema dice que ese contenido es dato. Aunque el modelo obedeciera algo, la salida pasa por validación estricta: no hay camino para que una instrucción se convierta en un número publicado.
- **Fallos.** Timeout de 15 s y sin reintentos automáticos. Si la respuesta no termina en `end_turn`, se rechaza. Si la API falla, el informe sigue completo, porque todo el cálculo está en el navegador; el análisis se muestra por plantilla y marcado como tal.
- **Modo honesto.** Cada respuesta dice `mode: ai` o `mode: template`. Está prohibido presentar texto grabado como IA en vivo.

Por qué Haiku y no un modelo grande: el modelo solo traduce y elige; el razonamiento numérico es del motor. Haiku basta, es más barato y responde más rápido. El equipo decidió no migrar a otro modelo (decisión D6).

## 5. Backend de proyectos y seguridad

| Componente | Rol |
|---|---|
| CloudFront + S3 web | Sirve la web por HTTPS. El bucket no es público: solo CloudFront lee de él (OAC) |
| Cognito | Registro con correo, verificación, login. Emite el token |
| API Gateway (HTTP API) | Valida el token en las rutas `/projects` y manda a la Lambda API |
| Lambda API | Una sola función con todas las rutas. Crea proyectos, firma URLs, guarda revisiones, publica |
| SQS + DLQ | Cola de documentos por procesar. 3 intentos; después el mensaje pasa a la cola de fallidos |
| Lambda worker | Procesa cada documento: hash, lectura, propuesta, extracción. Concurrencia máxima 2 |
| DynamoDB | Una tabla con clave `PK`/`SK`: proyectos por usuario y, por proyecto, documentos, versiones del esquema, registros, conflictos y propuestas |
| S3 privado | Originales, texto por página, respuestas del modelo y packs publicados por versión |

Decisiones de seguridad que conviene saber:

- El usuario sale del token (`sub`), nunca del cuerpo ni de la ruta. Un proyecto ajeno responde 404, no 403, para no revelar que existe. Se probó en AWS con dos usuarios reales.
- Los archivos se suben directo a S3 con URL firmada de 5 minutos. El worker comprueba tamaño y SHA-256 contra lo declarado antes de leer.
- CORS: la API acepta solo el origen de CloudFront. Localhost solo con una bandera explícita al desplegar.
- Los permisos de cada rol están acotados al ARN concreto de la tabla, la cola o el bucket. Sin comodines ni administrador. La API y el worker tienen roles separados.
- Toda la infraestructura se crea con scripts de AWS CLI idempotentes en `infra/` (decisión D2, en vez de SAM). Si un recurso ya existe, el script lo reutiliza.
- Costo: un lote real de 10 documentos usó unos 95 mil tokens de entrada y 20 mil de salida, alrededor de USD 0.20. El tope para las pruebas es USD 30, y si un lote pasa de USD 5 se detiene.

Límites decididos (D3): 20 MB por archivo, 60 páginas por PDF y 30 documentos por proyecto. Los PDF escaneados sin capa de texto se rechazan con motivo; no hay OCR.

## 6. Cómo se sostiene "funciona en cualquier área"

Tres pruebas, de la más fuerte a la más débil:

1. **El motor no conoce el dominio.** `scripts/check_agnostic.sh` falla si aparece vocabulario de combustión en `web/src/engine/`. Todo lo específico entra por pack, mapping y lente.
2. **Un segundo dominio real.** Ebullición y cambio de fase en microgravedad, también de PSI (Fluid Physics), con unidades mezcladas (°F, °C, kPa, W/cm²) y rangos escritos como texto. Dos tablas, 51 registros y 2 estudios pasaron por todo el backend en AWS y el mismo motor los abrió sin cambios.
3. **El modelo como asistente del mapping.** En T14, con 5 filas por tabla y sin vocabulario, el modelo coincidió con el mapping humano en 65 % de las columnas para la variable y en 47 % para variable y unidad juntas. En T32, con el vocabulario del esquema y el validador, llegó a 86 % en variable y unidad juntas (148 de 172). La conclusión que hay que decir: el modelo acelera la propuesta, pero la persona aprueba. Por eso existe la revisión.

Si preguntan qué haría falta para un área nueva: un pack que cumpla el contrato y una lente con títulos, presets y umbrales. No hay que tocar el motor ni la interfaz.

## 7. Datos para modelos predictivos

- **Exportación (T38).** CSV con unidad en la cabecera (`p_min [atm]`), DOI por fila y `group_id` = estudio, para dividir entrenamiento y prueba por estudio sin fuga de datos. Si hubo correcciones, el valor original y el corregido van en columnas separadas. Junto al CSV va `datacard.json`, con versiones, hashes, conversiones aplicadas, columnas rechazadas, licencias y la ficha de aptitud.
- **Ficha de aptitud (D4).** Tiene cuatro veredictos según umbrales visibles en la lente:

| Veredicto | Condiciones principales |
|---|---|
| Ready to train | ≥ 200 registros con resultado; cada entrada en ≥ 90 %; 0 sin convertir; ≥ 3 estudios; duplicados ≤ 1 %; si es clasificación, la clase minoritaria ≥ 20 registros y ≥ 10 % |
| Usable with cleaning | ≥ 50 registros; entradas en ≥ 60 %; sin convertir ≤ 20 %; ≥ 2 estudios; duplicados ≤ 10 % |
| Insufficient | Hay resultados, pero no alcanza lo anterior |
| External reference only | No hay resultados en el corpus, solo datasets citados |

- **Sugerencia por volumen.** Con menos de 1,000 registros, modelos clásicos (regresión regularizada, árboles, gradient boosting). Entre 1,000 y 10,000, clásicos primero. Aprendizaje profundo solo con 10,000 o más.
- **Lo que no hace.** No entrena modelos ni promete desempeño. Los umbrales son de partida para el hackathon, no un estándar.

## 8. Decisiones de diseño y su porqué

| Decisión | Alternativa descartada | Por qué |
|---|---|---|
| Comparar cobertura, no predecir | Un modelo que diga si algo arde | Con 0 pruebas de presión en sólidos, cualquier predicción sería extrapolación sin respaldo. Además, 12 investigaciones reportan el resultado en formatos distintos y BASS no lo reporta (D5) |
| Motor determinista en el navegador | Cálculo en servidor o con IA | Reproducible, auditable y rápido (~42 ms). No depende de la red ni de la IA. Escala sin costo de servidor |
| La IA solo traduce y elige | La IA redacta el análisis | Un número inventado destruye la confianza de un investigador. El verificador exige texto exacto |
| Distancia normalizada por σ | Distancia en unidades crudas | 1 atm y 1 % de O₂ no pesan lo mismo; σ pone las variables en una escala comparable y es visible y editable |
| La parte la decide la variable más débil | Promediar | Una atmósfera con O₂ estudiado y presión sin estudiar no está "medio estudiada": la presión sigue sin datos |
| Partición por fase | Un solo pool | Una llama de gas y un sólido no son comparables. Se mencionan como contexto, nunca como evidencia |
| Valores como intervalos | Puntos | Las tablas reportan rangos y valores exactos; el intervalo cubre ambos sin perder información |
| Mismo peso visual para "Not studied" | Destacar solo lo estudiado | Un hueco también es un resultado. Ningún nivel se comunica solo con color |
| Formato de artículo | Dashboard o landing | Es el formato que el investigador ya lee y cita: Key findings, Abstract, figuras numeradas, Methods, References |
| Scripts AWS CLI idempotentes | SAM o CloudFormation | Ya funcionaban, se pueden repetir sin romper nada y cada relevo entre laptops los puede correr (D2) |
| Datos fuera de git | Versionar el corpus | El repositorio solo guarda el pack publicado; las descargas de PSI son locales (D9) |
| Versiones inmutables del pack | Sobrescribir | Un informe citado debe poder reconstruirse con los mismos datos. Las correcciones crean una versión nueva |

## 9. Debilidades conocidas y cómo responderlas

Decirlas antes de que las encuentren da más confianza que esconderlas.

| Debilidad | Respuesta honesta |
|---|---|
| σ y los umbrales los eligió el equipo | Sí. Son explícitos, están en Methods y el revisor los ajusta. Cambiar σ cambia el corte entre "Near" y "Not studied", y el informe lo muestra |
| La distancia trata las variables como independientes | Sí: no modela interacciones. Si un área necesita una variable combinada, como la presión parcial de O₂, se agrega en el pack y el motor la trata igual. En la demo no se puede calcular porque los sólidos no registran presión |
| Solo 3 estudios de sólidos traen O₂ (BASS-II, SAFFIRE-I y SAFFIRE-II) | Es un hallazgo, no un error: la evidencia en sólidos es delgada y el informe lo dice con números |
| La gravedad viene de los metadatos, no de una columna | Está declarado en las notas del mapping y como hueco conocido de la lente |
| El modelo se equivoca en el mapping (47 % en T14) | Por eso propone y la persona aprueba. Con vocabulario y validador sube a 86 %, y aun así se revisa |
| Encontrar una cita literal no prueba que respalde el valor | Correcto. El validador garantiza que la cita existe; el respaldo semántico lo decide la revisión humana |
| No hay OCR | Los PDF escaneados se rechazan con motivo; no se inventa texto |
| No hay búsqueda en el contenido de los artículos (RAG) | Fuera de alcance a propósito. Las preguntas de contenido se declaran no soportadas |
| Las aprobaciones de la demo fueron delegadas, no de un experto | La frase correcta es "ninguna variable se publica sin aprobación", no "lo validó un experto" |

## 10. Preguntas técnicas probables (complemento de PITCH §6)

### 10.1 Motor y método

- **¿Cómo calculan la distancia?** Para cada estudio se busca su prueba más cercana. Por cada variable se mide cuánto queda fuera del intervalo de esa prueba, dividido entre σ, y se combina como distancia euclidiana. Una categoría distinta suma una penalización. En la base lunar, BASS-II queda a 7.8 puntos de O₂, entre σ = 5, es decir 1.56.
- **¿Por qué la prueba más cercana y no un promedio?** Porque la pregunta es si alguien probó algo parecido. Un promedio puede caer donde nadie probó nada.
- **¿Qué es σ?** La escala de diferencia que el área considera relevante por variable. No se estima de los datos; es una decisión explícita y editable.
- **¿Qué pasa con un valor dentro del rango pero sin pruebas en ese punto?** Sale "Scarce evidence" con motivo `no_record_at_value`. La envolvente no basta; tiene que haber una prueba que lo cubra.
- **¿Cómo tratan las banderas?** Cada bandera dice a qué variables afecta. Si todas las pruebas que cubren un valor tienen bandera en esa variable, el nivel baja a "Scarce".
- **¿Es reproducible?** Sí. Es una función pura: el mismo pack, la misma lente y el mismo escenario dan el mismo resultado. Hay vectores de prueba con datos reales que lo comprueban en cada cambio.
- **¿Cómo prueban el motor?** Pruebas unitarias (104 en la web, 164 en la API) y vectores "golden" con los hallazgos conocidos: 0 de 268, 22.2 % y el preset lunar.

### 10.2 Datos y extracción

- **¿De dónde salen los 1,986 registros?** De 22 tablas experimentales de 24 investigaciones de combustión de NASA PSI, armonizadas con un mapping revisado columna por columna.
- **¿Qué hacen con columnas que no entienden?** Se rechazan o entran con bandera. Ejemplo: el ventilador de BASS-II no está en cm/s y queda sin convertir.
- **¿Leen los PDF?** Sí, como texto por página, para contexto y citas. En la demo ningún valor de tabla sale de un PDF.
- **¿Cómo detectan duplicados?** Por SHA-256 del archivo: un documento repetido en el proyecto se marca `skipped`. En la ficha ML se cuentan registros idénticos entre fuentes.
- **¿Qué pasa si una tabla trae "60-78"?** Se guarda como intervalo [60, 78]. Si el formato es ambiguo, la celda se rechaza y se cuenta.

### 10.3 Arquitectura

- **¿Por qué dos Lambdas y una cola?** La API responde rápido y el procesamiento de documentos puede tardar minutos. La cola desacopla, reintenta y aparta los fallos.
- **¿Qué pasa si el worker falla a la mitad?** Hay checkpoints por documento. Reanudar reencola solo lo pendiente o fallido; lo terminado no se repite ni se vuelve a pagar.
- **¿Qué pasa con un documento que siempre falla?** Tras 3 intentos va a la cola de fallidos. Una persona lo revisa; no hay reenvío automático. Se probó en AWS con un archivo corrupto.
- **¿Por qué DynamoDB?** Los accesos son siempre por proyecto y por usuario, con clave conocida. Una tabla bajo demanda cuesta casi nada en reposo y no hay servidor que mantener.
- **¿Cómo se versiona?** Cada publicación crea `v1`, `v2`… inmutables. Publicar dos veces sin cambios no crea versión nueva. Corregir un valor y publicar crea la siguiente.

### 10.4 IA

- **¿Qué impide que la IA cambie un nivel?** Los niveles no pasan por la IA. `/analysis` recibe hallazgos que el servidor recalcula y solo puede devolver oraciones idénticas a las permitidas.
- **¿Y si alguien escribe "ignora tus instrucciones" en la pregunta?** El texto va delimitado como dato y la salida se valida contra el esquema. Lo peor posible es una respuesta "unsupported".
- **¿Qué tan seguido falla?** En el lote real de 10 documentos, la primera pasada dio 6 propuestas válidas; tras precisar el prompt y reintentar solo las rechazadas, 8. No se relajó el validador.
- **¿Por qué no fine-tuning?** No hace falta: el modelo no aprende el dominio, solo traduce a un esquema que ya está dado.

## 11. Números de memoria

| Qué | Número |
|---|---|
| Investigaciones / tablas / registros | 24 / 22 / 1,986 (1,889 pruebas + 97 campañas) |
| Pruebas de sólidos | 268; ninguna registra presión |
| O₂ máximo probado en sólidos | 22.2 % (BASS-II, PSI-25, fila 2, DOI 10.60555/4qc4-de67) |
| Rango de O₂ en sólidos | 13.6 a 22.2 %, en 140 de 268 pruebas |
| Base lunar | 30 % de O₂ a 10.2 psi (0.694 atm) |
| Aire en la Tierra | 21 % de O₂ a 1 atm |
| Distancia de BASS-II a la base lunar | 1.56 (nota C) |
| Umbrales | tolerancia 0.25 σ, cercanía 3 σ, nota A ≤ 1.0, 2 estudios mínimos |
| σ | O₂ 5 puntos · presión 0.3 atm · flujo 10 cm/s · gravedad 0.05 g |
| Registros con bandera | 147 |
| Velocidad del motor | ~42 ms por actualización |
| Límites de corpus | 20 MB · 60 páginas · 30 documentos |
| Lote real | 10 documentos + 1 corrupto: 8 válidos, 3 a la cola de fallidos, ~USD 0.20 |
| Segundo dominio | Ebullición: 51 registros, 2 estudios, 5 celdas rechazadas |
| Mapping por el modelo | 47 % (T14, sin vocabulario) → 86 % (T32, con vocabulario y validador) |
| Modelo | Claude Haiku 4.5 en Bedrock |
| Tope de gasto | USD 30 en Bedrock; revisión si un lote pasa de USD 5 |

## 12. Dónde está cada cosa, por si piden ver código

| Pregunta | Archivo |
|---|---|
| Niveles, notas y ranking | `web/src/engine/core.ts` (`rank`, `closeness`, `coverage`) |
| Niveles por variable y hallazgos | `web/src/engine/interpret.ts` (`evidenceLevels`, `findings`, `gaps`) |
| Partes, grafo, explicación y diferencias | `web/src/engine/extend.ts` |
| Ficha ML | `web/src/engine/dataset.ts` |
| Contrato del pack | `web/src/engine/types.ts` |
| `/ask` y `/analysis` | `api/handler.py` |
| Verificador | `api/verify.py` |
| Worker | `api/ingest_worker.py` |
| Revisión del esquema | `api/schema_review.py` |
| Mapping humano de la demo | `web/public/demo/mapping.json` |
| Prueba agnóstica | `scripts/check_agnostic.sh`, `docs/agnostic_proof.md` |
| Contratos del backend | `docs/CONTRATOS_FASE2.md` §5 |
