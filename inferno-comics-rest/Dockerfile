# syntax=docker/dockerfile:1.4.2

# Stage 1: Compile
FROM gradle:jdk25-corretto AS compile-stage
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
FROM eclipse-temurin:25-jdk-alpine AS runtime-stage
LABEL maintainer="infernokun@infernokun.com" \
      description="Java service Docker image" \
      source="https://github.com/infernokun/InfernoComics" \
      run="docker run -p 8080:8080 <docker image> -d"

VOLUME ["/data/certs"]

# Install dependencies using apk (Alpine's package manager)
RUN apk add --no-cache \
    tini \
    curl \
    bash \
    shadow

# Create user and group (Alpine uses addgroup/adduser)
RUN set -eux; \
    addgroup -g 1000 java; \
    adduser -D -u 1000 -G java java; \
    mkdir -p /app; \
    chown java:java -R /app /home/java

ARG PROJECT
ENV PROJECT=${PROJECT}
ENV JAVA_TOOL_OPTIONS="-Dserver.servlet.contextPath=/${PROJECT} -XX:-TieredCompilation"

# Copy entrypoint and JAR
COPY --link --chown=java:java scripts/docker-entrypoint.sh /
COPY --link --chown=java:java --from=compile-stage /app/build/libs/${PROJECT}.jar /app/${PROJECT}.jar
COPY --link --chown=java:java --from=compile-stage /app/package.json /app/package.json

RUN chmod +x /docker-entrypoint.sh

USER java
WORKDIR /app/

EXPOSE 8080

ENTRYPOINT ["/sbin/tini", "-g", "--", "/docker-entrypoint.sh"]
CMD ["/app/${PROJECT}.jar", "${JAVA_TOOL_OPTIONS}"]