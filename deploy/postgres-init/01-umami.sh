#!/bin/sh
# SPEC-042: banco e usuário próprios do Umami, criados na primeira inicialização
# do volume do Postgres (o Umami cria as tabelas dele ao subir).
set -eu
psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" <<SQL
CREATE ROLE umami LOGIN PASSWORD '${UMAMI_DB_PASSWORD}';
CREATE DATABASE umami OWNER umami;
SQL
