# Ritmo · Metas y hábitos

Tarea 8 de Ingeniería Web — Administración MVC

Miguel Andrés Punin

Ritmo es una aplicación de seguimiento para clientes de un gimnasio y sus entrenadores. El cliente propone una meta, registra sus hábitos y consulta su avance. El entrenador revisa la propuesta, arma el plan semanal y puede dejar una observación o cerrar la meta.

[Ver la demostración en YouTube](https://youtu.be/_7xACeKQebk)

## Ejecutar el proyecto

Se necesita Node.js 22.13 o superior y npm. Desde la carpeta del proyecto:

```sh
npm ci
npm run dev
```

Abre [localhost:3000](http://localhost:3000). Si ejecutas el proyecto sin configurar Supabase, puedes entrar como cliente o entrenador con datos de prueba.

## Conectar Supabase

1. En una base nueva, abre el **SQL Editor** y ejecuta las migraciones en orden: [001](supabase/migrations/001_ritmo.sql), [002](supabase/migrations/002_datos_cliente_y_rutina.sql) y [003](supabase/migrations/003_cancelar_meta_programada.sql).
2. En **Authentication → Users**, crea una cuenta para el entrenador y otra para el cliente, confirma sus correos y copia los UUID de ambas.
3. En el **SQL Editor**, reemplaza los UUID de ejemplo y ejecuta estas sentencias para crear los perfiles y asignar el cliente a su entrenador:

   ```sql
   insert into public.usuarios (id, name, role, trainer_id, timezone)
   values ('UUID_ENTRENADOR', 'Entrenador de prueba', 'entrenador', null, 'America/Guayaquil');

   insert into public.usuarios (id, name, role, trainer_id, timezone)
   values ('UUID_CLIENTE', 'Cliente de prueba', 'cliente', 'UUID_ENTRENADOR', 'America/Guayaquil');
   ```

4. Crea `.env.local` junto a `package.json` y completa estas variables con la URL y la clave publicable de tu proyecto:

   ```dotenv
   SUPABASE_URL=https://TU-PROYECTO.supabase.co
   SUPABASE_PUBLISHABLE_KEY=TU_CLAVE_PUBLICABLE
   ```

5. Reinicia `npm run dev` y entra con una de las cuentas creadas en Supabase.

## Cómo funciona el MVC

- **Vista.** [app/page.tsx](app/page.tsx) muestra los formularios y el panel de cada rol.
- **Controlador.** [app/api/admin/route.ts](app/api/admin/route.ts) recibe las operaciones, comprueba la sesión y llama a las reglas del dominio antes de guardar.
- **Modelo.** [domain/commands.ts](domain/commands.ts) contiene las reglas, [domain/core.ts](domain/core.ts) calcula el seguimiento y [server/repository.ts](server/repository.ts) accede a los datos.

Por ejemplo, si el entrenador intenta activar una segunda meta para un cliente que ya tiene una activa, el servidor rechaza la operación. Al registrar una medición, el cliente elige el indicador por nombre en un desplegable que muestra los indicadores de esa meta.

## Tablas

`usuarios` contiene los perfiles de clientes y entrenadores. `metas` guarda el plan de cada cliente. Las tablas `indicadores`, `mediciones`, `ejercicios`, `alimentos`, `suenos` y `sustancias` se relacionan con la meta por `meta_id`. Cada medición también guarda `indicator_id` para identificar qué se midió, por ejemplo, el peso corporal.

## Compilar y ejecutar

Para producción, configura las variables de Supabase en el entorno del servidor y ejecuta:

```sh
npm run build
npm run start
```

Para revisar los tipos, ejecuta `npm run check`.
