# Inferno Comics Web

[![Docker Image](https://img.shields.io/docker/v/infernokun/inferno-comics-web?label=Docker%20Image)](https://hub.docker.com/r/infernokun/inferno-comics-web)
[![Build Status](https://img.shields.io/github/actions/workflow/status/infernokun/inferno-comics-web/ci.yml?label=CI%20Build)](https://github.com/infernokun/inferno-comics-web/actions)

A modern web application built with **Angular** to discover, track, and explore your comic book universe.

> **Angular Version**: 21 
> **Base URL**: http://inferno-comics-web  
> **REST API Endpoint**: `/api`

---

## Features

- Browse and search comic book series
- Track progress through ongoing series
- Publisher breakdown and filtering
- Responsive UI using Angular Material
- Integrated with AG Grid for data tables
- Docker-ready deployment
- Real-time updates via WebSocket integration

---

## Architecture

The application consists of:
- **Frontend**: Angular 21 with TypeScript and SCSS
- **UI Components**: Built with Angular Material
- **Data Management**: Through REST API endpoints
- **State Management**: Using RxJS Observables and services
- **Deployment**: Containerized with Docker support

---

## Getting Started

### Prerequisites

Ensure you have the following installed:
- Node.js (v18+ recommended)
- Angular CLI (`pnpm install -g @angular/cli`)
- Docker (optional, for containerized deployments)

---

## Development Setup

```bash
# Install dependencies
pnpm install

# Start the development server
ng serve

# Navigate to http://localhost:4200/
```

## Docker Compose
```yaml
services:
  inferno-comics-web:
    image: infernokun/inferno-comics-web:latest
    restart: always
    environment:
      - BASE_URL=http://localhost:4200
      - API_URL=http://localhost:8080/inferno-comics-rest/api
    ports:
      - "4200:4200"
```

## Project Structure

- `src/app/components/` - Reusable UI components
- `src/app/models/` - Data models and interfaces
- `src/app/services/` - API service layer
- `src/app/utils/` - Utility functions and animations
- `src/assets/` - Static assets and configuration files
- `src/styles/` - Global styles and themes

---

## Build Process

The application uses Nx for build orchestration and supports:
- Development builds
- Production builds with optimization
- Testing configurations
- Continuous integration workflows

---

## Deployment

The application is configured for Docker deployment with:
- Multi-stage Docker builds
- Environment-specific configurations
- Nginx reverse proxy setup
- CORS handling for API communication