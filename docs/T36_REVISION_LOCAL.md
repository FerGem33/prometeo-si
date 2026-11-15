# T36 — Correcciones auditables y originales (avance local)

Estado: **en curso**. CLI de revisión implementada y ruta de originales preparada
con pruebas locales. No se declara desplegada ni sustituye las APIs/pantallas
de registros, conflictos y relaciones que siguen pendientes.

## Original en página citada

`POST /projects/{id}/documents/{doc_id}/url` acepta `{}` o `{"page":n}`.
Autoriza primero el proyecto, después el documento y su prefijo exacto de S3.
No firma documentos ajenos, borrados o con subida incompleta. Devuelve URL GET
de300segundos; en PDF agrega `#page=n`. El fragmento indica al visor dónde abrir
el original completo, no genera otro PDF. La página exige conteo de páginas
parseado; fuera de rango o para CSV responde400; conteo aún ausente409.

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

Con esos tres flags se esperan15rutas JWT; sin schema/originals siguen11.
La lectura del original reutiliza `s3:GetObject` del prefijo raw ya acotado;
no amplía permisos a otros buckets. No guardar URLs firmadas en logs o Git.

## CLI de revisión de valores y conflictos

```bash
api/.venv/bin/python -I pipeline/review_records.py prepare \
  --corpus /tmp/prometeo-t37-local-t38/corpus.json \
  --approval /tmp/prometeo-t37-local-t38/approval.json \
  --extraction /tmp/prometeo-t37-local-t38/extraction.json \
  --metadata /tmp/prometeo-t37-local-t38/metadata.json \
  --output /tmp/prometeo-t36-review-v1.json
```

La ejecución real local preparó51registros y0conflictos. No aplicó ninguna
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
prefijo y gating de upload; pruebas de despliegue comprueban11/12/14/15rutas JWT.

Faltan persistencia autenticada de revisiones/records/conflicts/claims y sus
rutas, paginación/filtros, pantalla y el puente para publicar una revisión
corregida. El constructor T37 **todavía bloquea** valores distintos de la
extracción original; no usar esta CLI para saltarse esa comprobación. Falta
mostrar original/corregido en informe y claims junto a variables/PDF. La ruta de
originales requiere empaquetado/aplicación y comprobación real en AWS.
