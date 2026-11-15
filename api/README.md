# API · T09

Lambda Python 3.12, HTTP API payload v2; entrypoint `handler.handler`.
El modelo viene de `MODEL_ID` en `infra/config.env`; esta cuenta todavía opera
con `us.anthropic.claude-haiku-4-5-20251001-v1:0`. Haiku 5.5 figura activo en
Bedrock, pero la invocación real fue denegada para esta cuenta (HTTP 403).
SDK oficial `AnthropicBedrock`, versión 2.8.0, para el Messages API de Bedrock.
Referencia: https://github.com/anthropics/anthropic-sdk-python/tree/v2.8.0

## Contratos

- POST /ask: `{question, schema}`. El schema debe coincidir con el pack desplegado
  (se admiten categorías enriquecidas). Retorna `{values, active, filters:{}}`
  validado en unidades canónicas, o `{unsupported: string}`. Filtros no vacíos
  se rechazan: el motor actual no tiene ese contrato. No se aceptan categorías
  inventadas aunque estén en preguntas sugeridas (por ejemplo Cotton).
- POST /analysis: `{scenario, levels, findings}` del motor. Retorna
  `{mode:"ai"|"template", sentences:[{finding,text,sources}], dropped}`.
  Los textos se restringen a frases verificables de seis códigos: never_measured,
  above_tested, below_tested, within_tested, category_tested y full_coverage.
  Se cotejan parámetros usados y fuentes contra los registros comparables del
  pack; no basta con que el ID citado exista. Los demás códigos se omiten.
  El modelo selecciona frases permitidas; el verificador exige coincidencia
  exacta para impedir cambios de sentido con números reales. Esto recorta la
  libertad de redacción, no la evidencia. No calcula ni altera niveles/ranking.
  Si falla Bedrock o se descarta más de la mitad, mode=template explícito.
- Límites: cuerpo 128 KB, pregunta 2000 caracteres, 50 hallazgos, 1200 tokens,
  timeout SDK 15 s sin retries. No se registran prompts ni errores del proveedor.
- CORS: solo CF_URL; no es autenticación. T10 debe limitar frecuencia en Gateway.

## Desarrollo y verificación

```bash
python3.12 -m venv api/.venv
api/.venv/bin/python -m pip install -r api/requirements-dev.txt
api/.venv/bin/python -m pytest api/ -q
export AWS_PROFILE=prometeo
source infra/config.env
api/.venv/bin/python -m api.smoke
```

`smoke` hace llamadas reales facturables; pytest usa dobles y el pack real.
`botocore[crt]` es necesario localmente con aws login; Lambda usa su rol.
Los archivos events/*.json contienen cuerpos de petición para smoke y curl.
El despliegue debe incluir `pack.json` desde web/public/demo/pack.json junto con
handler.py, verify.py y las dependencias para Linux; no copiar el venv de macOS.
Mantener el pack de API sincronizado con el de web cuando cambien datos/esquema.

La verificación local de /ask y /analysis usa `api/smoke.py`; las llamadas son
reales y facturables. La validación desplegada se registra en `PROGRESS.md`.

## Cambios de la fase 2

Contrato completo en `docs/CONTRATOS_FASE2.md` §4.

- `/ask`: el modelo devuelve `{"conditions":[{"variable","value","unit"}]}` y el código convierte unidades con
  `display_units` del esquema (psi, kPa). Los elementos inválidos se descartan; si no queda ninguno, `unsupported`.
  `502` solo cuando falla la llamada al modelo. Petición con `"version": 2` → la respuesta incluye `notes`.
  Sin `version` la respuesta es idéntica a la anterior.
- `/analysis`: oración para `tested_elsewhere`; `above_tested` y `below_tested` incluyen el valor extremo; ambos se
  cotejan contra el pack. `api/events/analysis_lunar.json` es la petición real del preset lunar.
- 38 pruebas. No se ha probado contra Bedrock desde esta laptop (sin perfil `prometeo`).
