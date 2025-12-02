# Inferno Comics Rest

[![Docker Image](https://img.shields.io/docker/v/infernokun/inferno-comics-rest?label=Docker%20Image)](https://hub.docker.com/r/infernokun/inferno-comics-rest)
[![Build Status](https://img.shields.io/github/actions/workflow/status/infernokun/inferno-comics-web/ci.yml?label=CI%20Build)](https://github.com/infernokun/inferno-comics-web/actions)

A modern REST application built with **Java**

> **Java Version**: 25

---

## Features

---

## Getting Started

### Prerequisites


## Development Setup

## Docker Compose
```yaml
services:
  inferno-comics-db:
    image: postgres:17.4
    restart: always
    environment:
      POSTGRES_USER: "${POSTGRES_USER:-inferno-comics}"
      POSTGRES_PASSWORD: "${POSTGRES_PASSWORD:-inferno-comics}"
      POSTGRES_DB: "${POSTGRES_DB:-inferno-comics}"
    volumes:
      - inferno-comics-db:/var/lib/postgresql/data
    networks:
      - inferno-comics-network
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U ${POSTGRES_USER:-inferno-comics}"]
      interval: 10s
      timeout: 5s
      retries: 5

  inferno-comics-rest:
    image: infernokun/inferno-comics-rest:latest
    #build: ./inferno-comics-rest
    restart: always
    ports:
      - "8785:8080"
    environment:
      DOCKER_COMPOSE_PATH: "${DOCKER_COMPOSE_PATH:-/var/tmp/inferno-comics}"
      DB_IP: "${POSTGRES_IP:-inferno-comics-db}"
      DB_NAME: "${POSTGRES_DB:-inferno-comics}"
      DB_USER: "${POSTGRES_USER:-inferno-comics}"
      DB_PASS: "${POSTGRES_PASSWORD:-inferno-comics}"
      DB_PORT: "${DB_PORT:-5432}"
      ENCRYPTION_KEY: "${ENCRYPTION_KEY:-secret_key}"
      RSA_PRIVATE_KEY_PATH: "${RSA_PRIVATE_KEY_PATH:-/var/tmp/inferno-comics/private.pem}"
      RSA_PUBLIC_KEY_PATH: "${RSA_PUBLIC_KEY_PATH:-/var/tmp/inferno-comics/public.pem}"
      REDIS_HOST: "${REDIS_HOST:-inferno-comics-redis}"
      REDIS_PORT: "${REDIS_PORT:-6379}"
      COMIC_VINE_API_KEY: "${COMIC_VINE_API_KEY}"
      GROQ_API_KEY: "${GROQ_API_KEY}"
      DESCRIPTION_GENERATION: "${DESCRIPTION_GENERATION:-false}"
      RECOGNITION_SERVER_HOST: "${RECOGNITION_SERVER_HOST:-inferno-comics-recog}"
      RECOGNITION_SERVER_PORT: "${RECOGNITION_SERVER_PORT:-5000}"
      NEXTCLOUD_FOLDER_LOCATION: "${NEXTCLOUD_FOLDER_LOCATION:-/Photos/Comics/}"
      NEXTCLOUD_URL: "${NEXTCLOUD_URL}"
      NEXTCLOUD_USERNAME: "${NEXTCLOUD_USERNAME}"
      NEXTCLOUD_PASSWORD: "${NEXTCLOUD_PASSWORD}"
    volumes:
      - /var/tmp/inferno-comics:/var/tmp/inferno-comics
    networks:
      - inferno-comics-network
    depends_on:
      inferno-comics-redis:
        condition: service_healthy
      inferno-comics-db:
        condition: service_healthy

volumes:
  inferno-comics-db:
    driver: local

networks:
  inferno-comics-network:
```