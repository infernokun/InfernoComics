# syntax=docker/dockerfile:1.4.2
# Stage 1: Build dependencies
FROM python:3.13.5-slim-bullseye AS build-stage
WORKDIR /app/

# Install system dependencies for OpenCV and other packages
RUN apt-get update && apt-get install -y \
    build-essential \
    libglib2.0-0 \
    libsm6 \
    libxext6 \
    libxrender-dev \
    libgomp1 \
    libglib2.0-0 \
    libgtk-3-0 \
    libavcodec-dev \
    libavformat-dev \
    libswscale-dev \
    && apt-get clean && rm -rf /var/lib/apt/lists/*

# Copy requirements and install Python dependencies
COPY --link src/requirements.txt /app/requirements.txt
RUN pip install --no-cache-dir --user -r requirements.txt

# Stage 2: Runtime
FROM python:3.13.5-slim-bullseye AS runtime-stage
LABEL maintainer="infernokun@infernokun.com" \
      description="Python Flask service Docker image" \
      source="https://github.com/infernokun/InfernoComics" \
      run="docker run -p 5000:5000 <docker image> -d"

VOLUME ["/data/certs"]

ENV COMIC_CACHE_DB_PATH=/var/tmp/inferno-comics/comic_cache.db
ENV COMIC_CACHE_IMAGE_PATH=/var/tmp/inferno-comics/image_cache

# Install runtime dependencies and tini
RUN apt-get update && apt-get install -y \
    tini \
    curl \
    bash \
    libglib2.0-0 \
    libsm6 \
    libxext6 \
    libxrender-dev \
    libgomp1 \
    libgtk-3-0 \
    libavcodec-dev \
    libavformat-dev \
    libswscale-dev \
    && apt-get clean && rm -rf /var/lib/apt/lists/*

# Create python user
RUN set -eux; \
    groupadd -g 1000 python; \
    useradd -m -r -u 1000 -g python python; \
    mkdir -p /app; \
    chown python:python -R /app /home/python

# Copy Python packages from build stage
COPY --from=build-stage --chown=python:python /root/.local /home/python/.local

# Copy application code
COPY --link --chown=python:python . /app/

# Set environment variables
ENV FLASK_APP=app.py
ENV FLASK_ENV=production
ENV PYTHONPATH=/app
ENV PATH=/home/python/.local/bin:$PATH

# Copy entrypoint script
COPY --link --chown=python:python scripts/docker-entrypoint.sh /
RUN chmod +x /docker-entrypoint.sh

USER python
WORKDIR /app/

EXPOSE 5000

ENTRYPOINT ["/usr/bin/tini", "-g", "--", "/docker-entrypoint.sh"]
CMD ["python", "app.py"]