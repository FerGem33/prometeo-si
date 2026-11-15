# Diagramas isométricos (kit Anatomy)

Kit para dibujar figuras isométricas en SVG. Es el mismo que usa el proyecto de referencia `Diagramas/` (un portafolio en Astro),
tomado del original [wheresryan22/anatomy](https://github.com/wheresryan22/anatomy) (commit `1482e84`, licencia MIT, ver `LICENSE`).
**No tiene dependencias de npm**: son archivos copiados.

## Qué hay aquí

| Archivo | Qué es | ¿Se edita? |
|---|---|---|
| `iso-kit.ts` | Todo el núcleo: cámara, sólidos, piezas, líneas, texto sobre caras, SVG como texto | No (copia literal) |
| `iso.css` | Estilos y tokens `--anatomy-*` (tema oscuro neutro por defecto) | No (copia literal) |
| `react/draw.tsx` | Componentes React válidos en servidor: `Solid`, `Line`, `Wire`, `Dots`, `FaceText`, `IsoFigure`, `Plate` | No |
| `react/live.tsx` | Hooks de cliente (`"use client"`): `useLoop`, `useInView`, `useReadout`, `useEased`, `useStillness`, `spring`, `follow` | No |
| `gl.mjs`, `gl-shared.mjs`, `gl.d.mts` | Capa WebGL opcional (fuego, brillo, flujo) en la misma perspectiva. Usar uno u otro, nunca los dos | No |
| `theme-prometeo.css` | **Nuestro** puente de tema: mapea los tokens del kit a la paleta de Prometeo | Sí |
| `habitats/build.ts`, `chamber/build.ts`, `bench-geometry.ts`, `flame.ts`, `backdrop.ts` | **Nuestras** figuras: 6 hábitats, cámara de combustión (corte con ventana), banco de muestra, la lengua de llama compartida y los fondos de escena (cielo, disco planetario, rejilla de piso) | Sí |
| `index.ts` | Punto de entrada: `import { iso, Solid, IsoFigure, Plate, useLoop } from '@prometeo/genui/iso'` | Sí |

La skill completa para diseñar figuras (guías, 9 ejemplos, scripts de captura y auditoría) está en `.claude/skills/anatomy/` (local, no versionada).

## Cómo se integra una figura (verificado en `frontend/src/app/iso-lab/`)

```
<carpeta de la figura>/
  geometry.ts   geometría pura con `iso.*` (sin DOM): proyección con `iso.fitProjection`, sólidos con `iso.slabOf` / `iso.cylinder`…
  Live.tsx      "use client": lo ÚNICO que se mueve; usa `useLoop`, `useInView`, `useReadout`
  <Figura>.tsx  compone: <Plate> → <IsoFigure width height label> → <Solid/>, <Line/>, <Dots/>… en orden de pintado (de atrás hacia delante)
```

1. **Estilos:** importar `@prometeo/genui/iso/iso.css` y **después** `@prometeo/genui/iso/theme-prometeo.css`, desde la figura (no globalmente).
2. **Contenedor:** `className="iso iso-prometeo"` en un ancestro de la figura. Los tokens propios de una figura van en su clase, nunca en `:root`.
3. **Tamaño:** `IsoFigure` lleva `viewBox`; el SVG llena el ancho de su contenedor. Fijar la proporción del hueco evita saltos de layout.
4. **Movimiento:** solo en efectos y bucles (`useLoop`), arranca cuando la figura es visible (`useInView`) y respeta `prefers-reduced-motion` (el segundo argumento `calm` del bucle).
5. **Lectura en vivo:** `useReadout()` escribe en el `[data-readout]` del `Plate` sin re-renderizar.
6. **Accesibilidad:** `label` describe lo que se ve (`role="img"` + `aria-label`); la lectura es texto real.
7. **Claves:** cada elemento que se pasa como prop lleva `key` estable (`<Solid key="…">`).
8. **WebGL (opcional):** `import('@prometeo/genui/iso/gl')` dinámico cuando la figura sea visible; `<canvas aria-hidden>` en `position:absolute; inset:0` sobre el SVG. El SVG debe entenderse sin WebGL.

### Dos sitios posibles, los dos probados

- **Página o sección de Next (componente de servidor)** — como `/iso-lab`: la geometría corre en el servidor, el HTML ya trae el SVG y solo `Live.tsx` viaja al navegador.
- **Dentro de la app actual o de un componente de GenUI** (todo es cliente): los mismos componentes funcionan igual; ver `iso.test.tsx`. Para que la IA pueda pedir una figura desde `lens.layout`, se registra como un componente más en `components/registry.tsx` + `PROP_SCHEMAS` de `genui/lens.ts`.

## Licencia

MIT. El aviso se publica en `frontend/public/licenses/anatomy.txt` porque parte del kit llega al navegador. Si se actualiza el kit, volver a copiar los archivos marcados "copia literal" y revisar `theme-prometeo.css`.
