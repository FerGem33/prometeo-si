#!/usr/bin/env bash
# Crea o reutiliza infraestructura T08; nunca borra ni reemplaza recursos.
set -euo pipefail
cd "$(dirname "$0")/.."
export AWS_PROFILE=prometeo AWS_PAGER=""
source infra/config.env
# Endpoint regional oficial; evita resolución virtual del bucket en redes con DNS intervenido.
export AWS_ENDPOINT_URL_S3="https://s3.${REGION}.amazonaws.com"
ACCOUNT=$(aws sts get-caller-identity --query Account --output text)
WEB_BUCKET="${PROJECT}-web-${ACCOUNT}"
OAC_NAME="${PROJECT}-web"
TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT
# list-buckets distingue ausencia de errores de autorización/conectividad.
FOUND=$(aws s3api list-buckets --query "Buckets[?Name=='${WEB_BUCKET}'].Name | [0]" --output text)
if [[ "$FOUND" == None ]]; then
  aws s3api create-bucket --bucket "$WEB_BUCKET" --region "$REGION"
fi
aws s3api put-public-access-block --bucket "$WEB_BUCKET" --public-access-block-configuration BlockPublicAcls=true,IgnorePublicAcls=true,BlockPublicPolicy=true,RestrictPublicBuckets=true
aws s3api put-bucket-ownership-controls --bucket "$WEB_BUCKET" --ownership-controls 'Rules=[{ObjectOwnership=BucketOwnerEnforced}]'
OAC_ID=$(aws cloudfront list-origin-access-controls --query "OriginAccessControlList.Items[?Name=='${OAC_NAME}'].Id | [0]" --output text)
if [[ "$OAC_ID" == None ]]; then
  OAC_ID=$(aws cloudfront create-origin-access-control --origin-access-control-config "Name=${OAC_NAME},Description=Prometeo web,SigningProtocol=sigv4,SigningBehavior=always,OriginAccessControlOriginType=s3" --query OriginAccessControl.Id --output text)
fi
ORIGIN="${WEB_BUCKET}.s3.${REGION}.amazonaws.com"
CF_ID=$(aws cloudfront list-distributions --query "DistributionList.Items[?Comment=='${PROJECT}-web'].Id | [0]" --output text)
if [[ "$CF_ID" == None ]]; then
  CACHE_ID=$(aws cloudfront list-cache-policies --type managed --query "CachePolicyList.Items[?CachePolicy.CachePolicyConfig.Name=='Managed-CachingOptimized'].CachePolicy.Id | [0]" --output text)
  [[ "$CACHE_ID" != None ]] || { echo 'No se encontró CachingOptimized' >&2; exit 1; }
  python3 -I - "$TMP/distribution.json" "$PROJECT" "$ORIGIN" "$OAC_ID" "$CACHE_ID" <<'PY'
import json,sys
path,project,origin,oac,cache=sys.argv[1:]
config={"CallerReference":project+"-web", "Comment":project+"-web", "Enabled":True,
 "DefaultRootObject":"index.html", "PriceClass":"PriceClass_100",
 "Origins":{"Quantity":1,"Items":[{"Id":"web","DomainName":origin,"OriginAccessControlId":oac,"S3OriginConfig":{"OriginAccessIdentity":""}}]},
 "DefaultCacheBehavior":{"TargetOriginId":"web","ViewerProtocolPolicy":"redirect-to-https","Compress":True,"CachePolicyId":cache,"TrustedSigners":{"Enabled":False,"Quantity":0},"AllowedMethods":{"Quantity":2,"Items":["GET","HEAD"],"CachedMethods":{"Quantity":2,"Items":["GET","HEAD"]}}},
 "ViewerCertificate":{"CloudFrontDefaultCertificate":True}}
with open(path,'w') as f: json.dump(config,f)
PY
  CF_ID=$(aws cloudfront create-distribution --distribution-config "file://$TMP/distribution.json" --query Distribution.Id --output text)
fi
# Antes de tocar la política, comprobar que la distribución recuperada es la nuestra.
ACTUAL_ORIGIN=$(aws cloudfront get-distribution --id "$CF_ID" --query 'Distribution.DistributionConfig.Origins.Items[0].DomainName' --output text)
[[ "$ACTUAL_ORIGIN" == "$ORIGIN" ]] || { echo 'Origen inesperado; revisión manual requerida' >&2; exit 1; }
CF_DOMAIN=$(aws cloudfront get-distribution --id "$CF_ID" --query Distribution.DomainName --output text)
CF_URL="https://${CF_DOMAIN}"
python3 -I - "$TMP/policy.json" "$WEB_BUCKET" "$ACCOUNT" "$CF_ID" <<'PY'
import json,sys
path,bucket,account,distribution=sys.argv[1:]
policy={"Version":"2012-10-17","Statement":[{"Sid":"CloudFrontReadOnly","Effect":"Allow","Principal":{"Service":"cloudfront.amazonaws.com"},"Action":"s3:GetObject","Resource":f"arn:aws:s3:::{bucket}/*","Condition":{"StringEquals":{"AWS:SourceArn":f"arn:aws:cloudfront::{account}:distribution/{distribution}"}}}]}
with open(path,'w') as f: json.dump(policy,f)
PY
aws s3api put-bucket-policy --bucket "$WEB_BUCKET" --policy "file://$TMP/policy.json"
# Preserva las salidas de API si ya existen; nunca guarda credenciales.
python3 -I - "$WEB_BUCKET" "$CF_ID" "$CF_URL" <<'PY'
from pathlib import Path
import sys
p=Path('infra/outputs.env')
keys=('WEB_BUCKET','CF_ID','CF_URL')
lines=p.read_text().splitlines() if p.exists() else ['# IDs y URLs públicos de infraestructura; sin credenciales.']
lines=[line for line in lines if not any(line.startswith('export '+key+'=') for key in keys)]
lines.extend(f'export {key}="{value}"' for key,value in zip(keys,sys.argv[1:]))
p.write_text('\n'.join(lines)+'\n')
PY
printf 'T08 infraestructura: %s (%s)\n' "$CF_URL" "$CF_ID"
