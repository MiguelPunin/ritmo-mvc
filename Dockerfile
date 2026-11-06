FROM node:24-bookworm-slim AS frontend
WORKDIR /app
COPY package.json package-lock.json .npmrc ./
RUN npm ci
COPY app app
COPY domain domain
COPY public public
COPY index.html vite.config.ts tsconfig.json postcss.config.mjs ./
RUN npm run build

FROM maven:3.9-eclipse-temurin-21 AS backend
WORKDIR /app
COPY pom.xml ./
COPY src src
COPY --from=frontend /app/dist dist
RUN mvn -B package

FROM eclipse-temurin:21-jre
WORKDIR /app
COPY --from=backend /app/target/ritmo-mvc-1.0.0.jar ritmo.jar
USER 10001
EXPOSE 8080
ENTRYPOINT ["java", "-jar", "ritmo.jar"]
