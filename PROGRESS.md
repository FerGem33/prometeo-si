# Prometeo — Progreso

> Fuente única del estado del proyecto. Cada agente lo lee al empezar y lo actualiza al terminar cada tarea (ver `AGENTS.md`).
> Las tareas están descritas en [`docs/PLAN.md`](docs/PLAN.md).

## Estado actual

| Campo | Valor |
|---|---|
| Hora 0 (inicio del reloj) | 2026-11-14 18:16 CST |
| Tarea en curso | T08 (Codex · laptop stringbuilder) |
| Último commit verificado | T07 |
| Siguiente paso exacto | T08: esperar CloudFront Deployed, verificar HTTP 200 y abrir https://dursf4nho4zl6.cloudfront.net; después T09 |
| URL pública (CloudFront) | https://dursf4nho4zl6.cloudfront.net (publicada; verificación pendiente) |
| API (`API_URL`) | _sin desplegar_ |
| `MODEL_ID` confirmado | _pendiente (infra/00_check.sh)_ |

## Bloqueos

- Sesión actual: perfil `prometeo` operativo (STS), identidad root; permisos de servicios y Bedrock todavía no verificados. El bloqueo de ferlr siguiente es histórico y no aplica a esta laptop.

- [18:20] La laptop ferlr no tiene el perfil AWS `prometeo` (solo `default` y `road2tech`). Bloquea `infra/00_check.sh`, T08 y T10 — dueño de la cuenta AWS: `aws configure --profile prometeo`.

(Formato: `- [hora] descripción — quién puede resolverlo`.)

## Prerrequisitos humanos

- [ ] Acceso AWS por persona y perfil `prometeo` en cada laptop
- [ ] Invocación real de Claude en Bedrock (`us-east-1`)
- [ ] Acceso de push al repo para todo el equipo
- [x] `construir_corpus.py` del compañero en `pipeline/legacy/` (junto con `nasa_fuego_todo.py`, el descargador)

## Tareas

Estados: `pendiente` · `en curso` · `hecha` · `bloqueada` · `omitida (corte)`

| ID | Tarea | Prioridad | Estado | Agente / persona | Commit | Nota |
|---|---|---|---|---|---|---|
| T00 | Repo y docs | P0 | hecha | Claude · ferlr | (este commit) | Duplicado borrado, prototipos a archive/, decisiones y escenario real escritos |
| T01 | Datos en el repo | P0 | hecha | Claude · ferlr | (este commit) | 24 investigaciones de combustión, 22 CSV; data/ = 632 KB (meta sin listados de archivos ni contactos) |
| T02 | Scaffold + `00_check.sh` | P0 | hecha | Claude · ferlr | (este commit) | build, test y check_agnostic en verde. Falta que un humano corra infra/00_check.sh y anote MODEL_ID (esta laptop no tiene perfil prometeo) |
| T03 | Pack de demo | P0 | hecha | Claude · ferlr | (este commit) | Ruta rápida: SPECS del corpus del compañero. Pack completo: 24 estudios, 1,986 registros (1,889 pruebas + 97 campañas), 22 fuentes, 147 con bandera. g=0 solo en investigaciones de microgravedad (5 son de tierra) |
| T04 | Motor + vectores | P0 | hecha | Claude · ferlr | (este commit) | 22 vectores en verde con los valores de la guía §6.6/§6.7 (C4 D20, d=1.56/2.18/4.24, +7.8, 0/268, 36/107/11, 91 PMMA). tested_elsewhere usa la tolerancia (0.25σ) |
| T05 | Esqueleto del informe | P0 | hecha | Claude · ferlr | (este commit) | Informe React llenado desde pack/lens/mapping: Key findings, abstract por plantilla, Tables 1–4, Methods, References. Captura docs/screens/t05_report.png |
| T06 | Escenario y figuras | P0 | hecha | Claude · ferlr | (este commit) | Panel de escenario (sliders, selector, presets), Fig. 1 mapa, Fig. 2 cercanía, Fig. 3 huecos, niveles con icono+texto. Preset lunar: O₂ Near/not covered, presión Not studied, PMMA Studied. ~42 ms por paso de slider |
| T07 | Procedencia, PDF y URL | P0 | hecha | Claude · ferlr | (este commit) | Panel de procedencia (archivo, fila, valor original, conversión, DOI, SHA-256), Export PDF (9 páginas A4, docs/screens/t07_export.pdf), escenario en la URL. Sin desbordes a 400 px |
| T08 | Infra web (CloudFront) | P0 | en curso | Codex · stringbuilder | este commit | Scripts y despliegue ejecutados; repetición reutiliza IDs; CloudFront InProgress y verificación pública pendiente |
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

### 2026-11-14 19:20 CST · Codex · stringbuilder
- Hecho: T08 implementada y ejecutada con perfil prometeo. S3 privado, OAC y CloudFront; IDs y URL en infra/outputs.env. Inicio registrado en 765643f.
- Verificado: STS; npm ci (0 vulnerabilidades reportadas), 22/22 tests web, build TypeScript/Vite, check_agnostic OK, validate_pack OK (24 estudios / 1986 registros / 22 fuentes), bash -n. Reejecutar 10_web.sh devuelve los mismos IDs.
- Prueba API no ejecutable: `python3 -m pytest api/` → `No module named pytest`; Python local 3.14, proyecto pide 3.12. API todavía sin implementar.
- Pendiente: CloudFront reporta InProgress; curl falla `Could not resolve host`. Herramienta de navegador devuelve `The browser access host is unavailable`; no se verificó renderizado. T08 sigue en curso.
- Siguiente paso exacto: consultar Distribution.Status; con Deployed ejecutar curl y abrir la URL. Solo entonces cerrar T08 y seguir T09.
- Trampas: DNS del hostname virtual S3 devolvió certificado de otro dominio; endpoint regional oficial funcionó con TLS válido. npm ci necesitó acceso de red fuera del sandbox. Perfil AWS autentica como root; no se crearon credenciales ni roles adicionales.
- Diferencia documentada: sync conserva objetos antiguos y no usa --delete sin confirmación de borrado. tools/datos_psi/ preexistente permanece fuera del commit.


<!--
### [HH:MM] Persona · cuenta/laptop
- Hecho: T0x (commit abc1234), …
- Verificado con: …
- Quedó a medias: … (commit WIP def5678)
- Siguiente paso exacto: …
- Ojo con: …
-->
