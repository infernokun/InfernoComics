# Inferno Comics Recognition

[![Docker Image](https://img.shields.io/docker/v/infernokun/inferno-comics-recog?label=Docker%20Image)](https://hub.docker.com/r/infernokun/inferno-comics-recog)
[![Build Status](https://img.shields.io/github/actions/workflow/status/infernokun/inferno-comics-web/ci.yml?label=CI%20Build)](https://github.com/infernokun/inferno-comics-web/actions)

A modern REST application built with **Python**

> **Python Version**: 3.9

---

## Features

---

## Getting Started

### Prerequisites


## Development Setup

## Docker Compose
```yaml
services:
  inferno-comics-recog:
    image: infernokun/inferno-comics-recog:latest
    restart: always
    ports:
      - "8786:5000"
    environment:
      RECOGNITION_HOST: "${RECOGNITION_HOST:-0.0.0.0}"
      RECOGNITION_PORT: "${RECOGNITION_PORT:-5000}"
      FLASK_THREADS: "${FLASK_THREADS:-4}"
      CONFIG_PATH: "/var/tmp/inferno-comics/config.yml"
      COMIC_CACHE_DB_PATH: "/var/tmp/inferno-comics/comic_cache.db"
      COMIC_CACHE_IMAGE_PATH: "/var/tmp/inferno-comics/image_cache"
      REST_API: "http://inferno-comics-rest:8080/inferno-comics-rest/api"
      FLASK_ENV: "production"
      PERFORMANCE_LEVEL: "akaze_focused"
    volumes:
      - inferno-comics-recog:/var/tmp/inferno-comics
    networks:
      - inferno-comics-network

volumes:
  inferno-comics-db:
    driver: local

networks:
  inferno-comics-network:
```