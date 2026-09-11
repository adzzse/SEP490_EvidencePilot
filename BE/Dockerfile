# ────────────────────────────────────────────────────────────────
# Stage 1: Build
# ────────────────────────────────────────────────────────────────
FROM maven:3.9-eclipse-temurin-21 AS builder

WORKDIR /build

COPY pom.xml .
RUN mvn dependency:go-offline -B --no-transfer-progress

COPY src ./src
RUN mvn package -B --no-transfer-progress

# ────────────────────────────────────────────────────────────────
# Stage 2: Runtime
# ────────────────────────────────────────────────────────────────
FROM eclipse-temurin:21-jre-alpine AS runtime

# Create non-root user
RUN addgroup -S appgroup && adduser -S appuser -G appgroup

WORKDIR /app

# Safely copy the exact jar, explicitly changing ownership to the non-root user
COPY --chown=appuser:appgroup --from=builder /build/target/evidence-pilot.jar app.jar

# Drop root privileges immediately
USER appuser

EXPOSE 8080

ENTRYPOINT ["java", \
    "-Djava.security.egd=file:/dev/./urandom", \
    "-jar", "/app/app.jar"]