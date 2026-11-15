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

Cada una tiene un número grande y una línea de contexto. Pasan solas o las avanza una segunda persona, siguiendo el orden del guion.

1. **24 investigaciones · 22 tablas · 1,986 registros**: lo que Prometeo sintetiza hoy.
2. **0 de 268**: pruebas con sólidos que registran presión.
3. **22.2 %**: el O₂ máximo probado en sólidos. La base lunar usa 30 %.
4. **1 clic**: de cualquier número a su fuente (archivo, fila, DOI).
5. **La IA no calcula**: traduce y redacta; el motor calcula y un verificador revisa.
6. **Cualquier área**: combustión → ebullición, con el mismo sistema.
7. **Versiones**: el conocimiento cambia con cada artículo nuevo, y queda registrado qué cambió.
8. Nombre del equipo, URL y QR.

Diseño: el estilo del informe (papel `#FDFCF9`, tinta `#1D1C1A` y un solo acento `#A3271B`). Sin fondos espaciales: la identidad es la de un paper.

## 6. Preguntas probables (2 min)

Respuestas de 20 segundos o menos. Primero la respuesta directa y después un dato.

| Pregunta | Quién la haría | Respuesta corta |
|---|---|---|
| ¿Por qué no usar ChatGPT? | Negocio, IA | Un chatbot siempre contesta, aunque no haya evidencia. Prometeo calcula de forma determinista, cita fila y DOI, y dice "no estudiado" cuando no hay datos. |
| ¿Cómo evitan alucinaciones? | Ramírez, Flores, Jonam | La IA no produce números. Su salida se valida contra un esquema, y cada frase del análisis pasa un verificador que la compara con los datos. Si falla, se muestra un texto por plantilla, marcado como tal. |
| ¿Funcionaría con mis datos de [plantas / materiales / sensores]? | Rivas, Parga, Reyes, Jonam | Sí, si son datos experimentales en tablas o artículos. El motor no tiene vocabulario de ningún dominio: subes documentos, revisas las variables propuestas y publicas. Lo probamos con un segundo dominio. |
| Es mucho texto | Cualquiera | Sustituye decenas de artículos. Se lee en capas: tres hallazgos clave arriba, y el detalle solo si se necesita. Es un punto de partida para investigar, no un resumen para leer de pasada. |
| ¿Cómo validan que la extracción es correcta? | Flores, Eréndira | Ninguna variable se publica sin aprobación. Al comparar el mapeo automático con el revisado coincide en 86 %, y el 14 % restante es justo lo que revisa una persona. |
| ¿Quién lo usaría / qué sigue? | Negocio | Grupos de investigación, laboratorios y estudiantes de posgrado al empezar una tesis o una propuesta. El siguiente paso es un piloto con un grupo de investigación local. |
| ¿Por qué el formato de paper? | César Ramírez, Eréndira | Es el formato que el investigador ya domina: no tiene que aprender una interfaz nueva. Se exporta a PDF para citarlo o compartirlo. |
| ¿Y el impacto social? | Vanessa Fernández | Abre datos públicos de NASA a quien no tiene semanas para revisarlos, como estudiantes o grupos pequeños. Además, mostrar lo que no se ha estudiado orienta la investigación hacia los huecos. |

Asignen quién responde cada tipo de pregunta, para no pisarse.

## 7. Riesgos y reglas para el día

- **Solo se muestra en vivo lo que funciona en vivo.** Si un juez pide probarlo, la URL y el QR deben llevar a la misma versión que se presentó.
- **Nunca se presenta una respuesta grabada como IA en vivo** (`AGENTS.md` §5). Si la red falla, se dice "esto es la versión por plantilla".
- **Video de respaldo** del recorrido completo, por si falla el proyector o la red. Se presenta como video.
- **No se exagera la validación:** las aprobaciones delegadas no son revisión experta (`docs/PLAN_FASE2.md` §9.4). La frase correcta es "ninguna variable se publica sin aprobación".
- **Lo que debe estar listo para el recorrido de la §4:**

  | Paso | Depende de | Estado al 15-nov |
  |---|---|---|
  | 1–4 | Web publicada | En línea (versión anterior). La nueva interfaz espera la revisión del §9.2 del plan |
  | 5, versiones | T37 y la pantalla de "qué cambió" (T24) | Lógica lista; falta la publicación de versiones |
  | 6, segundo dominio | T37 con el lote de ebullición | En curso |
