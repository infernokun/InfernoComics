# Inferno Comics Recognition

[![Recog Image](https://img.shields.io/docker/v/infernokun/inferno-comics-recog?label=Recog%20Image)](https://hub.docker.com/r/infernokun/inferno-comics-recog)
[![Build Status](https://img.shields.io/github/actions/workflow/status/infernokun/inferno-comics-recog/ci.yml?label=CI%20Build)](https://github.com/infernokun/inferno-comics-recog/actions)

---

## Features

- **Comic Book Image Recognition**
    - Advanced feature matching for comic book detection
    - Multi-detector support for enhanced accuracy
    - Image preprocessing and enhancement capabilities

- **Database Integration**
    - SQLite database for storing image features and metadata
    - Caching mechanisms for improved performance
    - Efficient database management and cleanup

- **Configuration Management**
    - Flexible configuration system with presets
    - Performance level adjustments
    - Customizable similarity thresholds

- **REST API Endpoints**
    - Image matching operations
    - Evaluation and testing capabilities
    - Health and system monitoring

- **Performance Optimization**
    - Memory and disk caching
    - Async processing capabilities
    - Stress testing and performance comparison

---

## Architecture

The recognition service follows a modular architecture:

- **Core Models**: Feature extraction and matching algorithms
- **Configuration**: Flexible config management system
- **Services**: Business logic for image matching operations
- **Routes**: REST API endpoint handlers
- **Utilities**: Helper functions and utilities

---

## API Endpoints

### Image Matching
- **POST /image-matcher**: Process single or multiple comic images
- **GET /image-matcher/{session_id}**: Retrieve matching results
- **GET /image-matcher/progress/{session_id}**: Monitor processing progress

### Evaluation
- **POST /evaluation**: Run evaluation processes
- **GET /evaluation/{session_id}**: Get evaluation results
- **GET /evaluation/list**: List all evaluations

### Configuration
- **GET /config**: Retrieve current configuration
- **PUT /config**: Update configuration settings

### Health & Metrics
- **GET /health**: Basic health check
- **GET /health/detailed**: Detailed system information
- **GET /metrics**: System resource usage metrics

---

## Getting Started

### Prerequisites
- Python 3.8+
- Required dependencies listed in requirements.txt

### Setup Instructions

1. Clone the repository
2. Install dependencies: `pip install -r requirements.txt`
3. Configure environment variables as needed
4. Run the application: `python src/recog.py`

---

## Development Setup

```bash
# Clone and navigate to project
git clone https://github.com/infernokun/inferno-comics-recog.git
cd inferno-comics-recog

# Create virtual environment
python -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate

# Install dependencies
pip install -r requirements.txt

# Run the application
python src/recog.py
```

## Configuration

The application uses a flexible configuration system with:
- Default configuration file handling
- Custom preset creation
- Runtime configuration adjustments

---

## Project Structure

- `src/` - Main source code directory
  - `config/` - Configuration management classes
  - `models/` - Core recognition models and matching algorithms  
  - `routes/` - REST API endpoint handlers
  - `services/` - Business logic services
  - `util/` - Utility functions and helpers
- `requirements.txt` - Python dependencies
- `Dockerfile` - Containerization configuration
- `scripts/` - Deployment and utility scripts

---

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