# Pitch y demo para el jurado local

**Formato:** 3 min de presentación y 2 min de preguntas. En español; la interfaz está en inglés.
**Jurado:** no sabemos quiénes nos tocarán. Perfiles en [`jurado.md`](jurado.md): la mitad son académicos; los demás son de IA y datos, de negocio y de impacto social.
**Supuesto:** se presenta el producto como terminado, con el recorrido completo de la §4. Lo que aún no esté listo se termina antes del evento o se quita de la demo (§7).

## 1. La idea central, en una frase

> Prometeo convierte decenas de artículos y tablas de datos experimentales en un solo "paper" vivo y verificable. El investigador ve qué se ha estudiado, qué no y de dónde sale cada número, en el área que sea.

Cada parte del pitch debe reforzar esa frase. Si algo no la refuerza, se quita.

## 2. Qué pensamos de las ideas del equipo

| Idea | Opinión | Ajuste |
|---|---|---|
| Dejar claro desde el inicio que es para investigadores, con una historia breve | **Sí, es lo más importante.** Seis de los doce jueces son investigadores o asesoran tesis y viven ese problema | Que la historia sea **nuestro caso real**, no uno genérico: la base lunar y "nadie lo ha probado" (§3). Funciona como gancho y como prueba a la vez |
| Diapositivas de fondo con datos | Sí, como apoyo | **Un número grande por pantalla**, no listas de bullets. Si un juez mira de reojo, en un segundo debe entender algo (§5) |
| Motor agnóstico como pilar | Sí, es lo que más nos diferencia | "Agnóstico" es jerga. Mejor decir "funciona para cualquier área" y **demostrarlo**: cambiar en vivo de combustión a ebullición. Decirlo sin mostrarlo vale poco |
| Versionado de resultados | Sí, pero es abstracto | Mostrarlo en 10 s: "llega un artículo nuevo y Prometeo marca qué cambió". Un juez entiende mejor un cambio marcado en pantalla que el concepto |
| Interfaz tipo paper | Sí | Basta una frase mientras se ve: "está en el formato que el investigador ya lee todos los días" |
| El resultado es largo, y eso está bien | De acuerdo con el argumento, **pero no lo digan en el pitch**: sería defenderse de una crítica que nadie ha hecho | Va a las preguntas (§6). Además, el informe se lee en capas: Key findings arriba y el detalle abajo |

Hay dos cosas que no están en su lista y que, para este jurado, pesan tanto como el resto:

1. **Confianza: cada número tiene procedencia.** Con un clic se ve el archivo, la fila, el valor original y el DOI. La IA no calcula nada: traduce preguntas y redacta, y un verificador revisa su texto contra los datos. Es la mejor respuesta para los jueces académicos y para los de IA (Ramírez, Flores), que van a preguntar por alucinaciones.
2. **Honestidad: Prometeo dice lo que no se sabe.** No predice si algo arde ni si es seguro. Dice "estudiado", "no estudiado" o "cerca, pero sin cubrir". La diferencia con ChatGPT es esa: un chatbot siempre contesta algo, y Prometeo señala el hueco en la evidencia. Para los jueces de negocio es la diferenciación en una frase.

## 3. Estructura (3:00)

| Tiempo | Bloque | En la pantalla principal | Objetivo |
|---|---|---|---|
| 0:00–0:25 | **Historia** | Portada | El juez entiende el problema de un investigador |
| 0:25–0:40 | **Qué es y para quién** | Portada → informe | La frase central de la §1 |
| 0:40–2:15 | **Demo** (§4) | La app en vivo | Ver el valor, no oírlo |
| 2:15–2:45 | **Por qué confiar y por qué cualquier área** | Panel de procedencia o el segundo dominio | Los diferenciadores |
| 2:45–3:00 | **Cierre** | Key findings | Una frase que se quede |

### Borrador del guion

Unas 420 palabras: el máximo para 3 min a ritmo tranquilo. Las acotaciones entre corchetes no se leen.

> **[0:00]** NASA planea una base lunar con una atmósfera de 30 % de oxígeno a 10.2 psi. Antes de diseñarla, un investigador tiene que responder algo muy simple: ¿qué sabemos de cómo arden los materiales en esas condiciones? La respuesta está repartida en 24 investigaciones, 22 tablas de datos y decenas de artículos de NASA. Revisarlas lleva semanas, y al final aparece algo incómodo: ninguna de las 268 pruebas con sólidos registró la presión. Nadie lo ha probado.
>
> **[0:25]** Somos Prometeo, una herramienta para la comunidad científica. Convierte toda esa literatura en un solo paper vivo y verificable.
>
> **[0:40]** [Demo] Este es el informe. Tiene la estructura que un investigador lee a diario: hallazgos clave, figuras, tablas y referencias. Cargo el escenario de la base lunar… [preset] y el informe se reescribe: el oxígeno está *cerca, pero no cubierto*, porque el máximo probado es 22.2 %; la presión no está estudiada; el PMMA sí. Prometeo no predice si algo arde: les dice qué está respaldado y qué no.
>
> Cualquier número se puede rastrear. [clic en un valor] Archivo, fila, valor original y DOI. Nada aparece sin fuente.
>
> También se le puede preguntar en lenguaje natural. [pregunta] "¿Y si usamos 25 % de oxígeno a media atmósfera con Nomex?" La IA solo traduce la pregunta a condiciones; los niveles los calcula el motor, y el texto que redacta pasa por un verificador contra los datos.
>
> La ciencia avanza. [versión nueva] Cuando entra un artículo nuevo, Prometeo publica una versión nueva del conocimiento y marca qué cambió.
>
> [Opcional, si sobra tiempo] Y si alguien quiere entrenar un modelo predictivo, exporta un dataset con procedencia, unidades y una ficha que dice si los datos alcanzan para ello.
>
> **[2:15]** Y lo más importante: nada de esto está escrito para la combustión. [cambiar de dominio] Este es el mismo sistema con datos de ebullición. El investigador sube sus tablas y artículos, revisa las variables que el sistema propone y obtiene su propio paper vivo, sea de materiales, de biotecnología o de lo que investigue.
>
> **[2:45]** Leer decenas de artículos para encontrar un hueco toma semanas. Con Prometeo, el investigador empieza por el hueco. Gracias.

Tienen que ensayarlo con cronómetro. Si se pasa de 3:00, primero se recorta la pregunta en lenguaje natural de la demo: se puede mencionar en las preguntas.

## 4. Recorrido de la demo

Cada paso debe funcionar en vivo y en menos de 2 s. El mismo recorrido, ensayado al menos 5 veces.

1. Portada → informe con los hallazgos clave.
2. Preset de la base lunar → niveles: O₂ *Near, not covered*, presión *Not studied*, PMMA *Studied*.
3. Clic en un valor → procedencia: `PSI-25_Experimental table_BASS-II.csv`, fila 2, DOI `10.60555/4qc4-de67`.
4. Pregunta en lenguaje natural → el escenario cambia y el análisis se actualiza.
5. Versión nueva → "qué cambió" entre versiones.
6. Cambio al dominio de ebullición → el mismo informe con otra área.

Para la demo:
- Ventana del navegador con zoom de 125–150 %, para que se lea desde lejos.
- Pestañas ya abiertas en los pasos 5 y 6.
- Un QR a la URL pública en la última diapositiva de fondo.

## 5. Diapositivas de fondo

Están en el deck **"Prometeo — diapositivas de fondo del pitch"**: https://claude.ai/artifact/6F4s1nsQ3ssXR7dcCa57Pm (privado hasta que se comparta; se descarga en PowerPoint o PDF).
Cada una tiene un número grande o una frase y una línea de contexto. Las notas del orador dicen en qué momento del guion va cada una. Pasan solas o las avanza una segunda persona.

| # | Diapositiva | Momento del guion |
|---|---|---|
| 1 | Portada: **Prometeo**, para investigadores | Mientras el equipo se prepara |
| 2 | El reto en una línea (el fuego se comporta distinto en el espacio) y **24 investigaciones · 22 tablas · 1,986 experimentos y campañas** | 0:00 |
| 3 | **0 de 268** experimentos con sólidos registran la presión; la base lunar opera a 10.2 psi, cerca del 70 % de la presión a nivel del mar (la diapositiva de acento) | 0:15 |
| 4 | **22.2 %**: el O₂ máximo probado; la base lunar usa 30 % y el aire de la Tierra 21 %, con una figura del rango | 0:50 |
| 5 | **1 clic** de cualquier número a su fuente | 1:05 |
| 6 | **La IA no calcula**: traduce, calcula el motor, revisa un verificador | 1:20 |
| 7 | **Versiones**: el conocimiento cambia con cada artículo | 1:50 |
| 8 | **Cualquier área**: combustión → ebullición → tu área | 2:15 |
| 9 | **Datos para modelos predictivos**: CSV y ficha de datos | 2:35, o en preguntas |
| 10 | Cierre con la frase final, la URL y el QR | 2:45 y durante las preguntas |

Diseño: el estilo del informe (papel `#FDFCF9`, tinta `#1D1C1A`, un solo acento `#A3271B`, EB Garamond y Fira Sans). Sin fondos espaciales ni cursivas: la identidad es la de un paper.
Cada diapositiva tiene que entenderse sin contexto del reto: un juez que la vea de reojo no sabe qué es BASS-II ni por qué importa la presión.

## 6. Preguntas probables (2 min)

Respuestas de 20 segundos o menos: primero la respuesta directa y después un dato.
Asignen quién responde cada bloque, para no pisarse. Si no saben algo, lo dicen: este jurado premia más la honestidad que una respuesta inventada.

### 6.1 Valor y diferenciación

| Pregunta | Quién la haría | Respuesta corta |
|---|---|---|
| ¿Por qué no usar ChatGPT? | Negocio, IA | Un chatbot siempre contesta, aunque no haya evidencia. Prometeo calcula de forma determinista, cita fila y DOI, y dice "no estudiado" cuando no hay datos. |
| Ya existen Elicit, Consensus o Semantic Scholar | Ramírez, académicos | Esos resumen el texto de los artículos. Prometeo trabaja con los **datos experimentales** de las tablas: calcula qué condiciones están cubiertas, cuáles no y con qué fuentes, fila por fila. |
| ¿Esto sustituye leer los artículos? | Eréndira, Rivas | No. Es el punto de partida: dice qué leer primero y dónde está el hueco. Cada valor lleva a su artículo para profundizar. |
| Es mucho texto | Cualquiera | Sustituye decenas de artículos. Se lee en capas: tres hallazgos clave arriba y el detalle solo si se necesita. Es un punto de partida para investigar, no un resumen para leer de pasada. |
| ¿Por qué el formato de paper? | César Ramírez, Eréndira | Es el formato que el investigador ya domina: no tiene que aprender una interfaz nueva. Se exporta a PDF para citarlo o compartirlo. |
| ¿Qué significa "cerca, pero no cubierto"? | Académicos | Que hay pruebas en condiciones parecidas, pero no en las del escenario. En la base lunar: se probó hasta 22.2 % de oxígeno y la base usa 30 %. El sistema no extrapola: lo marca. |

### 6.2 IA y confianza

| Pregunta | Quién la haría | Respuesta corta |
|---|---|---|
| ¿Cómo evitan alucinaciones? | Ramírez, Flores, Jonam | La IA no produce números. Su salida se valida contra un esquema, y cada frase del análisis pasa un verificador que la compara con los datos. Si falla, se muestra un texto por plantilla, marcado como tal. |
| ¿Qué modelo usan? | IA | Claude Haiku 4.5 en Amazon Bedrock. Un modelo pequeño basta porque solo traduce y redacta; el cálculo es del motor. |
| ¿Qué pasa si la IA se cae? | Flores, Mona | El informe sigue funcionando: el motor no depende de la IA. El análisis pasa a texto por plantilla, marcado como tal. |
| ¿Cómo validan que la extracción es correcta? | Flores, Eréndira | Ninguna variable se publica sin aprobación. El mapeo automático coincide en 86 % con el revisado, y el resto es justo lo que revisa una persona. Además, 147 registros llevan bandera de calidad y se ven como tales. |
| ¿Qué pasa si dos artículos se contradicen? | Académicos | No se promedian ni se elige uno en silencio. El conflicto se muestra con las dos fuentes, y una corrección conserva la cita original. |
| ¿Y las unidades? | Reyes, Parga | Todo se convierte a una unidad canónica, pero el valor original se conserva y se muestra en la procedencia. Por ejemplo, 10.2 psi = 0.694 atm. |

### 6.3 Cualquier área y datos para modelos

| Pregunta | Quién la haría | Respuesta corta |
|---|---|---|
| ¿Funcionaría con mis datos de [plantas / materiales / sensores]? | Rivas, Parga, Reyes, Jonam | Sí, si son datos experimentales en tablas o artículos. El motor no tiene vocabulario de ningún dominio: subes documentos, revisas las variables propuestas y publicas. Lo probamos con un segundo dominio, ebullición. |
| ¿Cómo prueban que de verdad es agnóstico? | Ramírez, Flores | Una prueba automática revisa que el motor no contenga términos del dominio, y el mismo motor sin cambios corre con datos de ebullición. |
| ¿Sirve para entrenar modelos predictivos? | Ramírez, Flores, Jonam | Sí: exporta un CSV con unidades y DOI en cada fila y un grupo por estudio, para separar entrenamiento y prueba sin fuga de datos. La ficha de datos dice si alcanzan para entrenar y por qué. |
| ¿Y si no alcanzan los datos para un modelo? | IA | La ficha lo dice con el criterio que no se cumple, por ejemplo, pocos estudios o unidades sin convertir. Eso también es un hallazgo: dice qué experimentos faltan. |
| ¿Qué pasa con PDF escaneados? | Flores, Mona | Hoy se necesita que el PDF tenga texto; los escaneados requieren OCR, que es un paso siguiente. Las tablas en CSV o Excel funcionan directo. |

### 6.4 Técnica y escala

| Pregunta | Quién la haría | Respuesta corta |
|---|---|---|
| ¿Cómo está construido? | Mona, Jonam | Web estática en CloudFront; el motor corre en el navegador. En AWS hay Lambda, API Gateway, DynamoDB, S3, SQS y Cognito. Toda la infraestructura se crea con scripts reproducibles. |
| ¿Escala? | Flores, negocio | El informe corre en el navegador del usuario, así que no carga al servidor. La ingesta de documentos va por una cola que procesa por lotes y aparta los documentos que fallan sin detener el resto. |
| ¿Qué tan rápido responde? | César Ramírez | Mover un parámetro actualiza todo el informe en decenas de milisegundos. Solo la pregunta en lenguaje natural tarda unos segundos, por la IA. |
| ¿Y la privacidad de mis datos sin publicar? | Académicos, Vanessa | Cada investigador tiene su cuenta, y sus proyectos son privados hasta que los publica. Lo probamos con dos usuarios: uno no puede ver los proyectos del otro. |

### 6.5 Negocio e impacto

| Pregunta | Quién la haría | Respuesta corta |
|---|---|---|
| ¿Quién lo usaría? | Negocio | Grupos de investigación, laboratorios y estudiantes de posgrado al empezar una tesis o una propuesta de proyecto. |
| ¿Modelo de negocio? | Jorge González, Roberto Cárdenas | **[Decidir como equipo.]** Propuesta: abierto para la academia, e instancias institucionales para laboratorios o agencias que necesitan trabajar con datos privados. |
| ¿Qué sigue? | Negocio | Un piloto con un grupo de investigación local, OCR para PDF escaneados y más dominios de NASA PSI. |
| ¿Qué tanto hicieron en el hackathon? | Cualquiera | **[Confirmar como equipo.]** Todo: datos, motor, informe, IA e infraestructura. |
| ¿Y el impacto social? | Vanessa Fernández | Abre datos públicos de NASA a quien no tiene semanas para revisarlos, como estudiantes o grupos pequeños. Además, mostrar lo que no se ha estudiado orienta la investigación hacia los huecos. |
| ¿Por qué un investigador de Saltillo usaría esto? | Jueces locales | Porque el problema es igual en cualquier universidad: revisar la literatura antes de una tesis o un proyecto. Con la carga de documentos sirve también para sus propios datos. |

## 7. Riesgos y reglas para el día

- **Solo se muestra en vivo lo que funciona en vivo.** Si un juez pide probarlo, la URL y el QR deben llevar a la misma versión que se presentó.
- **Nunca se presenta una respuesta grabada como IA en vivo** (`AGENTS.md` §5). Si la red falla, se dice "esto es la versión por plantilla".
- **Video de respaldo** del recorrido completo, por si falla el proyector o la red. Se presenta como video.
- **No se exagera la validación:** las aprobaciones delegadas no son revisión experta (`docs/PLAN_FASE2.md` §9.4). La frase correcta es "ninguna variable se publica sin aprobación".
- **Lo que debe estar listo para el recorrido de la §4:**

  | Paso | Depende de | Estado al 15-nov |
  |---|---|---|
  | 1–4 | Web publicada | En línea con la interfaz nueva (publicada el 15-nov a las 9:04). Falta corregir lo del §9.2 del plan: la llama, los textos escritos a mano y el estilo |
  | 5, versiones | T37 y la pantalla de "qué cambió" (T24) | Lógica lista; falta la publicación de versiones |
  | 6, segundo dominio | T37 con el lote de ebullición | En curso |
