# Prometeo — Progreso

> Fuente única del estado del proyecto. Cada agente lo lee al empezar y lo actualiza al terminar cada tarea (ver `AGENTS.md`).
> Las tareas están descritas en [`docs/PLAN.md`](docs/PLAN.md).

## Estado actual

| Campo | Valor |
|---|---|
| Hora 0 (inicio del reloj) | 2026-11-14 18:16 CST |
| Tarea en curso | T15 (Codex · stringbuilder); T08/T11 pendientes de revisión final |
| Último commit verificado | T15 (este commit): pruebas locales en verde; aceptación pública pendiente |
| Siguiente paso exacto | Dueño: integrar cambios finales, publicar con `infra/deploy_web.sh`, revisar URL en privado/móvil, completar aceptación y confirmar T08/T11/T15. |
| URL pública (CloudFront) | https://dursf4nho4zl6.cloudfront.net (Deployed y HTTP 200; revisión visual pendiente) |
| API (`API_URL`) | https://ve5oqmsyie.execute-api.us-east-1.amazonaws.com |
| `MODEL_ID` confirmado | us.anthropic.claude-haiku-4-5-20251001-v1:0 (Converse y SDK real OK) |

## Bloqueos

- Sesión actual: perfil `prometeo` operativo (STS), identidad root; T14 confirmó invocaciones Converse reales de Bedrock en `us-east-1` (22 tablas). Operaciones de despliegue S3/CloudFront verificadas; no se desplegó la UI final. El bloqueo de ferlr siguiente es histórico y no aplica a esta laptop.

- [18:20] La laptop ferlr no tiene el perfil AWS `prometeo` (solo `default` y `road2tech`). Bloquea `infra/00_check.sh`, T08 y T10 — dueño de la cuenta AWS: `aws configure --profile prometeo`.

(Formato: `- [hora] descripción — quién puede resolverlo`.)

## Prerrequisitos humanos

- [ ] Acceso AWS por persona y perfil `prometeo` en cada laptop
- [x] Invocación real de Claude en Bedrock (`us-east-1`), confirmada en T14 (22 llamadas)
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
| T12 | Ficha de datos para ML | P2 | hecha | Codex · stringbuilder | `b4f8ced` | Tabla descriptiva por estudio/archivo/columna/tipo; valores y unidades sin normalizar ni combinar; candidatos duplicados exactos quedan retenidos. Idoneidad ML pendiente de umbrales/definición humana; frecuencias no son clases validadas. |
| T13 | Comparar 2 estudios | P2 | hecha | Codex · stringbuilder | `db5386e` | Selectores para dos estudios; columnas con metadatos, DOI, valores test/campaña separados, etiquetas, unidades fuente y enlaces a registros. Captura `docs/screens/t13_study_compare.png`. |
| T14 | Prueba agnóstica | P3 | hecha | Codex · stringbuilder | `bea99e1` | 22 tablas, 22 llamadas Bedrock, 103 filas reales; 21 tablas puntuadas: 148/227 asignaciones exactas (65.2%), 107/227 con unidad exacta (47.1%). Varias diferencias; el modelo no aprueba/reemplaza el mapping humano. `docs/agnostic_proof.md`. CSV originales no están versionados en `data/psi/tables`; se leyó la copia local sin incluirla. |
| T15 | Aceptación y entrega | P0 | en curso | Codex · stringbuilder | (este commit) | README para jueces y revisión local; URL pública final, pruebas en ventana privada/móvil y deploy quedan pendientes del dueño. |

## Aceptación final (T15)

- [ ] 1. URL abre sin cuenta ni escrituras al servidor
- [ ] 2. Preset lunar base: O₂ near/not studied (BASS-II), presión not studied, PMMA studied
- [ ] 3. Sliders recalculan sin retraso visible
- [ ] 4. Clic en valor → archivo, fila y DOI
- [ ] 5. Export PDF completo
- [ ] 6. `/ask` cambia escenario; pregunta de contenido → mensaje de límite
- [ ] 7. `/analysis` solo con fuentes; plantilla si la API cae
- [x] 8. `npm test` (35), `pytest api/` (26 en `api/.venv`, Python 3.12.13), `check_agnostic.sh` en verde
- [ ] 9. Deploy desde otra laptop sin duplicar recursos

## Revisión final pendiente

- **Deploy del dueño:** la UI de T11 y la comparación/ficha nuevas no se han publicado. HTTP 200 del CloudFront confirma respuesta del servidor, no versión ni render final. Revisar los ítems 1–7 y 9 de aceptación después del deploy final en navegador privado y móvil.
- **Revisión humana de ML (T12):** la ficha conserva resultados originales y reporta frecuencias descriptivas. El equipo no ha definido clases destino ni umbrales; no debe usarse como veredicto de aptitud ni como selección de modelo.
- **Revisión humana del mapeo (T14):** la propuesta de Bedrock coincide con el mapping en 65.2% de asignaciones y 47.1% de asignación + unidad en muestras pequeñas. Revisar diferencias en `docs/agnostic_proof.md`; el mapping humano continúa siendo la referencia aprobada.
- **Reproducibilidad de T14:** el checkout no tiene `data/psi/tables`; se ejecutó desde `tools/datos_psi/tablas`, que permanece fuera de Git. Un clon limpio debe recibir esos CSV para repetir la corrida.
- **No desplegado:** se respetó la instrucción del dueño de reservar el deploy web final. No se modificaron recursos AWS en T12–T15.

## Bitácora de relevos

Una entrada por sesión de agente, la más reciente arriba.

### 2026-11-14 20:28 CST · Codex · T14 y comienzo T15
- Hecho: `pipeline/induce_schema.py` ejecutó una propuesta Bedrock por cada una de las 22 tablas del pack, con cinco filas como máximo (103 filas disponibles). Se compararon 227 columnas de 21 tablas con referencia humana; la tabla resumen PSI-142 no tiene mapping aprobado y no entra al porcentaje.
- Resultado real: 148/227 asignaciones exactas (65.2%); 174/227 unidades exactas (76.7%); 107/227 coincidencias conjuntas (47.1%). La salida con discrepancias por encabezado queda en `docs/agnostic_proof.md`; es evidencia exploratoria, no aprobación del mapping.
- Reproducción: `export AWS_PROFILE=prometeo && source infra/config.env && python3.12 -I pipeline/induce_schema.py --tables-dir tools/datos_psi/tablas`. 22 llamadas Converse con `MODEL_ID` configurado; 15,949 tokens de entrada y 9,313 de salida.
- Límite de checkout: los CSV no están presentes en `data/psi/tables`; la corrida usó `tools/datos_psi/tablas`, que ya estaba local y permanece fuera del commit. Un clon limpio necesita recibir/cargar la copia fuente antes de reproducir T14.
- Verificación T15 local: web 35/35, API 26/26 en `api/.venv` (Python 3.12.13), build Vite/TS, `check_agnostic.sh`, sintaxis Python de T14 y `git diff --check` OK. `python3.12 -m pytest` del sistema falla por `No module named pytest`; se usó el entorno versionado local `api/.venv`.
- URL actual: CloudFront responde HTTP 200 por HEAD, pero esa respuesta no comprueba el render ni contiene la UI final de este checkout. No se hizo deploy. GET al root de API responde 404, esperado porque no existe ruta raíz; los endpoints `/ask` y `/analysis` están previamente verificados en T10.
- Siguiente paso exacto: revisar y subir el README de jueces y este estado T15. El dueño debe desplegar la UI integrada y revisar en navegador privado/móvil los ítems restantes de T08/T11/T15.

### 2026-11-14 20:29 CST · Codex · T15 preparación de entrega
- Hecho: README en inglés para jueces con URL, uso en tres pasos, fuentes/licencia, comportamiento determinista, límites del análisis y alcance del MVP.
- Verificado: CloudFront `HEAD` HTTP 200; web 35/35 Vitest y build; API 26/26 con el entorno local Python 3.12; `check_agnostic.sh`; compilación sintáctica de `pipeline/induce_schema.py`; `git diff --check`.
- Pendiente: el estado de CloudFront no demuestra que la UI de este checkout esté publicada. No se desplegó por instrucción del dueño. Los ítems públicos de T08/T11 y 1–7/9 de aceptación T15 siguen abiertos; ver lista Revisión final pendiente.
- Siguiente paso exacto: el dueño integra cambios finales, ejecuta `infra/deploy_web.sh` y valida URL en privado y móvil, preguntas, análisis, procedencia y PDF; luego registra la evidencia y cierra T08/T11/T15.

### 2026-11-14 20:18 CST · Codex · T13 y comienzo T14
- Hecho: T13 permite comparar dos estudios elegidos. Presenta título, objetivo/condiciones (expandibles cuando son extensos), subjects, instrumentos, DOI, valores de variables en unidades normalizadas, columnas/unidades originales y registros de test/campaña por separado con acceso a provenance.
- Verificado: `docs/screens/t13_study_compare.png` generado desde la versión local y revisado visualmente; muestra la comparación en dos columnas (ACME/Flame Design y BASS-II), citas DOI, valores, etiquetas y unidades. `npm test` 35/35, `npm run build` y `git diff --check` OK.
- Siguiente paso exacto: T14, generar propuesta de esquema a partir de cinco filas de tablas reales, cotejar por columna con `mapping.json`, guardar aciertos y alcance del muestreo en `docs/agnostic_proof.md`.
- Pendiente de revisión final: deploy y revisión visual en URL pública para T08/T11; cierre de checklist T15 después de que el dueño publique la UI final.

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
