# Prototipo de interfaz · Prometeo

Prototipo navegable de las cuatro pantallas del recorrido del investigador. Sirve para acordar la identidad visual antes de construir, y después como referencia fija para el agente de código.

**Abrir:** doble clic en `index.html`. No necesita servidor ni compilación. Las fuentes se cargan de Google Fonts; sin internet se usan las de respaldo.

## Pantallas

| # | Pantalla | Qué responde |
|---|---|---|
| 01 | Escenario | ¿Para qué hábitat diseñas? (ISS, base lunar, atmósfera de exploración) |
| 02 | Expediente | Cuatro cifras: qué se leyó, qué está cerca, qué falta |
| 03 | Mapa de evidencia | Cada prueba real en el plano oxígeno × presión, con la zona del escenario rayada y los sólidos sin presión en una franja aparte |
| 04 | Evidencia | Pruebas más cercanas con fuente (archivo y fila) y grado, más los huecos detectados |

Parámetros de URL útiles para capturas o para presentar:
- `?pantalla=mapa` muestra solo una sección (`portada`, `resumen`, `mapa`, `evidencia`).
- `?esc=A|B|C` elige el hábitat.
- `?estatico` desactiva animaciones.

## Datos

`datos.js` es **real**: 501 pruebas de las tablas experimentales de PSI (licencia CC0), generadas con:

```
python3 -I herramientas/generar_datos.py <carpeta psi_tablas> datos.js
```

| Investigación | PSI | Pruebas | Presión en la tabla |
|---|---|---|---|
| FLEX | PSI-69 | 274 | Sí (mmHg) |
| CFI | PSI-39 | 87 | Sí (atm) |
| BASS-II | PSI-25 | 129 | No |
| SAFFIRE-I / II | PSI-98 / 99 | 11 | No |

Hallazgos que el prototipo ya muestra con estos datos:
- Cerca de la base lunar (30 % O₂, ~70 kPa) hay 17 pruebas, todas de gotas de FLEX.
- **Ninguna de las 140 pruebas de sólidos registra la presión** en su tabla, y ninguna supera 22.2 % O₂.
- Todas las pruebas son en microgravedad; no hay ninguna a 0.17 g.
- 57 muestras de BASS-II describen la forma («1/4" black rod») sin decir el material.
- Una prueba de FLEX (C11M201) tiene presión registrada como 0 mmHg: se marca como dato inválido.

Lo que **no** es definitivo:
- Las condiciones de la base lunar y de la atmósfera de exploración están marcadas «por verificar».
- La normalización de materiales y combustibles es manual y provisional; en el sistema real la hace la etapa E4 del motor.
- Las relaciones extraídas de artículos (etapa E2) aún no existen; la pantalla 04 lo indica con un recuadro «Pendiente».

## Diseño

Identidad, tokens y prohibiciones: `../design/tokens.css` y `../design/REGLAS.md`. El prototipo no usa ningún valor fuera de los tokens.

Las capturas de referencia están en `capturas/`.
