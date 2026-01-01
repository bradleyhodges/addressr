#!/usr/bin/env bash
set -euo pipefail

: "${ELASTIC_HOST:=localhost}"
: "${ELASTIC_PORT:=9200}"

echo "OpenSearch: $ELASTIC_HOST:$ELASTIC_PORT"
curl -fsS "http://${ELASTIC_HOST}:${ELASTIC_PORT}/" >/dev/null

echo "API health:"
curl -fsS "http://localhost:8080/health" >/dev/null || true

echo "OK"
