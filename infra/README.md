# infra — scripts idempotentes de AWS CLI (región us-east-1, perfil `prometeo`, prefijo `prometeo-hack`).

## T08: alojamiento web

```bash
npm ci --prefix web
bash infra/10_web.sh
bash infra/deploy_web.sh
source infra/outputs.env
curl -sI "$CF_URL"
```

Los scripts fijan el perfil `prometeo` y cargan `config.env`. `10_web.sh`
reutiliza el bucket de la cuenta, el OAC por nombre y la distribución por
comentario; no crea otra distribución al repetirse. Guarda IDs y URL en
`outputs.env`, preservando otras salidas. S3 bloquea acceso público; solo
CloudFront puede leer objetos mediante OAC y una condición SourceArn.

El endpoint regional oficial S3 evita el fallo TLS observado con la resolución
del hostname virtual del bucket en esta red; nunca se desactiva TLS.
`deploy_web.sh` comprueba cuenta/bucket/origen, compila y publica, e invalida `/*`.
Por ahora conserva objetos antiguos: no usa `--delete` sin confirmación de
borrado; esta diferencia respecto al plan evita eliminar archivos remotos.

CloudFront puede quedar `InProgress` después de crear la distribución.
Consultar `aws cloudfront get-distribution --profile prometeo --id "$CF_ID"
--query Distribution.Status`. No dar T08 por hecha hasta obtener HTTP 200 y
abrir la página en un navegador. El despliegue no verifica la API ni Bedrock.

Verificaciones locales: `npm test --prefix web`, `npm run build --prefix web`,
`bash scripts/check_agnostic.sh`, `python3 -I pipeline/validate_pack.py`.
