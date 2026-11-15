# T36 — Correcciones auditables y originales desplegados

Estado al 15-nov: **en curso**. CLI y API persistente de registros/conflictos
implementadas; confirmación del mismo valor y nueva versión del pack verificadas
en AWS. Originales CSV también comprobados. Claims en servidor/PDF/pantallas
siguen pendientes. Evidencia y contrato: [relevo API](T35_T37_RELEVO_API.md).

## Original en página citada

`POST /projects/{id}/documents/{doc_id}/url` acepta `{}` o `{"page":n}`.
Autoriza primero el proyecto, después el documento y su prefijo exacto de S3.
No firma documentos ajenos, borrados o con subida incompleta. Devuelve URL GET
de 300 segundos; en PDF agrega `#page=n`. El fragmento indica al visor dónde abrir
el original completo, no genera otro PDF. La página exige conteo de páginas
parseado; fuera de rango o para CSV responde 400; conteo aún ausente 409.

Preparación optativa, sin desplegar:

```bash
export AWS_PROFILE=prometeo
set -a
source infra/config.env
source infra/outputs.env
set +a
api/.venv/bin/python -I infra/deploy_projects.py \
  --output-dir /tmp/prometeo-t36-originals --uploads --schema --originals
```

La preparación con esos tres flags genera 15 rutas JWT; uploads solo genera 11,
uploads+originals 12. Los scripts no borran rutas activadas anteriormente.
La lectura del original reutiliza `s3:GetObject` del prefijo raw ya acotado;
no amplía permisos a otros buckets. No guardar URLs firmadas en logs o Git.

## Resultado real AWS (15-nov)

API actualizada con el código 2745d85; `--uploads --originals` aplicado. Consulta
real de Gateway: 12 rutas JWT; Lambda Active/Successful conserva rol y modelo D6.
Smoke real de dos usuarios con CSV PSI-87: **23 comprobaciones HTTP y un cotejo
SHA pasan**. Original ajeno 404, solicitud de URL 200, GET firmado S3 200, contenido
idéntico al original local y página para CSV 400. DELETE 204 y GET borrado 404;
proyecto temporal limpiado. Recibo sin tokens/URLs:
`t36-original-smoke-2026-11-15.json`.

Repetir solo si cambia código/configuración relevante, desde entorno cargado:

```bash
T33_PYTHON=api/.venv/bin/python node tools/cognito/cli.mjs uploads \
  'tools/psi/data/dominio_ebullicion/lote/PSI-87__PSI-87_Experimental table_Experimental Table - PBE.csv' \
  --cleanup --originals
```

Esto verifica integridad de descarga, no ejecución del worker (`sha256_observed`
sigue null). La apertura de PDF en página citada sigue sin prueba AWS por falta
del parseado T34; páginas y TTL sí tienen pruebas con dobles. La interfaz debe
abrir la URL del original en visor/navegación; el bucket solo configura CORS de
subida PUT, no lectura mediante fetch desde otro origen.

## CLI de revisión de valores y conflictos

```bash
api/.venv/bin/python -I pipeline/review_records.py prepare \
  --corpus /tmp/prometeo-t37-local-t38/corpus.json \
  --approval /tmp/prometeo-t37-local-t38/approval.json \
  --extraction /tmp/prometeo-t37-local-t38/extraction.json \
  --metadata /tmp/prometeo-t37-local-t38/metadata.json \
  --output /tmp/prometeo-t36-review-v1.json
```

La ejecución real local preparó51 registros y0 conflictos. No aplicó ninguna
corrección científica ni añadió afirmaciones al corpus. Para editar, una persona
prepara un JSON de acciones, con IDs reales del borrador; no copiar valores
ficticios ni usar un nombre de revisor ajeno:

```bash
api/.venv/bin/python -I pipeline/review_records.py edit \
  --corpus /tmp/prometeo-t37-local-t38/corpus.json \
  --review /tmp/prometeo-t36-review-v1.json \
  --changes /tmp/cambios-revisados.json --reviewer 'Nombre del revisor' \
  --version 1 --output /tmp/prometeo-t36-review-v2.json
```

Cada acción exige razón y un cuerpo exacto:

| `op` | Campos adicionales |
|---|---|
| `correct` | `record_id, variable, value, reason` |
| `exclude` | `record_id, reason` |
| `resolve` | `conflict_id, choice, reason` (`choice`: índice, `keep_all`, `exclude`) |
| `claim` | `claim, reason` (forma Claim de §5.8) |

Correcciones conservan el primer valor en `corrections.from`, cita original,
texto fuente, autor, fecha, razón y todo el historial entre valores sucesivos.
**La cita original respalda el original; el valor corregido es una decisión del
revisor.** Nunca se etiqueta una corrección como dato original de esa cita.
Excluir conserva el registro. Estado, esquema y fuentes tienen hashes;
cambiar el parseado, aunque conserve el campo SHA del original, invalida la
revisión. Cada acción sube versión y enlaza hash anterior; salida existente no
se sobrescribe. La CLI registra una declaración del operador, no lo autentica.

Una fila totalmente conflictiva permanece revisable aunque aún no tenga valores
aceptados. Elegir un candidato conserva su cita; `keep_all` crea alternativas
marcadas y excluye el padre. No son ensayos independientes. Antes de retener
alternativas se resuelven los otros conflictos de esa fila, para evitar productos
cartesianos ambiguos. Excluir la fila resuelve sus conflictos por exclusión.

Una relación/hueco exige cita PDF literal encontrada y estudio ligado a
metadatos revisados. La declaración es literal, sin paráfrasis causal automática.
La presencia del texto no prueba su respaldo semántico: la acción del revisor
lo declara y queda auditada. Claims no se incorporan a distancias ni niveles.

## Verificación y límites

Siete pruebas estándar de CLI pasan: originales tras dos correcciones,
exclusión sin pérdida, fila totalmente conflictiva, alternativas trazables,
versiones/fuentes/citas falsas, tipos inválidos y afirmación PDF literal con
identidad revisada. Pruebas API con dobles verifican TTL, páginas, aislamiento,
prefijo y gating de upload; pruebas de despliegue comprueban11/12/14/15 rutas JWT.

Faltan persistencia autenticada de revisiones/records/conflicts/claims y sus
rutas, paginación/filtros, pantalla y el puente para publicar una revisión
corregida. El constructor T37 **todavía bloquea** valores distintos de la
extracción original; no usar esta CLI para saltarse esa comprobación. Falta
mostrar original/corregido en informe y claims junto a variables/PDF. La ruta de
originales ya pasó con CSV; falta PDF parseado y página real.
