# Especificación de Diseño — Unificación de Frontend y Backend Prometeo

**Fecha:** 2026-11-15  
**Tamaño:** Cambio pequeño / Integración de repositorio  
**Tema:** Actualizar `Frontend/prometeo-si` con las actualizaciones de `origin/main` de `prometeo-si` conservando el diseño UI intacto.

## 1. Intención y Propósito
El usuario dispone de dos carpetas en el workspace:
1. `Frontend/prometeo-si`: contiene el diseño principal en `web/` (tema gris carbón `#2B2B2A`, animaciones de flama de campamento, visor isométrico de hábitats y cámara, presets de misiones de la NASA, simulador What-If, tour de jueces y exportación de dossier), pero su historial está atrasado (commit `ba1f5b5` / `c37d567`), faltando 26 commits de backend, AWS, workers y pipelines.
2. `prometeo-si/prometeo-si`: contiene la rama `origin/main` actualizada (`8f23050`), con todas las tareas T31–T37 (APIs de proyectos, subida de archivos, borrado, workers SQS, revisión de esquemas, publicación local de paquetes y herramientas de Cognito).

El objetivo es unificar ambos proyectos actualizando el repositorio de trabajo principal con todo el backend actualizado, garantizando que el diseño y componentes de `web/` permanezcan exactamente iguales.

## 2. Metas, No-Metas y Restricciones
- **Metas:**
  1. Actualizar `Frontend/prometeo-si` a la última versión de `origin/main` (`8f23050`) para incorporar todos los avances de backend (`api/`, `pipeline/`, `infra/`, `tools/`, `docs/`).
  2. Conservar el diseño de `Frontend` en `web/` (el código de componentes y estilos en `main` ya es idéntico al de `Frontend`, preservando todas las vistas, estilos e interactividad).
  3. Asegurar que `web/.env.local` esté presente y configurado con el endpoint de API desplegado en AWS.
  4. Mantener operativas las dependencias (`node_modules`), garantizando que `npm test` (98 tests) y `npm run build` en `web/` pasen al 100%.
  5. Asegurar un entorno limpio y unificado para el usuario.
- **No-Metas:**
  - No alterar la paleta visual, maquetación ni componentes interactivos de `web/`.
  - No modificar la lógica de los contratos ni romper pruebas de regresión.
- **Restricciones:**
  - Mantener limpia la historia de Git sin pérdida de código.
  - 100% de tests en verde en `web` (98/98).

## 3. Enfoques Considerados y Selección
- **Enfoque 1 (Recomendado): Sincronizar y unificar en `Frontend/prometeo-si`**
  - Traer `origin/main` (commit `8f23050`) directamente a la rama `main` de `Frontend/prometeo-si`.
  - Crear una rama de integración o fusionar hacia la rama de trabajo si se desea conservar referencia de `nasa2genui`.
  - Al estar verificado que `origin/main:web/src/` es byte-a-byte idéntico a `Frontend/prometeo-si:web/src/`, no hay ningún conflicto visual ni regresión en la interfaz.
  - Copiar `web/.env.local` desde `prometeo-si/prometeo-si`.
  - Ejecutar verificación de pruebas (`npm test`, `npm run build`).
- **Enfoque 2: Copiar manualmente archivos de backend a `Frontend/prometeo-si` sin usar Git**
  - Descartado porque rompe el control de versiones, dificulta futuros `git pull` / `git push` y deja el historial inconsistente con el equipo.

## 4. Plan de Ejecución
1. En `Frontend/prometeo-si`, cambiar a la rama `main` y actualizarla con `origin/main` (`git pull origin main` / `git merge origin/main`).
2. Verificar que `nasa2genui` quede sincronizada o fusionada con `main`.
3. Asegurar que `web/.env.local` esté presente en `Frontend/prometeo-si/web/`.
4. Ejecutar suite de pruebas en `Frontend/prometeo-si/web`: `npm test` (98 pruebas) y `npm run build`.
5. Verificar el estado de git en ambos repositorios.
