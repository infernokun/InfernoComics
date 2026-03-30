# Inferno Comics Web

[![Docker Image](https://img.shields.io/docker/v/infernokun/inferno-comics-web?label=Docker%20Image)](https://hub.docker.com/r/infernokun/inferno-comics-web)
[![Build Status](https://img.shields.io/github/actions/workflow/status/infernokun/inferno-comics-web/ci.yml?label=CI%20Build)](https://github.com/infernokun/inferno-comics-web/actions)

A modern web application built with **Angular** to discover, track, and explore your comic book universe.

> **Angular Version**: 21 
> **Base URL**: http://inferno-comics-web  
> **REST API Endpoint**: `/api`

---

## Features

### Collection Management
- Add, edit, and delete comic series and individual issues
- Track owned vs. available issues per series with progress indicators
- Record issue condition (Mint → Poor), purchase price, current value, and purchase date
- Mark issues as key issues or variants
- Track reading progress (read/unread) per issue
- Mark favorite series with local storage persistence

### Metadata & Comic Vine Integration
- Search and link series/issues to [Comic Vine](https://comicvine.gamespot.com/) for automated metadata
- Support multiple Comic Vine IDs per series
- Track GCD (Grand Comics Database) IDs
- Reverify or regenerate metadata from Comic Vine at any time
- AI-generated series/issue descriptions

### Image Recognition & Bulk Import
- Drag-and-drop image upload to bulk-add comics via AI-powered recognition
- Real-time processing progress via Server-Sent Events (SSE)
- View, replay, and manage processing sessions and history

### Missing Issues & Releases
- Identify gaps in your collection (issues you don't yet own)
- Browse upcoming and recent releases with configurable lookback (1–12 months)
- See which releases you already own
- Ignore series you're not collecting

### Analytics & Stats
- Dashboard overview: total series, issues, publishers, completion rate
- Publisher breakdown with donut charts
- Collection growth timeline (area chart)
- Value analysis: total purchase vs. current value, profit/loss
- Series completion metrics and gauge charts
- Condition distribution and read/unread breakdowns
- File processing and sync health statistics

### UI & Experience
- Grid and list view modes with persistence
- Sorting, filtering, and pagination across series and issues lists
- Dark/light theme toggle
- Advanced data tables powered by AG Grid
- Skeleton loading placeholders and animated transitions
- Toast notifications and confirmation dialogs
- Responsive design with Angular Material components

---

## Architecture

The application consists of:
- **Frontend**: Angular 21 with TypeScript and SCSS
- **UI Components**: Angular Material + AG Grid for data tables
- **Charts**: ApexCharts (via ng-apexcharts)
- **State Management**: NgRx Store with RxJS Observables and Angular Signals
- **Data Management**: REST API with Comic Vine integration
- **Real-time Updates**: Server-Sent Events (SSE) for image processing progress
- **Deployment**: Containerized with Docker and Nginx

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