# API · T09

Lambda Python 3.12, HTTP API payload v2; entrypoint `handler.handler`.
El modelo viene de MODEL_ID. SDK oficial `AnthropicBedrock`, versión 0.75.0
fijada por compatibilidad del protocolo Bedrock con Haiku 4.5.
Referencia: https://github.com/anthropics/anthropic-sdk-python/tree/v0.75.0

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

Verificado 2026-11-14: 26 tests, /ask y /analysis por SDK real responden 200;
analysis devuelve mode=ai y el hecho 0/268 con fuentes PSI reales. Esta prueba
local todavía no verifica Lambda/API Gateway ni la UI desplegada.
