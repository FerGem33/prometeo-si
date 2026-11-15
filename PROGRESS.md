# Prometeo — Progreso

> Fuente única del estado del proyecto. Cada agente lo lee al empezar y lo actualiza al terminar cada tarea (ver `AGENTS.md`).
> Las tareas están descritas en [`docs/PLAN.md`](docs/PLAN.md).

## Estado actual

| Campo | Valor |
|---|---|
| Hora 0 (inicio del reloj) | 2026-11-14 18:16 CST |
| Tarea en curso | T13 (Codex · stringbuilder); T08/T11 pendientes de revisión final |
| Último commit verificado | T10: 2bda497; T11 pruebas locales en este commit |
| Siguiente paso exacto | T13: implementar comparación seleccionable de dos estudios con valores, unidades, citas y etiquetas; verificar y guardar captura. Mantener pendiente el deploy web del dueño y revisión visual pública para cerrar T08/T11/T15. |
| URL pública (CloudFront) | https://dursf4nho4zl6.cloudfront.net (Deployed y HTTP 200; revisión visual pendiente) |
| API (`API_URL`) | https://ve5oqmsyie.execute-api.us-east-1.amazonaws.com |
| `MODEL_ID` confirmado | us.anthropic.claude-haiku-4-5-20251001-v1:0 (Converse y SDK real OK) |

## Bloqueos

- Sesión actual: perfil `prometeo` operativo (STS), identidad root; operaciones de despliegue S3/CloudFront verificadas; Bedrock todavía no verificado. El bloqueo de ferlr siguiente es histórico y no aplica a esta laptop.

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
| T08 | Infra web (CloudFront) | P0 | en curso | Codex · stringbuilder | este commit | Scripts y despliegue ejecutados; repetición reutiliza IDs; CloudFront Deployed y HTTP 200; revisión visual pendiente |
| T09 | Lambda `/ask` y `/analysis` | P1 | hecha | Codex · stringbuilder | este commit | 26 tests y ambos eventos locales con SDK real OK; contrato en api/README.md |
| T10 | Infra API | P1 | hecha | Codex · stringbuilder | este commit | Lambda/Gateway con rol acotado, /ask 200 en 7.876 s; /analysis 200 |
| T11 | UI de preguntas y análisis | P1 | en curso | Codex · stringbuilder | este commit | Implementada; 32 tests web y build OK. Falta deploy final del dueño y verificación pública visual |
| T12 | Ficha de datos para ML | P2 | hecha | Codex · stringbuilder | (este commit) | Tabla descriptiva por estudio/archivo/columna/tipo; valores y unidades sin normalizar ni combinar; candidatos duplicados exactos quedan retenidos. Idoneidad ML pendiente de umbrales/definición humana; frecuencias no son clases validadas. |
| T13 | Comparar 2 estudios | P2 | en curso | Codex · stringbuilder | (inicio en este commit) | Comparación lado a lado con unidades, citas y etiquetas; pendiente captura de verificación. |
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

### 2026-11-14 20:01 CST · Codex · T12 y comienzo T13
- Hecho: T12 agrega ficha determinista de resultados aprobados por mapping, agrupados por estudio, fuente, columna literal y tipo. Presenta denominadores, datos completos, cobertura de unidades declaradas, frecuencias textuales y candidatos de filas exactas repetidas entre fuentes. Todos los registros candidatos permanecen incluidos.
- Límite para revisión final: no hay en el contrato una definición de target/clase ni umbrales de idoneidad ML. La UI llama descriptivas a las frecuencias y no emite un veredicto de aptitud; el equipo debe definir criterios antes de usarla para elegir un modelo.
- Verificado: Vitest 35/35, build de producción, `scripts/check_agnostic.sh` y `git diff --check` OK. Un primer assertion de orden en una prueba nueva falló; corregido para validar ambos tipos sin asumir orden y la corrida final pasó.
- Siguiente paso exacto: T13, comparación lado a lado de dos estudios con unidades, citas y etiquetas; guardar captura. El deploy final web y la inspección pública continúan a cargo del dueño antes de cerrar T08/T11/T15.

### 2026-11-14 19:41 CST · Codex · T11 lista para deploy del dueño
- Hecho: barra /ask con sugerencias de lens, validación de respuesta, chips que enfocan controles editables; Analysis con fuentes, debounce 800 ms, cancelación de solicitudes obsoletas y timeout 20 s; plantilla explícita ante error.
- Deploy: infra/deploy_web.sh exporta VITE_API_URL desde API_URL antes del build. Guía actualizada; no se publicó la nueva UI, por instrucción de reservar el deploy final al dueño.
- Verificado: 32 tests web (22 motor + 10 contratos API), 26 API, build con API_URL, pack, agnostic, shell syntax y git diff --check OK. API pública /ask y /analysis ya verificadas en T10 (2bda497).
- Pendiente: verificación visual pública de T08/T11; no se marca T11 hecha porque el plan requiere comprobar interacción en URL pública. T12–T15 no iniciadas.
- Siguiente paso exacto: integrar cambios finales del equipo, ejecutar infra/deploy_web.sh y verificar pregunta 25% O₂ / 0.5 atm / Nomex, edición, fuentes y fallback; cerrar T08/T11 solo con evidencia.


### 2026-11-14 · Codex · T10
- Hecho: infra/20_api.sh, Lambda Python3.12 arm64, Gateway HTTP, CORS CF_URL y throttle 5/10; outputs versionados sin secretos.
- Verificado: shell sintaxis y llamadas públicas /ask HTTP 200 7.876238 s; /analysis HTTP 200 0.903628 s, mode=ai y fuentes. SDK/pack incluidos para Linux.
- Incidencia corregida: serialización de política vacía en primera ejecución; segunda ejecución reutilizó función/API/rol y completó.
- Siguiente paso: T11, integrar UI; conservar publicación final web para dueño. T08 revisión visual aún pendiente.


### 2026-11-14 19:33 CST · Codex · T09
- Hecho: handler /ask y /analysis, verificador, eventos de datos reales, documentación, dependencias fijadas y smoke. Inicio 7b67e86; se inicia T10.
- Verificado: Python 3.12.13, 26 tests API, 22 web, build, pack y agnostic OK. Smoke con SDK AnthropicBedrock: /ask 200 (25, 0.5, Nomex), /analysis 200 mode=ai (268 pruebas, fuentes PSI verificadas).
- Recorte: redacción restringida a frases verificables de seis códigos; no se admite prosa libre ni fuentes/contadores del cliente sin cotejo con pack. Otros códigos se omiten; fallback explícito.
- Trampas resueltas: aws login requiere botocore[crt] local; el modelo puede envolver JSON en bloque markdown y se acepta solo ese envoltorio exacto. API no desplegada aún.
- Siguiente paso: T10, scripts idempotentes para empaquetar dependencias Linux y desplegar Lambda/Gateway; después T11. El deploy final de web sigue a cargo del dueño.


### 2026-11-14 · Codex · guía de relevo y deploy final
- Estado remoto: CloudFront Deployed y curl HTTPS HTTP/2 200 confirmados; despliegue base en 3b53e4d.
- Documentación: infra/README.md detalla contribución del equipo sin deploy, autenticación individual, archivos env compartidos, publicación final por el dueño, verificación y recuperación.
- Configuración: se reutilizan infra/config.env e infra/outputs.env versionados y sin secretos; no hace falta duplicarlos en un .env raíz.
- Verificación de esta entrega: 22/22 tests web, build, check_agnostic y validate_pack OK; git diff --check OK. Prueba API: `No module named pytest` con Python 3.14; no aprobada.
- Alcance de esta entrega: documentación; no se volvió a publicar ni se cambiaron recursos AWS. La publicación final queda a cargo del dueño cuando integre los cambios del equipo.
- Pendiente real: comprobación visual (herramienta de navegador indisponible); T08 no se marca hecha solo por HTTP 200. API/Bedrock y T15 siguen pendientes.


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
