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