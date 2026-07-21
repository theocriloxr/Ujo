#!/usr/bin/env bash
set -euo pipefail
CERT_DIR="${1:-deployment/mosquitto/certs}"
HOSTNAME_VALUE="${UJO_HUB_HOSTNAME:-ujo-home.local}"
IP_VALUE="${UJO_HUB_IP:-127.0.0.1}"
mkdir -p "$CERT_DIR"
umask 077
openssl req -x509 -newkey rsa:3072 -sha256 -days 3650 -nodes \
  -keyout "$CERT_DIR/ca.key" -out "$CERT_DIR/ca.crt" -subj "/CN=Ujo Home MQTT CA"
cat >"$CERT_DIR/server.cnf" <<CONF
[req]
distinguished_name=req_dn
req_extensions=req_ext
prompt=no
[req_dn]
CN=$HOSTNAME_VALUE
[req_ext]
subjectAltName=@alt_names
[alt_names]
DNS.1=$HOSTNAME_VALUE
DNS.2=localhost
IP.1=$IP_VALUE
IP.2=127.0.0.1
CONF
openssl req -new -newkey rsa:3072 -nodes -keyout "$CERT_DIR/server.key" -out "$CERT_DIR/server.csr" -config "$CERT_DIR/server.cnf"
openssl x509 -req -in "$CERT_DIR/server.csr" -CA "$CERT_DIR/ca.crt" -CAkey "$CERT_DIR/ca.key" -CAcreateserial \
  -out "$CERT_DIR/server.crt" -days 825 -sha256 -extensions req_ext -extfile "$CERT_DIR/server.cnf"
chmod 600 "$CERT_DIR"/*.key
chmod 644 "$CERT_DIR"/*.crt
rm -f "$CERT_DIR/server.csr" "$CERT_DIR/ca.srl"
echo "Generated MQTT CA and server certificate for $HOSTNAME_VALUE ($IP_VALUE)."
