# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Inferno Comics is a full-stack web application for discovering, tracking, and organizing comic book collections. It consists of three microservices:

- **inferno-comics-web**: Angular 21 frontend (TypeScript/SCSS)
- **inferno-comics-rest**: Spring Boot 3.5 REST API (Java 25)
- **inferno-comics-recog**: Flask-based image recognition service (Python 3.9+)

All services are containerized with Docker and orchestrated via Docker Compose.

## Build & Development Commands

### Frontend (inferno-comics-web)
```bash
cd inferno-comics-web
pnpm install                  # Install dependencies
pnpm start                    # Dev server at http://localhost:4300
pnpm build                    # Build
pnpm build:prod               # Production build
pnpm test                     # Run Karma tests
```

### Backend (inferno-comics-rest)
```bash
cd inferno-comics-rest
./gradlew bootRun             # Start dev server at http://localhost:8080
./gradlew build --no-daemon -x test   # Build (skip tests)
./gradlew test                # Run tests
```

### Recognition Service (inferno-comics-recog)
```bash
cd inferno-comics-recog
npm run dev:setup             # Setup pyenv and venv (first time)
source venv/bin/activate      # Activate venv
npm run deps:install          # Install Python dependencies
npm run start                 # Start Flask server at http://localhost:5000
npm run lint                  # flake8 linting
npm run format                # black formatting
npm run test                  # pytest
```

### Docker
```bash
docker-compose up -d          # Start all services
# Ports: web=8784, rest=8785, recog=8786, db=5432, redis=6379
```

## Architecture

```
Browser → Angular Frontend (4300/8784)
              ↓ REST API calls
         Spring Boot API (8080/8785)
              ↓
    PostgreSQL + Redis Cache
              ↓
         External Services:
         - ComicVine API (metadata)
         - Groq AI (descriptions)
         - Nextcloud (file sync)
         - Recognition Service (image matching)
```

### Frontend Structure (inferno-comics-web/src/app/)
- `components/` - UI components organized by feature (dashboard, issues, series, config, common)
- `services/` - API integration layer (12+ services for comics, series, auth, etc.)
- `models/` - TypeScript interfaces
- `utils/` - Utilities and animations

### Backend Structure (inferno-comics-rest/src/main/java/com/infernokun/infernoComics/)
- `controllers/` - REST API endpoints
- `services/` - Business logic
- `repositories/` - JPA data access
- `models/` - Entities and DTOs
- `clients/` - External API integrations (ComicVine, Nextcloud, Recognition)
- `config/` - Spring configuration

### Recognition Service Structure (inferno-comics-recog/src/)
- `routes/` - Flask API endpoints (config, evaluation, health, image_matcher)
- `models/` - CV2 feature matching with AKAZE detector
- `services/` - Business logic
- `config/` - Configuration management

## Key Technologies

- **Frontend**: Angular 21, NGRX, AG Grid, Angular Material, RxJS
- **Backend**: Spring Boot 3.5, JPA/Hibernate, Redis, WebSocket/SSE
- **Recognition**: Flask, OpenCV (AKAZE feature matching), SQLite cache
- **Infrastructure**: Docker, PostgreSQL 17.4, Redis

## Environment Variables

Key variables for local development (see docker-compose.yml for full list):
- `COMIC_VINE_API_KEY` - ComicVine API access
- `GROQ_API_KEY` - AI description generation
- `POSTGRES_*` - Database credentials
- `NEXTCLOUD_*` - File sync configuration
