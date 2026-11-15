# T37 — Publicación local versionada y segundo dominio

Estado: fundamento local probado; **T37 sigue en curso**, sin publicación AWS,
síntesis ni conexión de pantallas. El lote completo de 23 documentos no se da
por aceptado por la prueba acotada siguiente.

## Aprobación delegada concreta

Versión 1 de `t37/revision_local.json`: revisión conservadora de las tablas
PSI-46 (CVB) y PSI-87 (PBE). Autoridad:

> Aprobado por delegación del dueño (15-nov); recomendación del agente, sin revisión humana línea por línea

La configuración enumera las columnas aprobadas/rechazadas, sus unidades,
clasificación de filas, escalas sigma y las exclusiones del alcance. No es una
certificación científica. Se conservan potencia W y flujo de calor W/cm² como
variables distintas; subenfriamiento y sobrecalentamiento son diferencias de
temperatura, sin offset de temperatura absoluta. No se agregan presiones ni
condiciones PDF a tablas. Los sigma son criterios de esta lente, no errores de
medición ni límites físicos. Una corrida y un documento no equivalen a un
estudio independiente: todas las corridas PBE se agrupan como PSI-87.

Los originales deben coincidir con el manifiesto versionado. La aprobación
local generada contiene hashes del esquema, metadatos, configuración y fuentes.
Editar cualquiera invalida su uso; se debe revisar otra versión. El flag de
aplicación explícita ejecuta esta decisión delegada concreta, no acepta un
estado devuelto por un modelo. Por defecto solo se prepara una solicitud de
revisión. La decisión es reversible editando/versionando la configuración y
regenerando otro borrador; no altera la demo.

## Reproducir

Con Python 3.12 y el corpus descargado (fuera de Git):

```bash
api/.venv/bin/python -I pipeline/test_publish_bundle.py
api/.venv/bin/python -I pipeline/prepare_boiling_local.py \
  --corpus tools/psi/data/dominio_ebullicion/lote \
  --output /tmp/prometeo-t37-local-v1 \
  --apply-delegated-approval
api/.venv/bin/python -I pipeline/validate_pack.py /tmp/prometeo-t37-local-v1/bundle
PROMETEO_PUBLICATION_PATH=/tmp/prometeo-t37-local-v1/bundle npm test --prefix web -- src/engine/publication.test.ts
```

Usar una carpeta nueva: las salidas existentes no se sobrescriben. Para otro
corpus, la CLI general recibe artefactos intermedios y metadatos revisados:

```bash
api/.venv/bin/python -I pipeline/publish_bundle.py \
  --approval /tmp/prometeo-t37-local-v1/approval.json \
  --corpus /tmp/prometeo-t37-local-v1/corpus.json \
  --extraction /tmp/prometeo-t37-local-v1/extraction.json \
  --metadata /tmp/prometeo-t37-local-v1/metadata.json \
  --pack-version 1 --lens-version 1 --output /tmp/prometeo-t37-bundle-copy
```

El constructor exige aprobación del esquema y otra aprobación de metadatos
ligada a sus hashes. Recalcula la extracción tabular desde originales para
detectar valores alterados: copiar un hash de esquema no basta. Exige DOI,
estudio, justificación y cita de tipo de registro, sigma positivo y presets
cuyos valores estén en su registro citado. Un conflicto abierto impide generar
el bundle. Los rechazos permanecen en el recibo. Las licencias de los originales
son desconocidas; no se hereda una licencia global de NASA o de otro pack.

## Resultado real local (15-nov)

- Dos fuentes comprobadas por SHA-256 contra el manifiesto: PSI-46, seis
  registros; PSI-87, 45 registros. Total **51 registros, dos estudios**.
- Ocho variables: dos categóricas y seis numéricas. Cero conversiones numéricas;
  solo normalización de escritura de unidades conservando la cabecera original.
- **Cinco celdas rechazadas**, todas `ambiguous numeric cell`: PSI-46 fila2
  bubble_length; PSI-87 filas19 y40 nucleation_delay/surface_superheat. Los valores
  ausentes no se rellenan; los demás valores de esas filas sí conservan su cita.
- Cero conflictos; cero llamadas Bedrock; cero tokens/coste de modelo en esta
  prueba. Los datos, citas y artefactos extraídos quedan solo en `/tmp`.
- Cuatro pruebas unitarias del constructor pasan. `validate_pack` pasa con
  2 estudios/51 registros/2 fuentes. Vitest ejecuta el motor existente con ese
  bundle y pasa ranking, población, niveles y referencias de hallazgos.
  `check_agnostic` pasa; no se cambió código de cálculo del motor.

## Qué queda para cerrar T37

Integrar publicación autenticada (`publish`, `pack`), versiones en servidor,
regeneración de lente al cambiar intención, propuestas guardadas y síntesis
verificada. Revisar las demás fuentes del lote (unidades, prosa, duplicados,
simulación/propiedades y PDF) y medir la ejecución real de T34. Conectar la
selección del pack de proyecto en la interfaz. El constructor local no demuestra
ninguno de esos pasos ni cierra la aceptación de T35/T37.
