// Spanish entries for the purpose-driven GenUI dashboard, its case inputs and the chat panel.
export const GENUI: Record<string, string> = {
  "Computed locally from the records · not AI":
    "Calculado localmente a partir de los registros · no es IA",
  "Local search · not AI": "Búsqueda local · no es IA",
  "AI answer · each sentence quotes your documents":
    "Respuesta de IA · cada frase cita sus documentos",
  "Proposed change · not applied": "Cambio propuesto · no aplicado",
  "Comparison, not prediction": "Comparación, no predicción",
  "Notice · not AI": "Aviso · no es IA",
  "p. {0}": "p. {0}",
  "row {0}": "fila {0}",
  "Applied": "Aplicado",
  "Apply": "Aplicar",
  "The question could not be answered. Try again.":
    "No se pudo responder la pregunta. Inténtelo de nuevo.",
  "Chat about the documents": "Conversar sobre los documentos",
  "Ask the documents": "Preguntar a los documentos",
  "Questions compare conditions with the evidence; they do not predict outcomes.":
    "Las preguntas comparan condiciones con la evidencia; no predicen resultados.",
  "Conversation": "Conversación",
  "No questions yet. Ask about the documents or pick a suggestion.":
    "Aún no hay preguntas. Pregunte sobre los documentos o elija una sugerencia.",
  "You": "Usted",
  "Searching the documents…": "Buscando en los documentos…",
  "Your question": "Su pregunta",
  "Working…": "Procesando…",
  "Send": "Enviar",
  "Clear conversation": "Borrar conversación",
  "over {0} records with a value": "por encima de {0} registros con un valor",
  "between {0} and {1}": "entre {0} y {1}",
  "{0} {1}": "{0} {1}",
  "{0} studies record {1} {2}{3}": "{0} estudios registran {1} {2}{3}",
  "Select variables above to describe your case.":
    "Seleccione variables arriba para describir su caso.",
  "Evidence range": "Rango de evidencia",
  "— no value —": "— sin valor —",
  "Clear value": "Borrar valor",
  "Template summaries built from the extracted values · not AI":
    "Resúmenes por plantilla construidos a partir de los valores extraídos · no es IA",
  "No documents uploaded.": "No se han subido documentos.",
  "Paper": "Artículo",
  "page": "página",
  "row": "fila",
  "column": "columna",
  "{0} · {1}": "{0} · {1}",
  "Variables found:": "Variables encontradas:",
  "No document matches the purpose yet.":
    "Ningún documento coincide todavía con el propósito.",
  "score {0}": "puntuación {0}",
  "Shared variables: {0}": "Variables compartidas: {0}",
  "Layout chosen by AI · values computed locally":
    "Diseño elegido por IA · valores calculados localmente",
  "Rule-based layout": "Diseño basado en reglas",
  "Fewer than two records give values for both variables.":
    "Menos de dos registros dan valores para ambas variables.",
  "n = {0} records with both values": "n = {0} registros con ambos valores",
  "Scatter of {0} records that give values for both variables.":
    "Diagrama de dispersión de {0} registros que dan valores para ambas variables.",
  "No variables were detected in the documents.":
    "No se detectaron variables en los documentos.",
  "{0} / {1} selected": "{0} / {1} seleccionadas",
  "Up to {0} variables. Remove one to add another.":
    "Hasta {0} variables. Quite una para añadir otra.",
  "Score": "Puntuación",
  "Show fewer": "Mostrar menos",
  "Show all {0} variables": "Mostrar las {0} variables",
  "Evidence dashboard": "Panel de evidencia",
  "Edit purpose": "Editar propósito",
  "Home": "Inicio",
  "{0} documents · {1} variables detected · layout: {2}":
    "{0} documentos · {1} variables detectadas · diseño: {2}",
  "AI-chosen": "Elegido por IA",
  "Rule-based": "Basado en reglas",
  "Answers to your purpose": "Respuestas a su propósito",
  "No module could be built from the corpus for this purpose.":
    "No se pudo construir ningún módulo del corpus para este propósito.",
  "Your case": "Su caso",
  "Case analysis": "Análisis del caso",
  "Give at least one selected variable a value to compute evidence levels, the ranking and the gap figures.":
    "Asigne un valor al menos a una variable seleccionada para calcular los niveles de evidencia, la clasificación y las figuras de vacíos.",
  "Select at least two numeric variables to draw the map and the gap figure.":
    "Seleccione al menos dos variables numéricas para dibujar el mapa y la figura de vacíos.",
  "Variable relevance.": "Relevancia de las variables.",
  "Each variable is scored as a weighted sum, rounded to three decimals: ":
    "Cada variable se puntúa como una suma ponderada, redondeada a tres decimales: ",
  "Every component is in [0, 1] and computed locally from the uploaded documents; a variable without a citation is not scored.":
    "Cada componente está en [0, 1] y se calcula localmente a partir de los documentos subidos; una variable sin cita no se puntúa.",
  "How the modules are chosen.": "Cómo se eligen los módulos.",
  "The layout is picked by rules that match the purpose against intents (rule-based), or proposed by an AI layout that is validated against a schema before use. In both cases every value is computed locally; the AI never supplies numbers.":
    "El diseño se elige mediante reglas que contrastan el propósito con una serie de intenciones (basado en reglas), o lo propone un diseño de IA que se valida contra un esquema antes de usarse. En ambos casos todos los valores se calculan localmente; la IA nunca aporta números.",
  "Studied: records exist at the value of the case. Near, not covered: records exist close to the value but not at it. Scarce evidence: few documents or only flagged records. Not studied: no comparable record. All four carry the same weight; none is a prediction.":
    "Estudiado: existen registros en el valor del caso. Cercano, no cubierto: existen registros próximos al valor, pero no en él. Evidencia escasa: pocos documentos o únicamente registros marcados. No estudiado: no hay ningún registro comparable. Los cuatro niveles tienen el mismo peso; ninguno es una predicción.",
  "Provenance.": "Procedencia.",
  "Every value opens its source record (file, row or page, and DOI when available). Prometeo compares conditions against the evidence; it does not predict outcomes.":
    "Cada valor abre su registro de origen (archivo, fila o página y DOI cuando está disponible). Prometeo compara condiciones con la evidencia; no predice resultados.",
  "Ask the corpus": "Preguntar al corpus",
  "What do you want to find out?": "¿Qué desea averiguar?",
  "Prometeo builds a dashboard that answers your question from the documents you uploaded. The variables most relevant to your purpose are ranked from the evidence in those documents; nothing is predicted.":
    "Prometeo construye un panel que responde a su pregunta a partir de los documentos que subió. Las variables más relevantes para su propósito se clasifican según la evidencia de esos documentos; no se predice nada.",
  "What do you want to find out from these documents?":
    "¿Qué desea averiguar en estos documentos?",
  "e.g. Which conditions were studied, and where is the evidence thin?":
    "p. ej., ¿qué condiciones se estudiaron y dónde es escasa la evidencia?",
  "Suggested purposes": "Propósitos sugeridos",
  "Most relevant variables for this purpose":
    "Variables más relevantes para este propósito",
  "No variable with a source citation was found in the uploaded documents.":
    "No se encontró ninguna variable con cita de origen en los documentos subidos.",
  "Generate dashboard": "Generar panel",
  "No passage of the documents matches the question.":
    "Ningún pasaje de los documentos coincide con la pregunta.",
  "Closest passages in your documents (local search · not AI)":
    "Pasajes más cercanos en sus documentos (búsqueda local · no es IA)",
  "Prometeo compares conditions with the evidence; it does not predict outcomes. Here is what the documents cover:":
    "Prometeo compara condiciones con la evidencia; no predice resultados. Esto es lo que cubren los documentos:",
  "Proposed change to the case. It is not applied until you confirm it.":
    "Cambio propuesto al caso. No se aplica hasta que usted lo confirme.",
  "No documents to compare.": "No hay documentos que comparar.",
  "Document": "Documento",
  "Found": "Encontrado",
  "Found: {0} of {1}": "Encontrado: {0} de {1}",
  "{0} of {1}": "{0} de {1}",
  "found in the document": "encontrado en el documento",
  "not found": "no encontrado",
  "No numeric values are recorded for this variable.":
    "No se registran valores numéricos para esta variable.",
  "n = {0}": "n = {0}",
  "record": "registro",
  "Records in the selected bin": "Registros en el intervalo seleccionado",
  "Histogram of {0}": "Histograma de {0}",
  "Distribution of {0} records over {1} bins.":
    "Distribución de {0} registros en {1} intervalos.",
};
