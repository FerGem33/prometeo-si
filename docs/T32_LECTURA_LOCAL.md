# T32 — Primera etapa local: lectura y citas

2026-11-15. Registro histórico de la primera laptop: este resultado no mide extracción con Bedrock.

**Continuación en laptop AWS:** [T32_EVALUACION.md](T32_EVALUACION.md) contiene las llamadas reales,
la aprobación/extracción local y los pendientes actuales. Las rutas y limitaciones de acceso
que siguen describen la primera sesión, no el estado de la laptop AWS.

Comando sobre la descarga local, sin versionar fuentes ni texto extraído:

```bash
python3 -I pipeline/ingest.py pipeline/tools/datos_psi --output /tmp/prometeo-t32/parsed.json
```

Resultado: 80 archivos CSV/PDF encontrados, 75 leídos (30 CSV y 45 PDF únicos),
3 fallidos sin texto extraíble, 2 duplicados. Los 30 CSV incluyen tablas de otras áreas
y archivos auxiliares: **no son el conjunto de evaluación de 22 tablas de combustión**.

PDF sin texto extraíble:
- `PSI-23_Presentations_20120015928.pdf`
- `PSI-23_Presentations_PS-01374 ACME posterFinal.pdf`
- `PSI-23_Presentations_PS-03403 ACME on the ISS.pdf`

Duplicados por SHA-256:
- `PSI-26_Presentations_Crew Training 2010.pdf`
- `PSI-26_Presentations_Crew Training 2011.pdf`

Se tomó una celda no vacía o un fragmento de página de cada documento leído:
75/75 citas encontradas en su ubicación. Es una prueba de consistencia del parser/verificador,
**no una medida de precisión del modelo**. Pruebas automatizadas separadas rechazan citas
inventadas, valores modificados, páginas/filas/columnas erróneas y marcas `verified` falsificadas.

Validación: 7 pruebas unitarias pasan con Python 3.14.4; pendiente repetir con Python 3.12.
Poppler está instalado en esta laptop. No se invocó Bedrock ni se desplegaron recursos.

Siguiente tramo: perfilar documentos, proponer un esquema validado y extraer contra un esquema
aprobado. Medir las 22 tablas contra el mapping revisado (D7) y seleccionar 5 PDF BASS-II/FLEX.
Verificar texto y soporte del valor por separado; reportar rechazos sin publicar valores no revisados.

## Continuación: perfilado y validación de propuestas

- 27 tablas de `pipeline/tools/datos_psi/tablas` perfiladas sin fallos (incluyen 5 ajenas
  al conjunto de combustión). BASS-II: 129 filas, 17 columnas; petición preparada sin AWS.
- `api/ingest_propose.py` prepara o invoca una propuesta por documento. PDF exige páginas
  explícitas. La respuesta cruda pasa después por `pipeline/ingest.py --proposal-response`.
- Validación estricta: campos, IDs, referencias, cobertura de columnas, conversiones finitas,
  citas verificadas por ubicación; nunca acepta aprobación del modelo.
- 13 pruebas locales pasan (10 pipeline, 3 adaptador); pack y chequeo agnóstico pasan.
- No hay perfil `prometeo` (solo `default` y `road2tech`) ni SDK Anthropic instalado aquí.
  No se usaron otras cuentas ni se hicieron llamadas reales; la precisión sigue sin medir.
- Sigue pendiente: revisión/aprobación persistente, extracción, fusión entre documentos,
  constantes con alcance y evidencia, evaluación real de 22 tablas y 5 PDF con D7.
