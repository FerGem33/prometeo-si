# Unificación de Backend y Frontend Prometeo — Plan de Implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Integrar todos los cambios recientes de backend, APIs, workers y pipelines de `prometeo-si` (`origin/main`) en el proyecto `Frontend/prometeo-si`, conservando íntegro el diseño visual y los componentes de la interfaz de usuario en `web/`.

**Architecture:** El código visual (`web/src/`) en `origin/main` ya contiene exactamente el mismo diseño que `Frontend/prometeo-si` (tema gris carbón, animaciones de flama, visor isométrico, simulador What-If, tour de jueces, etc.). La integración consiste en traer los 26 commits de backend a la rama de `Frontend/prometeo-si`, configurar `web/.env.local`, y validar que las 98 pruebas y la compilación pasen sin errores.

**Tech Stack:** React 19, TypeScript, Vite, Vitest, Python 3.12, AWS SDK/Boto3, DynamoDB, Cognito.

**Spec:** `docs/superpowers/specs/2026-11-15-merge-backend-with-frontend-design.md`

## Global Constraints

- El diseño, estilos CSS (`report.css`, `flow.css`, `theme-prometeo.css`, `graph.css`, etc.) y componentes de `web/src/` deben permanecer intactos.
- `web/` debe pasar 98/98 tests en Vitest (`npm test`).
- `npm run build` debe completar sin errores de TypeScript ni empaquetado.
- No se deben sobrescribir credenciales ni configuraciones secretas.

## Review Focus

- Comprobar que `web/.env.local` contenga `VITE_API_URL=https://ve5oqmsyie.execute-api.us-east-1.amazonaws.com`.
- Comprobar que no existan conflictos de Git entre `nasa2genui` y `origin/main`.
- Comprobar que todos los módulos de `api/`, `pipeline/`, `infra/`, `tools/` y `docs/` queden disponibles en `Frontend/prometeo-si`.

---

### Task 1: Sincronizar `origin/main` en `Frontend/prometeo-si`

**Files:**
- Modify: `Frontend/prometeo-si` (árbol de Git)

- [ ] **Step 1: Comprobar estado limpio de Git en `Frontend/prometeo-si`**
  Ejecutar: `git -C Frontend/prometeo-si status`
  Resultado esperado: working tree clean.

- [ ] **Step 2: Cambiar a la rama `main` y traer `origin/main`**
  Ejecutar:
  ```bash
  git -C Frontend/prometeo-si checkout main
  git -C Frontend/prometeo-si pull origin main
  ```
  Resultado esperado: `main` avanza a `8f23050`.

- [ ] **Step 3: Actualizar o fusionar en la rama `nasa2genui`**
  Ejecutar:
  ```bash
  git -C Frontend/prometeo-si checkout nasa2genui
  git -C Frontend/prometeo-si merge main -m "merge: integrar backend actualizado de main conservando diseno de frontend"
  ```
  Resultado esperado: Merge completado sin conflictos en `web/src/`.

---

### Task 2: Configurar entorno y dependencias

**Files:**
- Create/Verify: `Frontend/prometeo-si/web/.env.local`
- Verify: `Frontend/prometeo-si/web/src/engine/publication.test.ts`

- [ ] **Step 1: Verificar y copiar `web/.env.local` si no existe**
  Comprobar si existe `Frontend/prometeo-si/web/.env.local`. Si falta, copiar desde `prometeo-si/prometeo-si/web/.env.local`.

- [ ] **Step 2: Verificar contenido de `.env.local`**
  Asegurar que contenga:
  ```env
  VITE_API_URL=https://ve5oqmsyie.execute-api.us-east-1.amazonaws.com
  ```

---

### Task 3: Verificación de pruebas y compilación en `web/`

**Files:**
- Verify: `Frontend/prometeo-si/web`

- [ ] **Step 1: Ejecutar suite de pruebas de Vitest**
  Ejecutar: `cd Frontend/prometeo-si/web && npm test -- --run`
  Resultado esperado: 17 suites, 98 tests pasados (100% PASS).

- [ ] **Step 2: Ejecutar compilación de producción**
  Ejecutar: `cd Frontend/prometeo-si/web && npm run build`
  Resultado esperado: `tsc --noEmit && vite build` termina con código de salida 0 y genera `dist/`.

---

### Task 4: Verificación final de consistencia y reporte

**Files:**
- Document: `Frontend/prometeo-si/PROGRESS.md`

- [ ] **Step 1: Verificar el estado de git en `Frontend/prometeo-si`**
  Ejecutar: `git -C Frontend/prometeo-si status` y `git -C Frontend/prometeo-si log -n 5 --oneline`
  Resultado esperado: Árbol limpio y alineado con `main`.

- [ ] **Step 2: Presentar resumen y estado al usuario**
  Confirmar que todos los archivos de backend están listos y que la interfaz de usuario se mantiene exactamente como se solicitó.
