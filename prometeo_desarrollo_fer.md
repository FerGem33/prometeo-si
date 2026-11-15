## 1. ¿Cómo manejaba las preguntas a la IA? ¿Es realizable?

**No es un RAG.** En su guía, `POST /ask` convierte la pregunta en **filtros o un escenario** en JSON validado, y después el motor recalcula todo de forma determinista:

```
"¿Y si la base usara 25 % de O₂ a 0.5 atm con Nomex?"
      → LLM → {"values": {"o2": 25, "p": 0.5, "material": "Nomex"}}
      → se valida contra el esquema (variables existentes, rangos)
      → el motor recalcula nivel de evidencia, hallazgos, ranking y gráficas
```

Aparte, `POST /analysis` redacta el veredicto a partir de los hallazgos ya calculados, y un verificador elimina cualquier frase sin respaldo. También existe una barra de preguntas sugeridas (`lens.goal_suggestions`).

**Sí es realizable, y es barato:** una llamada a la IA por pregunta, un prompt, validación con el esquema y una barra en la interfaz. Calculo 2 a 3 horas.

**Su límite:** solo responde preguntas que se puedan expresar como condiciones o filtros:
- Sí: "qué pasa a 25 % de O₂", "solo estudios de supresión", "cuáles midieron flujo".
- No: "qué mecanismo explica la extinción en FLEX". Esa pregunta sobre el contenido de los artículos sí necesitaría RAG.

Por eso no es lo que querías dejar fuera. Mi recomendación es incluirlo como función ligera después del núcleo.

## 2. ¿Por qué quitar el radar?

Es mi opinión, no una regla. Estas son las razones:
- **El orden de los ejes cambia la forma,** y el área exagera las diferencias. Dos estudios con los mismos valores pueden verse distintos.
- **Su radar no muestra datos sino una puntuación derivada** (0–100, calculada con `sigma` y `closeness_reach`). El académico ve un polígono, no "22.2 % frente a 30 %".
- Con 3 o 4 variables apenas forma una figura, y en artículos científicos casi no se usa.

**Alternativa que conserva la información:** una tabla de calor estudio × variable, con la cercanía en cada celda, ordenable y con el valor real al pasar el cursor. Se lee de un vistazo y se puede comparar entre estudios. Si a tu amigo le gusta el radar, se puede dejar como vista secundaria.

## 3. Arquitectura: la suya contra la nuestra

| Aspecto                 | Su guía                                                    | La nuestra                                                                           | Mejor                                                    |
| ----------------------- | ---------------------------------------------------------- | ------------------------------------------------------------------------------------ | -------------------------------------------------------- |
| Dónde corre el motor    | Navegador (TypeScript, funciones puras)                    | Servidor (Python + SQLite)                                                           | **Suya**: interactividad instantánea y demo sin servidor |
| Frontera entre capas    | Un `pack` JSON validado                                    | Base SQLite y endpoints `/api/*`                                                     | **Suya**: más simple de desplegar y probar               |
| Unidad de dato          | Registro = una prueba, con todas sus variables como rangos | Un registro por valor (EAV), cada uno con su cita                                    | **Mixto**, ver abajo                                     |
| Inducción del esquema   | IA sobre perfiles de tablas y resúmenes de PDF             | IA sobre muestras de texto                                                           | **Suya**: más barata y robusta                           |
| Aprobación humana       | Pantalla de revisión obligatoria                           | Revisión manual de un JSON                                                           | **Suya**                                                 |
| GenUI                   | `lens`: configuración generada una vez por dominio         | UI-spec generado por cada pregunta                                                   | **Suya**: más segura y barata                            |
| Interpretación          | Hallazgos por reglas + texto de IA verificado              | Respuestas con IA "con correa"                                                       | **Suya**                                                 |
| Contenido de los papers | Solo extrae condiciones de prueba con cita                 | También relaciones ("más flujo → más propagación") y huecos que declaran los autores | **Nuestra**                                              |
| Ingesta                 | En vivo: subida, cola de trabajos, Postgres, Supabase      | Script fuera de línea                                                                | Suya como producto; la nuestra para 20 h                 |
| Pruebas                 | Vectores con datos reales                                  | Métricas, sin vectores                                                               | **Suya**                                                 |

**Dos aportes nuestros que faltan en su guía:**

1. **Procedencia por valor.** En su contrato, un registro tiene una sola `confidence` (`table` o `paper`). Cuando extraigamos de un reporte la presión de BASS-II, ese dato debe unirse a una prueba que viene de tabla. Con su contrato no se puede, salvo creando un registro duplicado.
   **Ajuste:** agregar procedencia opcional por variable, por ejemplo `provenance: {"p": {"confidence": "paper", "quote": "…", "page": 4}}`. Es justo el caso que puede cambiar el hallazgo principal.
2. **Relaciones y huecos declarados por los autores,** con cita. Su "grafo" solo une estudios por hardware y variables, no por afirmaciones. Para académicos, lo que dicen los artículos es tan importante como las tablas.

**Veredicto:** su arquitectura como base, más esos dos ajustes nuestros.

## 4. ¿Es agnóstico?

**El motor sí, por diseño:** funciones puras sobre el `pack`, sin palabras del dominio y verificado con grep en la integración continua. Todo lo específico entra por tres puertas: el adaptador (`build_pack.py` de PSI), el mapeo aprobado y la lente.

Tiene tres matices:
1. **Hay restos del dominio en los contratos.** `habitats` y el catálogo de ilustraciones `moon_base`, `station`, `rover`, `suit` son del espacio. Deberían llamarse `presets` con un catálogo de ilustraciones genérico, y que el dominio aporte solo etiquetas.
2. **Es agnóstico al dominio, pero no a la forma de los datos.** Supone registros experimentales con condiciones numéricas y rangos. Sirve para materiales, química o ensayos con variables controladas, pero no para corpus cualitativos (entrevistas, teoría). Hay que decirlo así en el pitch.
3. **Su propia regla 12.1.9** prohíbe decir "funciona para cualquier campo" mientras no exista un segundo paquete probado. Estoy de acuerdo.

**El frontend:**
- **Su registro de componentes sí es agnóstico** (EvidenceMeter, GapMap, Findings reciben ejes y variables por configuración). Lo temático es la estética espacial y las tarjetas de hábitat.
- **Mi informe hoy no es agnóstico.** Tiene escritos a mano los textos de fuego, PSI, O₂ y presión. Para que lo sea, el informe tiene que ser una **plantilla que se llena desde el `pack`**:

| Sección del informe       | Se llena desde                                                                 |
| ------------------------- | ------------------------------------------------------------------------------ |
| Título y escenarios       | `lens` (generado por IA, validado)                                             |
| Hallazgos clave y resumen | `findings()` del motor + texto por plantilla o IA verificada                   |
| Figura 1 (mapa)           | `lens.default_axes`: cualquier par de variables numéricas                      |
| Figura de cobertura       | `mapping` aprobado                                                             |
| Tabla de fuentes          | `studies`                                                                      |
| Métodos                   | Generados del `mapping`: conversiones aplicadas, columnas rechazadas, banderas |

La identidad visual (tipografía, paleta, formato de artículo) puede quedarse fija. Lo agnóstico es la **estructura del contenido**, no la estética. Un informe de química con este mismo diseño seguiría siendo un artículo, solo con otras variables.

Con esto la versión final quedaría así: arquitectura y motor de su guía, procedencia por valor y relaciones de los papers nuestras, preguntas como filtros (su `/ask`) como función ligera, y el informe tipo artículo como plantilla agnóstica. Si te parece, escribo el documento final con esos puntos.