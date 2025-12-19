# Inferno Comics REST API

[![Docker Image](https://img.shields.io/docker/v/infernokun/inferno-comics-rest?label=Docker%20Image)](https://hub.docker.com/r/infernokun/inferno-comics-rest)
[![Build Status](https://img.shields.io/github/actions/workflow/status/infernokun/inferno-comics-web/ci.yml?label=CI%20Build)](https://github.com/infernokun/inferno-comics-web/actions)

A robust REST API backend built with Spring Boot 3.x to manage and organize comic book collections.

> **Java Version**: 25
> **Spring Boot Version**: 3.x
> **Base URL**: `/api`

---

## Features

- **Comic Book Management**
    - Series and issue tracking
    - Metadata synchronization with ComicVine
    - Comprehensive comic data storage

- **File Processing**
    - Nextcloud integration for file synchronization
    - Image processing and recognition
    - Batch processing capabilities

- **Real-time Communication**
    - WebSocket support for live updates
    - Server-Sent Events for progress tracking
    - Session management

- **Performance Optimization**
    - Redis caching layer
    - Asynchronous processing
    - Database optimization

---

## Architecture

The application follows a layered architecture:

- **Controller Layer**: REST endpoints and API handlers
- **Service Layer**: Business logic and orchestration
- **Repository Layer**: Data access with JPA repositories
- **Integration Layer**: External API clients (ComicVine, Nextcloud, etc.)
- **Utility Layer**: Helper classes and utilities

---

## API Endpoints

### Core Resources
- **Series**: Manage comic book series
- **Issues**: Handle individual comic issues
- **Descriptions**: Generate and manage descriptions
- **Progress**: Track processing progress
- **Recognition**: Image recognition and processing

### Management Endpoints
- Cache management and clearing
- System health checks
- Configuration management
- Version information

---

## Technology Stack

- **Backend Framework**: Spring Boot 3.x
- **Language**: Java 25
- **Database**: PostgreSQL (via JPA/Hibernate)
- **Caching**: Redis
- **API Documentation**: OpenAPI/Swagger
- **Real-time**: WebSocket, Server-Sent Events
- **External Services**: ComicVine, Nextcloud, AI APIs

---

## Getting Started

### Prerequisites
- Java 25+
- PostgreSQL database
- Redis server
- Docker (optional, for containerized deployments)

### Setup Instructions

1. Clone the repository
2. Configure database connection in `application.yml`
3. Set up Redis connection
4. Configure external API keys (ComicVine, etc.)
5. Run with `./gradlew bootRun`

---

## Development Setup

```bash
# Clone and navigate to project
git clone https://github.com/infernokun/inferno-comics-rest.git
cd inferno-comics-rest

# Build the project
./gradlew build

# Run the application
./gradlew bootRun

# Run tests
./gradlew test
```

## Configuration

The application uses Spring Boot configuration with:
- `application.yml` for main settings
- `application-local.yml` for local development
- Environment variables for sensitive data

---

## Project Structure

- `src/main/java/com/infernokun/infernoComics/` - Main application packages
- `controllers/` - REST endpoint controllers
- `services/` - Business logic implementations
- `repositories/` - Data access objects
- `models/` - Data transfer objects and entities
- `clients/` - External API clients
- `config/` - Application configuration classes
- `utils/` - Utility classes and helpers
- `logger/` - Custom logging implementation