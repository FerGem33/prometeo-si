# Prometeo — Documento de casos de uso

Nov 14, 2026 · @Jesus Armando Garcia Davila

## 1. Visión del producto

Prometeo convierte un conjunto de documentos científicos y una intención escrita en una base de conocimiento con cita por dato, y genera una interfaz hecha a la medida para consultarla. La pregunta que responde es: ¿qué sabemos ya sobre lo que quiero hacer, qué tan sólido es y dónde no hay evidencia?

**El problema.** Quien diseña o investiga en un área técnica enfrenta decenas de artículos, reportes y tablas de experimentos. Saber qué se ha estudiado en *sus* condiciones lleva semanas de lectura. Un chat genérico sobre PDF responde rápido, pero no muestra qué tan cerca está la evidencia de su caso ni dónde hay huecos.

**La propuesta.** El usuario aporta dos cosas:

- **Un corpus:** artículos, reportes, tablas de experimentos y otros documentos científicos.
- **Una intención:** para qué quiere usar ese conocimiento. Por ejemplo, "diseñar hábitats seguros frente a llamas en microgravedad".

Con eso, Prometeo entrega:

1. **Una base de conocimiento estructurada:** variables, condiciones de prueba, resultados, relaciones y huecos declarados por los autores. Cada dato lleva su cita (documento, página, fragmento).
2. **Una interfaz generada (GenUI)** para esa intención: ejes, escenarios, vistas y preguntas sugeridas elegidas para el dominio.
3. **Un asistente de evidencia** que encuentra los documentos más relevantes, los sintetiza con citas y evalúa una propuesta del usuario parte por parte: qué está respaldado, qué está refutado, qué se puede extrapolar, dónde hay poca evidencia y qué nadie ha estudiado. También detecta qué datos del corpus sirven para entrenar modelos de machine learning o deep learning.

**El principio de confianza.** La IA traduce y redacta; el cálculo lo hace un motor determinista. La IA propone el esquema, configura la interfaz, convierte preguntas en filtros y redacta conclusiones. Los niveles de evidencia, hallazgos y rankings los calcula un motor reproducible, y un verificador elimina cualquier frase sin respaldo.

**El pitch.** Una sola plataforma para cualquier área de conocimiento y cualquier objetivo: cambia el corpus y la intención, y cambia la base y la interfaz. El matiz honesto: hoy funciona mejor con corpus que reportan condiciones medibles (experimentos, ensayos, pruebas de materiales). La sección 12 detalla dónde encaja y dónde todavía no.

## 2. Conceptos clave

Estos términos se usan igual en todo el documento, en la interfaz y en el código.

| Término | Qué es |
| --- | --- |
| **Corpus** | El conjunto de documentos que sube el usuario: PDF de artículos, reportes técnicos, tablas (CSV, Excel) y notas de experimentos. |
| **Intención** | Texto libre que dice para qué se usará el conocimiento. Orienta qué variables importan, qué documentos son relevantes y cómo se arma la interfaz. |
| **Esquema** | Las variables del dominio (nombre, unidad, rango, tipo) y cómo se mapean las columnas y menciones de cada fuente. La IA lo propone; el usuario lo aprueba. |
| **Registro** | Una prueba o experimento concreto, con sus condiciones y resultados. Cada variable puede venir de una fuente distinta. |
| **Procedencia** | De dónde sale cada valor: documento, página, fragmento citado y tipo de fuente (tabla o texto del artículo). Se guarda por valor, no por registro. |
| **Relación** | Una afirmación de los autores que une variables, con su cita. Ejemplo: "más flujo de aire aumenta la propagación". |
| **Hueco declarado** | Algo que los propios autores dicen que falta estudiar, con su cita. |
| **Base de conocimiento** | Esquema + registros + relaciones + huecos, todo con procedencia. Se publica como un paquete (`pack`) JSON validado. |
| **Lente** | La configuración de interfaz generada una vez por proyecto: ejes por defecto, escenarios predefinidos, vistas activas, textos y preguntas sugeridas. Es la parte "GenUI". |
| **Propuesta** | Lo que el usuario quiere evaluar, expresado como valores o rangos de las variables. Ejemplo: un hábitat con 25 % de O₂ a 0.5 atm y tela Nomex. |
| **Motor de evidencia** | Funciones puras y deterministas que, sobre el `pack`, calculan cercanía, nivel de evidencia, hallazgos y ranking. No contiene vocabulario de ningún dominio. |
| **Nivel de evidencia** | La clasificación de cada parte de una propuesta (ver abajo). |
| **Conjunto de datos candidato** | Una fuente que podría servir para entrenar un modelo: tablas del corpus, registros unificados de la base o repositorios que mencionan los artículos. |
| **Ficha de aptitud** | Las métricas que calcula el motor sobre un candidato (tamaño, faltantes, cobertura, balance, duplicados, riesgo de fuga) y su clasificación final. |

**Niveles de evidencia.** Cada variable o parte de una propuesta recibe uno:

| Nivel | Significa |
| --- | --- |
| **Respaldado** | Hay estudios en condiciones iguales o muy cercanas, y sus resultados favorecen la propuesta. |
| **Refutado** | Hay estudios en condiciones iguales o muy cercanas, y sus resultados van en contra. |
| **Extrapolable** | No hay estudios en esas condiciones exactas, pero sí cerca y con una tendencia clara que permite estimar. |
| **Evidencia escasa** | Hay uno o dos estudios lejanos, o con baja confianza. |
| **Sin estudiar** | Ningún documento del corpus cubre esas condiciones. |

Cuando los estudios cercanos se contradicen entre sí, el nivel lleva una marca de **conflicto** y la interfaz muestra ambos lados.

## 3. Actores

Cuatro tipos de persona y dos componentes del sistema participan en los casos de uso.

| Actor | Tipo | Qué busca o hace |
| --- | --- | --- |
| **Visitante** | Persona sin cuenta | Prueba la demo con un corpus precargado para entender el valor en minutos. No guarda nada. |
| **Investigador** | Persona registrada | Arma una base con su bibliografía, encuentra lo relevante y detecta huecos para su siguiente estudio. |
| **Diseñador o ingeniero** | Persona registrada | Evalúa una propuesta concreta (un hábitat, un material, un proceso) contra la evidencia existente. |
| **Lector** | Persona con enlace | Recibe un informe o proyecto compartido; lee y verifica citas, sin editar. |
| **Servicio de IA** | Sistema | Extrae datos con cita, propone el esquema, genera la lente, traduce preguntas a filtros y redacta análisis. Nunca calcula niveles de evidencia. |
| **Motor de evidencia** | Sistema | Calcula cercanía, niveles, hallazgos y ranking sobre el `pack`, de forma determinista y reproducible. |

El investigador y el diseñador actúan también como **revisores**: aprueban el esquema y corrigen datos antes de publicar la base. Son el "humano en el ciclo".

## 4. Mapa de casos de uso

Son 25 casos en seis grupos; 19 forman el MVP. El recorrido va de los documentos a la base, de la base a la interfaz, y de la interfaz a una respuesta con evidencia.

&#91;embedded content: flujo de Prometeo · de los documentos al informe\]

Ningún dato llega a la base sin revisión humana, y todo lo que el usuario ve abajo de la base lo calcula el motor, no la IA.

| ID | Caso de uso | Actor principal | Prioridad |
| --- | --- | --- | --- |
| **A. Acceso** |  |  |  |
| CU-01 | Probar la demo sin cuenta | Visitante | MVP |
| CU-02 | Registrarse e iniciar sesión | Investigador, diseñador | MVP |
| CU-03 | Gestionar proyectos | Investigador, diseñador | Posterior |
| CU-04 | Convertir la demo en cuenta sin perder el trabajo | Visitante | Posterior |
| **B. Construcción de la base** |  |  |  |
| CU-05 | Crear un proyecto con corpus e intención | Investigador, diseñador | MVP |
| CU-06 | Procesar e indexar los documentos | Servicio de IA | MVP |
| CU-07 | Revisar y aprobar el esquema | Revisor | MVP |
| CU-08 | Corregir datos y resolver conflictos | Revisor | MVP |
| CU-09 | Añadir documentos a una base publicada | Investigador, diseñador | Posterior |
| **C. Exploración** |  |  |  |
| CU-10 | Explorar la base en la interfaz generada | Todos | MVP |
| CU-11 | Encontrar los documentos más relevantes | Todos | MVP |
| CU-12 | Sintetizar documentos con citas | Todos | MVP |
| CU-13 | Rastrear la procedencia de un dato | Todos | MVP |
| CU-14 | Comparar estudios lado a lado | Investigador | MVP |
| **D. Evaluación de una propuesta** |  |  |  |
| CU-15 | Describir una propuesta | Diseñador | MVP |
| CU-16 | Obtener el mapa de evidencia de la propuesta | Diseñador | MVP |
| CU-17 | Ajustar la propuesta y ver el cambio | Diseñador | MVP |
| CU-18 | Consultar relaciones y huecos declarados | Investigador | MVP |
| **E. Preguntas e informe** |  |  |  |
| CU-19 | Preguntar en lenguaje natural | Todos | MVP (ligero) |
| CU-20 | Leer el análisis redactado y verificado | Todos | MVP |
| CU-21 | Exportar el informe tipo artículo | Investigador, diseñador | MVP |
| CU-22 | Compartir un proyecto o informe | Investigador, diseñador | Posterior |
| CU-23 | Preguntar sobre el contenido de los artículos | Todos | Futuro |
| **F. Datos para aprendizaje automático** |  |  |  |
| CU-24 | Detectar datos aprovechables para entrenar modelos | Investigador | MVP |
| CU-25 | Exportar un conjunto de datos para entrenamiento | Investigador | Posterior |

## 5. Grupo A: acceso

La demo sin cuenta es la puerta de entrada: debe mostrar el valor completo en menos de tres minutos, sin registro.

### CU-01 · Probar la demo sin cuenta

**Actor:** visitante · **Prioridad:** MVP

**Objetivo:** ver el producto funcionando con datos reales antes de decidir si se registra.

**Flujo principal**

1. El visitante entra a la página principal y elige "Probar la demo".
2. El sistema abre un proyecto precargado: corpus de combustión en microgravedad, intención de diseño de hábitats, esquema ya aprobado.
3. El visitante ve la interfaz generada con una propuesta de ejemplo ya evaluada.
4. Cambia valores de la propuesta, filtra estudios, abre citas y lee el análisis.
5. Un aviso discreto le ofrece crear una cuenta para usar sus propios documentos.

**Alternos**

- Si el visitante intenta subir documentos, el sistema le pide registrarse (CU-02).
- Si hay varias demos (por ejemplo, otro dominio), el visitante elige una en un selector.

**Criterios de aceptación**

- La demo carga sin servidor de cálculo: el motor corre en el navegador sobre un `pack` estático.
- Toda interacción de la demo responde en menos de 200 ms, salvo las que llaman a la IA.
- Nada de lo que hace el visitante se guarda en el servidor.

### CU-02 · Registrarse e iniciar sesión

**Actor:** investigador o diseñador · **Prioridad:** MVP

**Objetivo:** tener un espacio propio para crear proyectos con sus documentos.

**Flujo principal**

1. El usuario elige "Crear cuenta" e ingresa correo y contraseña, o usa un proveedor externo (Google).
2. El sistema verifica el correo y crea el espacio de trabajo vacío.
3. El usuario llega a su lista de proyectos, con un acceso directo a "Nuevo proyecto" (CU-05).

**Alternos**

- Correo ya registrado: el sistema ofrece iniciar sesión o recuperar la contraseña.

**Criterios de aceptación**

- Los documentos y bases de un usuario son privados por defecto y nadie más los ve.

### CU-03 · Gestionar proyectos

**Actor:** investigador o diseñador · **Prioridad:** posterior

**Objetivo:** mantener varias bases (una por tema o por objetivo) y volver a ellas.

**Flujo principal**

1. El usuario ve sus proyectos con nombre, intención, número de documentos y fecha.
2. Puede abrir, renombrar, duplicar (misma base, otra intención) o borrar un proyecto.

**Criterios de aceptación**

- Duplicar un proyecto con otra intención genera una lente nueva sin reprocesar los documentos.
- Borrar pide confirmación y elimina también los archivos subidos.

### CU-04 · Convertir la demo en cuenta sin perder el trabajo

**Actor:** visitante · **Prioridad:** posterior

**Objetivo:** que lo que el visitante exploró (propuesta, filtros) no se pierda al registrarse.

**Flujo principal**

1. El visitante elige "Guardar esta exploración" y se registra.
2. El sistema crea en su cuenta una copia del proyecto demo con su propuesta y filtros.

**Criterios de aceptación**

- El estado de la demo se conserva en el navegador hasta que se registra o cierra la pestaña.

## 6. Grupo B: construcción de la base de conocimiento

Ninguna base se publica sin aprobación humana: la IA propone y el usuario decide. Este grupo convierte documentos sueltos en un `pack` validado.

### CU-05 · Crear un proyecto con corpus e intención

**Actor:** investigador o diseñador · **Prioridad:** MVP

**Objetivo:** dar al sistema la materia prima y el propósito.

**Flujo principal**

1. El usuario elige "Nuevo proyecto" y le pone nombre.
2. Arrastra sus archivos: PDF, CSV, Excel o texto.
3. Escribe la intención en lenguaje natural. Ejemplo: "Quiero diseñar hábitats lunares y saber qué condiciones de oxígeno, presión y materiales están estudiadas frente a llamas en microgravedad".
4. El sistema muestra ejemplos de buenas intenciones y, si la intención es muy vaga, sugiere precisarla.
5. El usuario confirma y el procesamiento empieza (CU-06).

**Alternos**

- Archivo no legible (PDF escaneado sin texto, formato no soportado): se marca y se excluye, con el motivo.
- Corpus demasiado pequeño (menos de 3 documentos): el sistema avisa que el mapa de evidencia será pobre, pero permite continuar.

**Criterios de aceptación**

- La intención se guarda con el proyecto y puede editarse después; editarla regenera la lente, no la extracción.

### CU-06 · Procesar e indexar los documentos

**Actor:** servicio de IA · **Prioridad:** MVP

**Objetivo:** extraer de cada documento los elementos clave, siempre con cita.

**Flujo principal**

1. El sistema perfila las tablas (columnas, unidades, rangos) y resume cada PDF.
2. Con esos perfiles y la intención, la IA propone el esquema: variables, unidades, rangos y mapeo de columnas.
3. La IA extrae de cada documento:
   - condiciones de prueba y resultados, como valores o rangos;
   - relaciones afirmadas por los autores;
   - huecos que los autores declaran, y conjuntos de datos que mencionan (tablas suplementarias, repositorios, DOI y licencia).
4. Cada elemento queda con su procedencia: documento, página, fragmento citado y tipo de fuente (tabla o texto).
5. El sistema une valores de distintas fuentes en un mismo registro cuando describen la misma prueba.
6. El usuario ve el avance por documento y recibe aviso al terminar.

**Alternos**

- Un valor sin fragmento que lo respalde se descarta; nunca se guarda un dato sin cita.
- Dos fuentes dan valores distintos para la misma prueba: se guardan ambos y se marca un conflicto para CU-08.
- Un documento no aporta nada al esquema: se conserva como fuente de contexto, sin registros.

**Criterios de aceptación**

- El 100 % de los valores, relaciones y huecos tiene procedencia.
- La extracción se puede reanudar si se interrumpe, sin repetir documentos ya procesados.
- Las conversiones de unidades aplicadas quedan registradas para la sección de métodos del informe.

### CU-07 · Revisar y aprobar el esquema

**Actor:** revisor · **Prioridad:** MVP

**Objetivo:** que las variables y su significado sean correctos antes de calcular nada.

**Flujo principal**

1. El sistema muestra una pantalla de revisión con cada variable propuesta: nombre, unidad, rango observado, cuántas fuentes la reportan y ejemplos citados.
2. El revisor acepta, renombra, fusiona ("O2" y "oxígeno" son la misma), cambia unidades o rechaza variables.
3. Ve también las columnas que se rechazaron y por qué, y puede rescatarlas.
4. Aprueba. El sistema valida y publica el `pack`.

**Alternos**

- El revisor sale sin aprobar: el proyecto queda en borrador y se retoma donde quedó.

**Criterios de aceptación**

- Sin aprobación no se habilitan la exploración ni la evaluación.
- Cada decisión del revisor queda en el historial del proyecto.

### CU-08 · Corregir datos y resolver conflictos

**Actor:** revisor · **Prioridad:** MVP

**Objetivo:** arreglar extracciones erróneas y decidir qué valor usar cuando las fuentes discrepan.

**Flujo principal**

1. El revisor abre la lista de conflictos y de valores con baja confianza.
2. Para cada uno ve los fragmentos citados lado a lado, con enlace a la página del PDF.
3. Elige un valor, conserva ambos como rango o corrige a mano con una nota.
4. El motor recalcula todo lo que depende de ese dato.

**Criterios de aceptación**

- Un valor corregido a mano se marca como "editado por el usuario" y conserva la cita original.

### CU-09 · Añadir documentos a una base publicada

**Actor:** investigador o diseñador · **Prioridad:** posterior

**Objetivo:** ampliar la base cuando sale un artículo nuevo, sin rehacerla.

**Flujo principal**

1. El usuario sube documentos nuevos al proyecto.
2. El sistema los extrae con el esquema ya aprobado y propone solo las variables nuevas.
3. El revisor aprueba los cambios y el sistema muestra qué niveles de evidencia cambiaron.

**Criterios de aceptación**

- El usuario ve un resumen de diferencias: registros nuevos, conflictos nuevos y niveles que subieron o bajaron.

## 7. Grupo C: exploración con interfaz generada

La interfaz no es fija: la IA la configura una vez por proyecto a partir de la intención y del esquema, con componentes de un catálogo cerrado. Así cada dominio tiene su propia vista sin que la IA escriba código de interfaz.

### CU-10 · Explorar la base en la interfaz generada

**Actor:** todos · **Prioridad:** MVP

**Objetivo:** entender de un vistazo qué contiene la base y moverse por ella.

**Flujo principal**

1. Al publicar la base, la IA genera la lente: ejes por defecto, escenarios predefinidos, vistas activas, etiquetas y preguntas sugeridas.
2. El sistema valida la lente contra el esquema y el catálogo de componentes.
3. El usuario ve el tablero del proyecto:
   - **mapa de evidencia:** cualquier par de variables numéricas, con cada estudio como punto o rango;
   - **cobertura:** qué variables reporta cada fuente;
   - **hallazgos clave** calculados por el motor;
   - **barra de preguntas sugeridas.**
4. Cambia ejes, filtra por tipo de estudio, fuente o rango, y todo se recalcula al instante.

**Alternos**

- Si la lente generada no pasa la validación, el sistema usa una lente por defecto construida solo con el esquema.
- El usuario puede regenerar la lente o ajustar a mano ejes y escenarios.

**Criterios de aceptación**

- La lente solo puede usar componentes del catálogo y variables que existen en el esquema.
- Filtrar y cambiar ejes no llama a la IA ni al servidor.

### CU-11 · Encontrar los documentos más relevantes

**Actor:** todos · **Prioridad:** MVP

**Objetivo:** saber qué leer primero para su intención o su propuesta.

**Flujo principal**

1. El usuario abre la vista de fuentes.
2. El motor ordena los documentos por cercanía de sus condiciones a la propuesta activa (o al centro de la intención si no hay propuesta) y por cantidad de variables relevantes que reportan.
3. Cada documento muestra por qué aparece en esa posición: qué variables coinciden y qué tan cerca están.

**Criterios de aceptación**

- El orden es reproducible: la misma base y la misma propuesta dan el mismo ranking.
- La explicación del ranking cita los valores reales, no solo una puntuación.

### CU-12 · Sintetizar documentos con citas

**Actor:** todos · **Prioridad:** MVP

**Objetivo:** entender qué aporta un documento o un grupo de documentos sin leerlos completos.

**Flujo principal**

1. El usuario selecciona uno o varios documentos (por ejemplo, los cinco más relevantes).
2. El sistema arma una síntesis a partir de lo extraído: condiciones estudiadas, resultados, relaciones que afirman y huecos que declaran.
3. La IA redacta la síntesis en prosa y cada frase lleva su cita.
4. El verificador elimina cualquier frase que no se pueda unir a un dato o fragmento de la base.

**Criterios de aceptación**

- Ninguna frase de la síntesis queda sin cita.
- La síntesis distingue lo que dicen los autores de lo que calcula el motor.

### CU-13 · Rastrear la procedencia de un dato

**Actor:** todos · **Prioridad:** MVP

**Objetivo:** verificar cualquier número o afirmación en su fuente original.

**Flujo principal**

1. El usuario pasa el cursor o hace clic en un valor, punto, celda o frase.
2. El sistema muestra documento, página, fragmento citado y tipo de fuente.
3. Un enlace abre el PDF en esa página con el fragmento resaltado.

**Criterios de aceptación**

- Funciona en todas las vistas: mapa, tablas, hallazgos, análisis e informe.
- Si el valor se convirtió de unidad o se editó a mano, el sistema lo dice.

### CU-14 · Comparar estudios lado a lado

**Actor:** investigador · **Prioridad:** MVP

**Objetivo:** ver en qué se parecen y en qué difieren varios estudios frente a la propuesta.

**Flujo principal**

1. El usuario abre la tabla de calor estudio × variable.
2. Cada celda muestra la cercanía del estudio a la propuesta en esa variable, con color.
3. Al pasar el cursor ve el valor real (por ejemplo, "22.2 % frente a 30 %").
4. Ordena por cualquier columna o por cercanía total.

**Criterios de aceptación**

- La tabla muestra valores reales, no solo puntuaciones derivadas.
- La vista de radar, si se incluye, es secundaria y lleva aviso de que el orden de los ejes cambia la forma.

## 8. Grupo D: evaluación de una propuesta contra la evidencia

Este es el diferenciador: el usuario describe lo que quiere hacer y Prometeo le dice, parte por parte, qué tan respaldado está. Responde a "¿qué de mi idea ya está estudiado, qué me refuta, qué puedo extrapolar y dónde estoy a ciegas?".

### CU-15 · Describir una propuesta

**Actor:** diseñador · **Prioridad:** MVP

**Objetivo:** expresar su idea en términos que el motor pueda comparar con la base.

**Flujo principal**

1. El usuario abre "Nueva propuesta". Puede partir de un escenario predefinido de la lente (por ejemplo, "base lunar", "estación orbital", "traje") o de cero.
2. Fija valores o rangos con controles generados para cada variable: deslizadores para números, listas para categorías (por ejemplo, material).
3. Opcionalmente la describe en lenguaje natural ("25 % de O₂ a 0.5 atm con Nomex") y la IA la convierte en valores (CU-19).
4. Puede agrupar variables en **partes** con nombre (por ejemplo, "atmósfera de cabina", "revestimiento interior"), que se evaluarán por separado.
5. Guarda la propuesta con un nombre.

**Alternos**

- El usuario fija un valor fuera de todo rango observado: el sistema lo permite y avisa que esa parte quedará "sin estudiar".
- La descripción en lenguaje natural menciona algo que no está en el esquema: el sistema lo señala como "no evaluable con esta base" en lugar de ignorarlo.

**Criterios de aceptación**

- Toda propuesta se valida contra el esquema: solo variables existentes y unidades correctas.
- Los escenarios predefinidos vienen de la lente y llevan etiquetas del dominio, pero el motor los trata como `presets` genéricos.

### CU-16 · Obtener el mapa de evidencia de la propuesta

**Actor:** diseñador · **Prioridad:** MVP

**Objetivo:** saber, para cada variable y cada parte, qué nivel de evidencia tiene y por qué.

**Flujo principal**

1. El motor calcula la cercanía de cada registro de la base a la propuesta, variable por variable.
2. Asigna a cada variable y a cada parte un nivel: respaldado, refutado, extrapolable, evidencia escasa o sin estudiar, con marca de conflicto si aplica.
3. El usuario ve un resumen tipo semáforo por parte y, al abrir cada una:
   - los estudios que sostienen el nivel, con sus valores reales y citas;
   - las relaciones de los autores que aplican (por ejemplo, "más O₂ acelera la propagación");
   - los huecos declarados que tocan esa zona.
4. El motor genera hallazgos clave por reglas: "la presión de 0.5 atm solo tiene un estudio cercano", "ningún estudio probó Nomex por encima de 30 % de O₂".

**Alternos**

- Base sin variable de resultado clara: el sistema evalúa cobertura (estudiado, extrapolable, sin estudiar) pero no respaldado o refutado, y lo dice.

**Criterios de aceptación**

- Cada nivel es explicable: el usuario ve qué estudios y qué umbral lo produjeron.
- Los niveles los calcula solo el motor; la IA no puede cambiarlos.
- El mismo `pack` y la misma propuesta dan siempre el mismo resultado.

### CU-17 · Ajustar la propuesta y ver el cambio

**Actor:** diseñador · **Prioridad:** MVP

**Objetivo:** explorar alternativas (¿y si bajo el oxígeno?, ¿y si cambio el material?) y encontrar la versión más respaldada.

**Flujo principal**

1. El usuario mueve un control o escribe un cambio ("¿y si fuera 21 % de O₂?").
2. El motor recalcula niveles, hallazgos, ranking y gráficas al instante.
3. El sistema resalta qué cambió: partes que subieron o bajaron de nivel.
4. El usuario puede guardar la variante y comparar dos propuestas lado a lado.

**Criterios de aceptación**

- El recálculo ocurre en el navegador en menos de 200 ms para bases de hasta unos miles de registros.
- La comparación muestra diferencias de nivel por parte, no solo dos tableros.

### CU-18 · Consultar relaciones y huecos declarados

**Actor:** investigador · **Prioridad:** MVP

**Objetivo:** ver lo que dicen los artículos, no solo lo que miden: qué relaciones afirman y qué piden estudiar.

**Flujo principal**

1. El usuario abre la vista de relaciones: un grafo o lista de afirmaciones que unen variables, cada una con su cita.
2. Filtra por variable, por documento o por sentido de la relación.
3. Abre la vista de huecos: lo que los autores declaran pendiente, junto con las zonas que el motor detecta sin estudiar.
4. Marca huecos de interés para incluirlos en el informe.

**Criterios de aceptación**

- Se distingue visualmente un hueco declarado por un autor de un hueco calculado por el motor.
- Si dos documentos afirman relaciones opuestas, ambas aparecen y se marca el conflicto.

## 9. Grupo E: preguntas e informe

Las preguntas en lenguaje natural no se responden con un chat libre: se traducen a filtros o escenarios y el motor recalcula. Esto las hace baratas, verificables y consistentes con el resto de la interfaz.

### CU-19 · Preguntar en lenguaje natural

**Actor:** todos · **Prioridad:** MVP (ligero)

**Objetivo:** consultar la base sin aprender la interfaz.

**Flujo principal**

1. El usuario escribe en la barra de preguntas o elige una sugerida. Ejemplo: "¿Qué pasa a 25 % de O₂ y 0.5 atm con Nomex?".
2. La IA convierte la pregunta en un JSON de filtros o de escenario: `{"o2": 25, "p": 0.5, "material": "Nomex"}`.
3. El sistema valida el JSON contra el esquema (variables existentes, rangos, unidades).
4. El motor recalcula y la interfaz muestra el resultado: el mapa filtrado o la propuesta evaluada.
5. El sistema muestra cómo interpretó la pregunta ("Entendí: O₂ = 25 %, presión = 0.5 atm, material = Nomex") para que el usuario lo corrija.

**Tipos de pregunta que cubre**

- Condiciones: "qué pasa a 25 % de O₂".
- Filtros: "solo estudios de supresión", "cuáles midieron flujo de aire".
- Comparaciones: "compara Nomex con algodón a 0.5 atm".

**Alternos**

- La pregunta trata del contenido de los artículos ("qué mecanismo explica la extinción en FLEX"): el sistema dice que hoy no puede responderla como filtro y ofrece las relaciones y fragmentos citados relacionados. La respuesta completa queda para CU-23.
- La pregunta no mapea a ninguna variable: el sistema lo dice y sugiere preguntas válidas.

**Criterios de aceptación**

- Una sola llamada a la IA por pregunta.
- Un JSON inválido nunca llega al motor.

### CU-20 · Leer el análisis redactado y verificado

**Actor:** todos · **Prioridad:** MVP

**Objetivo:** tener una conclusión en prosa clara, sin perder el respaldo.

**Flujo principal**

1. El usuario pide el análisis de la propuesta o de la vista actual.
2. La IA redacta un veredicto a partir solo de los hallazgos ya calculados por el motor.
3. El verificador revisa cada frase contra los hallazgos y las citas, y elimina las que no tienen respaldo.
4. El usuario lee el análisis con cada afirmación enlazada a su evidencia.

**Criterios de aceptación**

- El análisis nunca contradice un nivel calculado por el motor.
- El sistema indica cuántas frases eliminó el verificador.

### CU-21 · Exportar el informe tipo artículo

**Actor:** investigador o diseñador · **Prioridad:** MVP

**Objetivo:** llevarse un documento con formato académico para compartir, presentar o anexar.

**Flujo principal**

1. El usuario elige "Generar informe" desde una propuesta o desde el proyecto.
2. El sistema llena una plantilla fija con datos del `pack`:

| Sección del informe | Se llena desde |
| --- | --- |
| Título y escenarios | La lente (generada por IA y validada) |
| Resumen y hallazgos clave | Los hallazgos del motor + texto verificado |
| Figura 1: mapa de evidencia | Los ejes por defecto de la lente |
| Figura de cobertura | El esquema aprobado |
| Evaluación de la propuesta | Niveles por parte, con estudios y citas |
| Relaciones y huecos | Lo extraído de los artículos + huecos calculados |
| Métodos | El mapeo: conversiones, columnas rechazadas, decisiones del revisor |
| Fuentes | La lista de documentos con su referencia |

3. El usuario revisa la vista previa y descarga en PDF (y opcionalmente Markdown o Word).

**Criterios de aceptación**

- La estructura y la estética son las mismas en cualquier dominio; solo cambian variables, textos y datos.
- Ningún texto del informe está escrito a mano para un dominio.

### CU-22 · Compartir un proyecto o informe

**Actor:** investigador o diseñador · **Prioridad:** posterior

**Objetivo:** que un colega o un evaluador vea el resultado y verifique las citas.

**Flujo principal**

1. El usuario genera un enlace de solo lectura a un proyecto, una propuesta o un informe.
2. El lector abre el enlace, explora y rastrea citas (CU-13), pero no edita ni ve documentos que el dueño no compartió.

**Criterios de aceptación**

- El dueño puede revocar el enlace en cualquier momento.

### CU-23 · Preguntar sobre el contenido de los artículos

**Actor:** todos · **Prioridad:** futuro

**Objetivo:** responder preguntas que no son condiciones ni filtros, como mecanismos, métodos o interpretaciones de los autores.

**Flujo principal**

1. El usuario pregunta algo como "¿qué mecanismo explica la extinción en FLEX?".
2. El sistema recupera los fragmentos más pertinentes del corpus (RAG).
3. La IA responde solo con esos fragmentos, cada frase citada, y el verificador elimina lo no respaldado.

**Criterios de aceptación**

- La respuesta se presenta separada de los niveles de evidencia, como "lo que dicen los autores".

## 10. Grupo F: datos para aprendizaje automático

Prometeo también detecta qué datos del corpus sirven para entrenar un modelo de machine learning o deep learning, y qué tan listos están. La base ya separa condiciones (posibles variables de entrada) y resultados (posibles variables objetivo), cada valor con su cita; este grupo los evalúa como conjunto de entrenamiento.

### CU-24 · Detectar datos aprovechables para entrenar modelos

**Actor:** investigador · **Prioridad:** MVP

**Objetivo:** saber si el corpus contiene datos suficientes y adecuados para entrenar un modelo, dónde están y qué falta.

**Flujo principal**

1. El usuario abre la vista "Datos para ML" del proyecto, o lo pide en la barra de preguntas ("quiero predecir la velocidad de propagación").
2. El sistema lista los conjuntos de datos candidatos:
   - tablas del corpus y registros ya unificados en la base;
   - datos suplementarios y repositorios que mencionan los artículos (DOI, Zenodo, figshare), con su cita y si son accesibles;
   - figuras con datos que podrían digitalizarse, marcadas como fuente de menor confianza.
3. Para cada variable de resultado, el motor propone una tarea: regresión si es numérica, clasificación si es categórica. Las variables de condición quedan como entradas posibles.
4. El motor calcula una **ficha de aptitud** por candidato: número de registros, variables de entrada completas, valores faltantes, consistencia de unidades, cobertura del espacio de condiciones, balance de clases, registros duplicados entre fuentes y riesgo de fuga (la misma prueba reportada en dos artículos).
5. Clasifica cada candidato como **listo para entrenar**, **utilizable con limpieza**, **insuficiente** o **solo referencia externa** (datos mencionados pero no incluidos en el corpus).
6. Sugiere el tipo de modelo acorde al volumen: modelos clásicos (regresión, árboles) cuando hay pocos cientos de registros; aprendizaje profundo solo cuando el volumen lo justifica.
7. El mapa de evidencia marca las zonas sin datos: donde un modelo entrenado con este corpus estaría extrapolando.

**Alternos**

- El corpus no tiene variables de resultado: el sistema lo dice y lista solo los repositorios externos mencionados.
- Un artículo dice que los datos están "disponibles bajo petición": se lista como no accesible, con la cita y el autor de contacto si aparece.
- Un repositorio no declara licencia: se muestra con la advertencia "licencia por revisar".

**Criterios de aceptación**

- La IA solo detecta menciones de datos, con cita; la ficha de aptitud y la clasificación las calcula el motor de forma determinista.
- Cada número de la ficha es explicable: al hacer clic se ven los registros que lo producen.
- Los umbrales (por ejemplo, registros mínimos por variable de entrada) son configurables y visibles.
- El sistema nunca promete que un modelo funcionará: describe la disponibilidad y la calidad de los datos, no el desempeño esperado.

### CU-25 · Exportar un conjunto de datos para entrenamiento

**Actor:** investigador · **Prioridad:** posterior

**Objetivo:** llevarse los datos listos para usarlos en su herramienta de machine learning.

**Flujo principal**

1. Desde un candidato, el usuario elige variables de entrada, variable objetivo y filtros.
2. El sistema arma una tabla: una fila por registro, una columna por variable en unidades normalizadas, más columnas de procedencia (documento, página, tipo de fuente).
3. Propone una partición entre entrenamiento y prueba agrupada por fuente, para que registros del mismo estudio no queden en ambos lados.
4. El usuario descarga la tabla en CSV o Parquet, junto con una ficha del conjunto: origen, conversiones aplicadas, filtros, licencias y citas.

**Criterios de aceptación**

- La procedencia viaja con cada fila.
- Si una fuente tiene licencia restrictiva o desconocida, la exportación lo advierte y lo anota en la ficha.

## 11. Escenario completo: hábitat y llamas en microgravedad

Este recorrido une los casos de uso en una historia de 15 minutos y es el guion de la demo. Los niveles de la tabla del paso 4 son los esperados con los datos reales de PSI; el resto del recorrido (pasos 1, 5 y 7) describe el producto completo, no el recorte de 8 h.

**Persona.** Ana, ingeniera de sistemas de soporte vital, diseña el módulo habitable de una base lunar. Necesita justificar ante su equipo la atmósfera de cabina y los materiales del interior frente al riesgo de incendio.

**1. Arma la base (CU-05 a CU-07).** Sube 30 PDF de experimentos de combustión en microgravedad (por ejemplo, de las campañas BASS-II y FLEX) y dos tablas de resultados. Escribe la intención: "Diseñar hábitats lunares seguros frente a llamas: qué combinaciones de oxígeno, presión, flujo de aire y material están estudiadas". La IA propone 9 variables; Ana fusiona "O2" con "fracción de oxígeno", corrige una unidad de presión y aprueba.

**2. Explora (CU-10 a CU-13).** La lente generada pone oxígeno contra presión como mapa por defecto y ofrece los escenarios "base lunar", "estación orbital" y "traje". Ana ve que casi todos los estudios se agrupan cerca de 21 % de O₂ y 1 atm. Pide la síntesis de los cinco documentos más relevantes y abre la cita de un valor de presión que le parece raro.

**3. Describe su propuesta (CU-15).** Elige el escenario "lunar base" del reto: 30 % de O₂, 10.2 psi (≈ 0.69 atm) y revestimiento de PMMA.

**4. Obtiene el mapa de evidencia (CU-16).** Los niveles son los de `docs/PLAN.md` §2 y los calcula el motor sobre los datos reales de PSI (partición: combustibles sólidos).

| Parte de la propuesta | Condición | Nivel esperado | Qué lo explica |
| --- | --- | --- | --- |
| Atmósfera | 30 % O₂ | *Near, not covered* o *Not studied* (según `closeness_reach·σ`) | El O₂ máximo probado en sólidos es 22.2 % (BASS-II, PSI-25): el escenario queda 7.8 puntos por encima |
| Atmósfera | 0.69 atm (10.2 psi) | *Not studied* | 0 de 268 pruebas de sólidos registran presión |
| Revestimiento | PMMA | *Studied* | PMMA aparece en pruebas de más de una investigación de sólidos (BASS, BASS-II, SAFFIRE-II) |

Prometeo no dice si el material arde o no: dice qué condiciones están estudiadas y cuáles no. Las condiciones de 30 % de O₂ o más sí aparecen en pruebas de gases y gotas líquidas, que no son comparables con sólidos; el informe lo señala como contexto.

**5. Ajusta (CU-17 y CU-19).** Ana escribe "¿y si el flujo fuera moderado?". La ventilación pasa de refutado a respaldado. Guarda las dos variantes y las compara.

**6. Concluye y comparte (CU-20 y CU-21).** Lee el análisis verificado: "la atmósfera propuesta es extrapolable, el revestimiento está respaldado a presión normal, y la combinación con 0.5 atm no tiene estudios". Exporta el informe en PDF y lo lleva a la revisión de diseño, con la presión reducida marcada como prioridad de prueba.

**7. Evalúa los datos para un modelo (CU-24).** Su equipo quiere un modelo que prediga la propagación de la llama. La vista "Datos para ML" (ilustrativa) muestra unos cientos de registros con O₂, presión y flujo como entradas, pocos datos a baja presión y dos repositorios citados en los artículos. El veredicto: utilizable con limpieza, apto para modelos clásicos pero no para aprendizaje profundo, y sin datos para predecir a 0.5 atm.

**Valor para Ana:** en lugar de semanas de lectura, sabe en una tarde qué parte de su diseño puede defender con evidencia, cuál debe cambiar y qué experimento falta.

## 12. Otros dominios: el pitch agnóstico y sus límites

Los mismos 23 casos de uso sirven en cualquier campo cuyos documentos reporten condiciones medibles y resultados. Solo cambian el corpus, la intención, el esquema aprobado y la lente; el motor y el informe no se tocan.

| Dominio | Corpus | Intención | Propuesta a evaluar | Encaje |
| --- | --- | --- | --- | --- |
| Combustión en microgravedad | Experimentos de llamas en estaciones y caída libre | Diseñar hábitats seguros | Atmósfera, ventilación y materiales del módulo | Completo (demo) |
| Baterías | Artículos de electrolitos sólidos | Elegir una química para un prototipo | Composición, temperatura de operación, ciclos | Completo |
| Materiales de construcción | Ensayos de concreto con aditivos | Dosificar un concreto para clima frío | Proporciones, curado, temperatura | Completo |
| Agronomía | Ensayos de campo de riego y fertilización | Planear una parcela piloto | Dosis, riego, tipo de suelo | Completo |
| Farmacología preclínica | Estudios de dosis-respuesta | Elegir dosis para un nuevo ensayo | Dosis, vía, modelo animal | Completo, con revisión experta obligatoria |
| Ciencias sociales cualitativas | Entrevistas, teoría, ensayos | Revisar un marco teórico | Sin variables medibles | Parcial: solo relaciones, huecos y síntesis citada; sin mapa de evidencia |

**Qué debe cumplirse para sostener el pitch**

- **Motor sin vocabulario de dominio.** Se verifica automáticamente en la integración continua: ninguna palabra como "llama", "oxígeno" o "hábitat" en el código del motor.
- **Contratos genéricos.** Los campos con nombres del espacio (`habitats`, ilustraciones `moon_base`, `station`, `rover`, `suit`) pasan a `presets` y a un catálogo de ilustraciones genérico; el dominio aporta solo etiquetas.
- **Informe como plantilla.** Ningún texto del informe se escribe a mano para un dominio (ver CU-21).
- **Un segundo dominio probado.** No se afirma "funciona para cualquier campo" hasta tener un segundo `pack` probado de punta a punta. Mientras tanto, el pitch dice: "agnóstico al dominio para corpus con condiciones medibles, probado en combustión".

## 13. Requisitos transversales y principios de confianza

Estos requisitos aplican a todos los casos de uso. Los cinco primeros son los que hacen que un académico confíe en el resultado.

| Requisito | Regla | Casos donde pesa más |
| --- | --- | --- |
| **Trazabilidad total** | Todo valor, relación, hueco y frase visible tiene cita a documento y página. | CU-06, CU-12, CU-13, CU-20 |
| **Cálculo determinista** | Niveles, hallazgos y ranking los calcula solo el motor; mismas entradas, mismo resultado. | CU-11, CU-16, CU-17 |
| **IA con límites** | La IA solo produce JSON validado (esquema, lente, filtros) o texto que pasa el verificador. | CU-06, CU-10, CU-19, CU-20 |
| **Humano en el ciclo** | Ninguna base se publica sin aprobación; cada corrección queda en el historial. | CU-07, CU-08 |
| **Honestidad sobre lo que no se sabe** | "Sin estudiar" y "evidencia escasa" se muestran con el mismo peso visual que "respaldado". | CU-16, CU-18 |
| **Interactividad inmediata** | El motor corre en el navegador; filtrar y ajustar responde en menos de 200 ms. | CU-01, CU-10, CU-17 |
| **Privacidad** | Documentos y bases privados por defecto; la demo no guarda nada en el servidor. | CU-01, CU-02, CU-22 |
| **Agnosticismo verificable** | El motor y los contratos no contienen vocabulario de dominio; se comprueba en la integración continua. | Todos |
| **Pruebas con datos reales** | Vectores de prueba con registros reales verifican niveles y hallazgos en cada cambio. | CU-16, CU-20 |
| **Accesibilidad** | Ningún nivel se comunica solo con color: cada uno lleva texto o icono. | CU-14, CU-16 |
| **Idioma** | Interfaz en español e inglés; las citas se muestran en el idioma original del documento. | Todos |

## 14. Alcance

El MVP cubre el recorrido completo con un solo dominio: de los documentos al informe, pasando por la evaluación de una propuesta. Lo demás se agrega sin cambiar el núcleo.

| Fase | Incluye | Por qué en esta fase |
| --- | --- | --- |
| **MVP** | CU-01, 02, 05 a 08, 10 a 21, 24. Demo de combustión; ingesta como proceso por lotes; preguntas como filtros. | Demuestra la propuesta de valor completa y el principio de confianza. |
| **Posterior** | CU-03, 04, 09, 22, 25. Ingesta en vivo con cola de trabajos; segundo dominio probado. | Convierte la demo en producto de uso diario y valida el pitch agnóstico. |
| **Futuro** | CU-23 (preguntas sobre contenido con RAG); colaboración en tiempo real; conexión con bases bibliográficas. | Amplía las preguntas posibles sin tocar el motor. |

**Fuera de alcance**

- Generar conclusiones científicas nuevas o predicciones fuera de lo que permite la extrapolación del motor.
- Sustituir la revisión experta en dominios con riesgo para personas (por ejemplo, decisiones clínicas).
- Corpus sin texto extraíble (escaneos sin OCR) en el MVP.
- Acceso a artículos de pago: el usuario aporta sus propios documentos.

## 15. Preguntas abiertas

Estas decisiones cambian el alcance o el diseño y conviene cerrarlas en equipo.

- [ ] ¿Qué umbrales de cercanía separan "respaldado" de "extrapolable" y de "evidencia escasa"? ¿Fijos, por variable o ajustables por el usuario?
- [ ] ¿Cómo decide el motor si un resultado "favorece" o "va en contra" de la propuesta? ¿Lo define la intención, el revisor o la lente?
- [ ] ¿El radar se queda como vista secundaria o se sustituye del todo por la tabla de calor?
- [ ] ¿Cuál es el segundo dominio para probar el pitch agnóstico, y quién consigue su corpus?
- [ ] ¿La demo debe permitir subir un archivo pequeño sin cuenta, o el registro es obligatorio para cualquier ingesta?
- [ ] ¿Qué tamaño máximo de corpus soporta el MVP (documentos y páginas) y cuánto cuesta procesarlo?
- [ ] ¿El informe se exporta solo en PDF o también en Word y Markdown desde el MVP?

* [ ] ¿Qué umbrales separan "listo para entrenar", "utilizable con limpieza" e "insuficiente" en la ficha de aptitud?
* [ ] ¿El sistema solo lista los repositorios externos que citan los artículos, o también intenta descargar sus datos?
