# Reglas de diseño de Prometeo

Identidad: **expediente técnico aeroespacial**. Debe parecer un documento de ingeniería bien editado, no una app de startup. Toda decisión visual sale de `design/tokens.css`.

## Prohibido

- Degradados, texto con degradado, glassmorphism, desenfoques, brillos o neón.
- Sombras decorativas. Los planos se separan con líneas finas (`--trazo`) y espacio.
- Radios mayores a 4 px. Nada de tarjetas redondeadas con sombra.
- Emojis, íconos decorativos, insignias tipo "Nuevo ✨".
- Colores, fuentes o tamaños que no estén en los tokens.
- Morado, índigo o cualquier segundo color de acento. **El único acento es `--senal`** y se reserva para el escenario del usuario y los huecos de evidencia.
- Tarjetas de KPI genéricas. Una cifra solo aparece si responde una pregunta concreta.
- Animaciones de entrada en elementos que no son datos. No hacer fade-in de todo.
- Lenguaje de marketing ("potencia", "desbloquea", "revoluciona", "impulsado por IA").
- Lorem ipsum o datos inventados sin la etiqueta `ILUSTRATIVO`.

## Obligatorio

- Datos y cifras en `--f-dato` con `font-variant-numeric: tabular-nums`.
- Etiquetas en versalitas (`--t-0`, mayúsculas, espaciado 0.08em).
- Títulos en `--f-titulo`; el cuerpo en `--f-texto`.
- Gráficas como figuras científicas: ejes discretos, anotaciones directas sobre la gráfica en lugar de leyendas, zona sin datos con rayado diagonal.
- Cada dato mostrado enlaza a su fuente: investigación, archivo y fila.
- El grado de evidencia se muestra siempre: A (tabla), B (aproximado o texto), sin evidencia.
- La ausencia de datos se muestra como resultado ("Sin evidencia"), nunca se oculta ni se rellena.
- Texto en español claro, frases cortas y concretas: "129 pruebas. Ninguna con presión registrada."
- Retícula asimétrica, márgenes amplios, jerarquía por tamaño y no por color.

## Movimiento

Solo cuando comunica algo: aparición de puntos de datos, desplazamiento del escenario al cambiarlo. Duración `--dur`, curva `--curva`. Respetar `prefers-reduced-motion`.

## Revisión

Cada pantalla se revisa con captura antes de darla por terminada. Si alguien dice "se ve como hecho con IA", se busca qué regla se rompió.
