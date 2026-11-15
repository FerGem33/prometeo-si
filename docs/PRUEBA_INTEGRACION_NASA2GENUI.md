# Prueba de integración en nasa2genui

## Estado comprobado (15-nov-2026)

Checkout de integración: `/private/tmp/prometeo-paper-proposito`, rama `nasa2genui`.
Se incorporaron `origin/nasa2genui` (2c4c34e) y `origin/main` (0d6f11c), mediante merges que conservan ambos historiales. Merge resultante: 1762ae5.
La rama local `main` queda en 9d55771 con sus cambios previos sin commit intactos; no se publicaron cambios en main.

- API: **188 passed**, Python 3.12.13.
- Web: **234 passed, 1 skipped**, 36 archivos de pruebas. La omitida depende de `/home/alexteori/Descargas/lote` en `nasaDetect.test.ts`; las pruebas parametrizadas del lote real y bundle externo sí se ejecutaron.
- TypeScript y build Vite, `check_agnostic`, `validate_pack`: correctos. Pack: 24 estudios, 1986 registros, 22 fuentes.
- Build repetido con `VITE_API_URL` desde `infra/outputs.env`: correcto. Aviso existente: bundle mayor de 500 kB.
- Sintaxis de ambos scripts de despliegue: correcta (`bash -n`).

Estos resultados prueban integración automatizada local, no llamadas reales a Bedrock, aceptación visual ni despliegue. El chat de corpus y los resúmenes locales conservan sus límites; no equivalen a cerrar todos los criterios de síntesis narrativa de la spec.

## Límite funcional pendiente

`remote.ts` y el handler coinciden en las peticiones/respuestas de `/propose` y `/design`. En cambio, `CaseModules.tsx` resuelve el corpus personalizado mediante `answerLocalQuery`: no llama a `/projects/{id}/ask` ni envía identidad JWT/contexto de proyecto. Para el pack de referencia, `/ask` interpreta condiciones y el motor calcula niveles. Falta conectar el chat de corpus al flujo privado y verificar la síntesis citada antes de declarar toda la spec terminada. El merge conserva este comportamiento, no lo presenta como chat IA libre integrado.

## Reproducir la verificación

Desde la rama de integración, con Python 3.12 y dependencias instaladas:

```bash
python3.12 -m pytest api/ -q
PROMETEO_LOTE_DIR=/ruta/al/lote-real \
PROMETEO_PUBLICATION_PATH=/ruta/al/bundle-revisado npm test --prefix web
bash scripts/check_agnostic.sh
python3 -I pipeline/validate_pack.py
source infra/outputs.env
VITE_API_URL="$API_URL" npm run build --prefix web
bash -n infra/20_api.sh infra/deploy_web.sh
git diff --check
```

En esta laptop, el intérprete utilizado fue `/Users/stringbuilder/prometeo-si/api/.venv/bin/python`; lote `/Users/stringbuilder/prometeo-si/tools/psi/data/dominio_ebullicion/lote`; bundle `/tmp/prometeo-t37-local-v1-final/bundle`. Los originales siguen fuera de git.

## Prueba manual antes de publicar

```bash
cd /private/tmp/prometeo-paper-proposito
source infra/outputs.env
VITE_API_URL="$API_URL" npm --prefix web run dev -- --host 127.0.0.1 --port 5173 --strictPort
```

Abrir `http://localhost:5173`. Esto usa la web de la rama y el API actualmente publicado: **no ejecuta el nuevo backend local**. Hasta publicar el API, una ruta no disponible puede activar fallback; comprobar la etiqueta del modo y la pestaña Network.

1. Cargar el pack de referencia y el lote real; introducir propósito, seleccionar variables y generar informe.
2. Comprobar módulos de captura, notas con confirmación, clasificación A–D, referencias y chat. El propósito vacío debe impedir continuar.
3. Confirmar que una variable manual permanece sin evidencia inventada y que guardar/reabrir la evaluación conserva el caso.
4. Revisar `/design`, `/propose`, `/ask` y `/analysis` según el flujo usado: estado HTTP, procedencia y fallback visible si falla el servicio.
5. Para proyectos privados, iniciar sesión y comprobar autorización y CORS en localhost y 127.0.0.1:5173. Las pruebas API cubren el preflight privado; la sesión real sigue pendiente de aceptación.
6. Registrar revisión humana del informe contra AGENTS §5–§7 en PROGRESS.md antes de publicar la web.

## Despliegue posterior

**Una rama git no crea un entorno AWS separado.** Los scripts actuales usan los recursos compartidos de `infra/outputs.env`. Ejecutarlos actualiza la API o web existente; no se creó infraestructura de staging en esta tarea.

Después de la aceptación y de decidir el destino, para el despliegue compartido existente:

```bash
# Comprobar primero que se está en nasa2genui y que el árbol está limpio.
git branch --show-current
git status --short
export AWS_PROFILE=prometeo
EXTRA_ORIGINS=http://localhost:5173,http://127.0.0.1:5173 \
  PYTHON=python3.12 bash infra/20_api.sh
# Verificar rutas nuevas/privadas y fallback antes de publicar la web.
# Solo tras registrar revisión humana:
bash infra/deploy_web.sh
```

Conservar `MODEL_ID` aprobado en `infra/config.env`. No omitir `EXTRA_ORIGINS`: el script reemplaza esa configuración. No ejecutar estos comandos para una simple prueba local. Si se requiere staging aislado, primero hay que definir y autorizar sus recursos y outputs; los scripts anteriores no proporcionan aislamiento por rama.
