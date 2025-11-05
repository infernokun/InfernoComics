# syntax=docker/dockerfile:1.4.2

# Stage 1: Compile
FROM gradle:jdk21-corretto AS compile-stage

WORKDIR /app/
COPY --link gradlew /app/gradlew
COPY --link gradle /app/gradle
COPY --link build.gradle /app/build.gradle
COPY --link settings.gradle /app/settings.gradle
COPY --link package.json /app/package.json
COPY --link src /app/src
RUN chmod +x gradlew

RUN gradle build --no-daemon -x test

# Stage 2: Runtime
FROM openjdk:22-jdk-slim AS runtime-stage
LABEL maintainer="infernokun@infernokun.com" \
      description="Java service Docker image" \
      source="https://github.com/infernokun/InfernoComics" \
      run="docker run -p 8080:8080 <docker image> -d"

VOLUME ["/data/certs"]

RUN apt-get update && apt-get install -y \
    tini \
    curl \
    bash \
 && apt-get clean && rm -rf /var/lib/apt/lists/*

RUN set -eux; \
    groupadd -g 1000 java; \
    useradd -m -r -u 1000 -g java java; \
    mkdir -p /app; \
    chown java:java -R /app /home/java

ENV JAVA_TOOL_OPTIONS='-Dserver.servlet.contextPath=/${PROJECT} \
                        -XX:-TieredCompilation'

ARG PROJECT
ENV PROJECT=${PROJECT}

# Install tini
RUN apt-get update && apt-get install -y tini

# Copy entrypoint and JAR
COPY --link --chown=java:java scripts/docker-entrypoint.sh /
COPY --link --chown=java:java --from=compile-stage /app/build/libs/${PROJECT}.jar /app/${PROJECT}.jar
# Copy package.json to the runtime stage
COPY --link --chown=java:java --from=compile-stage /app/package.json /app/package.json

RUN chmod +x /docker-entrypoint.sh

USER java
WORKDIR /app/

EXPOSE 8080

ENTRYPOINT ["/usr/bin/tini", "-g", "--", "/docker-entrypoint.sh"]
CMD ["/app/${PROJECT}.jar", "${JAVA_TOOL_OPTIONS}"]