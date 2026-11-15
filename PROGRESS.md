# Prometeo — Progreso

> Fuente única del estado del proyecto. Cada agente lo lee al empezar y lo actualiza al terminar cada tarea (ver `AGENTS.md`).
> Las tareas están descritas en [`docs/PLAN.md`](docs/PLAN.md).

## Estado actual

| Campo | Valor |
|---|---|
| Hora 0 (inicio del reloj) | _pendiente_ |
| Tarea en curso | — |
| Último commit verificado | — |
| Siguiente paso exacto | Empezar T00 (ver `docs/PLAN.md` §4). |
| URL pública (CloudFront) | _sin desplegar_ |
| API (`API_URL`) | _sin desplegar_ |
| `MODEL_ID` confirmado | _pendiente (infra/00_check.sh)_ |

## Bloqueos

_Ninguno._ (Formato: `- [hora] descripción — quién puede resolverlo`.)

## Prerrequisitos humanos

- [ ] Acceso AWS por persona y perfil `prometeo` en cada laptop
- [ ] Invocación real de Claude en Bedrock (`us-east-1`)
- [ ] Acceso de push al repo para todo el equipo
- [ ] `construir_corpus.py` / `corpus.json` del compañero en `pipeline/legacy/` (opcional)

## Tareas

Estados: `pendiente` · `en curso` · `hecha` · `bloqueada` · `omitida (corte)`

| ID | Tarea | Prioridad | Estado | Agente / persona | Commit | Nota |
|---|---|---|---|---|---|---|
| T00 | Repo y docs | P0 | pendiente | | | |
| T01 | Datos en el repo | P0 | pendiente | | | |
| T02 | Scaffold + `00_check.sh` | P0 | pendiente | | | |
| T03 | Pack de demo | P0 | pendiente | | | |
| T04 | Motor + vectores | P0 | pendiente | | | |
| T05 | Esqueleto del informe | P0 | pendiente | | | |
| T06 | Escenario y figuras | P0 | pendiente | | | |
| T07 | Procedencia, PDF y URL | P0 | pendiente | | | |
| T08 | Infra web (CloudFront) | P0 | pendiente | | | |
| T09 | Lambda `/ask` y `/analysis` | P1 | pendiente | | | |
| T10 | Infra API | P1 | pendiente | | | |
| T11 | UI de preguntas y análisis | P1 | pendiente | | | |
| T12 | Ficha de datos para ML | P2 | pendiente | | | |
| T13 | Comparar 2 estudios | P2 | pendiente | | | |
| T14 | Prueba agnóstica | P3 | pendiente | | | |
| T15 | Aceptación y entrega | P0 | pendiente | | | |

## Aceptación final (T15)

- [ ] 1. URL abre sin cuenta ni escrituras al servidor
- [ ] 2. Preset lunar base: O₂ near/not studied (BASS-II), presión not studied, PMMA studied
- [ ] 3. Sliders recalculan sin retraso visible
- [ ] 4. Clic en valor → archivo, fila y DOI
- [ ] 5. Export PDF completo
- [ ] 6. `/ask` cambia escenario; pregunta de contenido → mensaje de límite
- [ ] 7. `/analysis` solo con fuentes; plantilla si la API cae
- [ ] 8. `npm test`, `pytest api/`, `check_agnostic.sh` en verde
- [ ] 9. Deploy desde otra laptop sin duplicar recursos

## Bitácora de relevos

Una entrada por sesión de agente, la más reciente arriba.

<!--
### [HH:MM] Persona · cuenta/laptop
- Hecho: T0x (commit abc1234), …
- Verificado con: …
- Quedó a medias: … (commit WIP def5678)
- Siguiente paso exacto: …
- Ojo con: …
-->
