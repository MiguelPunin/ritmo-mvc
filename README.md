# Ritmo · Metas y hábitos

Tarea 8 de Ingeniería Web — Administración MVC

Miguel Andrés Punin

Ritmo permite proponer metas, registrar hábitos y consultar el progreso. El entrenador revisa la propuesta, organiza la rutina semanal y da seguimiento al cliente.

Esta versión usa **React con Vite**, **Spring Boot** y **Supabase PostgreSQL**. [Ver la demostración en YouTube](https://youtu.be/nrtwgpJnF4k).

## Ejecutar en desarrollo

Requisitos: Node.js 22.13 o superior, JDK 17 o superior. El repositorio incluye Maven Wrapper.

Desde la raíz del repositorio, inicia el backend:

```sh
.\mvnw.cmd spring-boot:run
```

En Linux o macOS, usa `./mvnw` en lugar de `.\mvnw.cmd`. En otra terminal, desde la misma carpeta, inicia React:

```sh
npm ci
npm run dev
```

Abre [localhost:3000](http://localhost:3000). Vite envía las solicitudes de la API a Spring Boot en el puerto 8080. Si no configuras Supabase, puedes usar el modo de demostración con datos ficticios en tu sesión.

## Usar la base de prueba

Crea `.env.local` junto a `pom.xml` y copia estas variables. Las migraciones ya están aplicadas en la base compartida.

```dotenv
SUPABASE_URL=https://lclrgaghdvhoogzxmwut.supabase.co
SUPABASE_PUBLISHABLE_KEY=sb_publishable_zG5bUQE0IHUR93MOUtsYJg_Qmpcbaxj
```

Reinicia Spring Boot y entra con una cuenta de prueba. Las operaciones de estas cuentas afectan los datos de la base compartida.

| Rol | Correo | Contraseña de prueba |
| --- | --- | --- |
| Cliente (Miguel) | `miguel@gmail.com` | `123456` |
| Entrenador | `entrenador@gmail.com` | `123456` |

Para usar una base propia, ejecuta en el SQL Editor las migraciones [001](supabase/migrations/001_ritmo.sql), [002](supabase/migrations/002_datos_cliente_y_rutina.sql) y [003](supabase/migrations/003_cancelar_meta_programada.sql), en ese orden. Crea las cuentas en Authentication y agrega sus perfiles a `public.usuarios` con los mismos UUID. Crea primero al entrenador y luego al cliente, cuyo `trainer_id` debe apuntar al entrenador. Reemplaza las variables de `.env.local` por las de tu proyecto.

## Administración MVC

- **Vista.** [app/page.tsx](app/page.tsx) contiene los formularios de React. En una medición, el cliente elige por nombre un indicador de la meta seleccionada.
- **Controlador.** [RitmoController.java](src/main/java/ec/ritmo/RitmoController.java) recibe las solicitudes de sesión y administración.
- **Reglas y datos.** [Commands.java](src/main/java/ec/ritmo/Commands.java) valida permisos, fechas, rutinas e indicadores. Por ejemplo, rechaza una segunda meta activa o un mínimo de sueño mayor al máximo antes de guardar. [RitmoService.java](src/main/java/ec/ritmo/RitmoService.java) aplica los cambios y [Supabase.java](src/main/java/ec/ritmo/Supabase.java) los envía usando el token de la cuenta.

La tabla `metas` se relaciona con el cliente mediante `client_id`. Indicadores, mediciones, ejercicios, alimentos, sueño y sustancias usan `meta_id`. Una medición también usa `indicator_id` para identificar qué se midió.

## Compilar y desplegar

```sh
npm ci
npm run check
npm run build
.\mvnw.cmd clean package
java -jar target/ritmo-mvc-1.0.0.jar
```

Abre [localhost:8080](http://localhost:8080). El JAR sirve tanto React como la API. También puedes desplegar con el [Dockerfile](Dockerfile) en un servidor que admita contenedores. Configura `SUPABASE_URL` y `SUPABASE_PUBLISHABLE_KEY` como variables del servidor. El puerto se puede cambiar con `PORT`.

Para probar el flujo completo, ejecuta el JAR sin Supabase y luego `npm run test:flujo -- http://localhost:8080`.
