# Ritmo · Metas y hábitos

**Tarea 8: Administración MVC · Ingeniería Web · Miguel Andrés Punin**

Ritmo permite a los clientes de un gimnasio proponer una meta, registrar sus hábitos y consultar su progreso. El entrenador asignado define el plan, activa y cierra metas y registra una observación vigente. El panel distingue **cumplimiento**, **cobertura de registros** y **progreso físico**.

[Abrir la demostración de Ritmo en Sites](https://ritmo-mvc-miguel-punin.miguel-p.chatgpt.site) · [Guion para grabar el video](GUION-VIDEO.md)

La demostración se inicia con un clic en **Entrar como cliente** o **Entrar como entrenador**. Usa solo datos ficticios. Sus cambios se conservan en una cookie cifrada de la sesión, hasta ocho horas; puedes alternar roles dentro de la demostración. Para datos permanentes e inicio de sesión real, conecta un proyecto Supabase.

## Ejecutar localmente

Requisitos: Node.js 22.13+ y npm. Desde la raíz:

```sh
npm ci
npm run dev:next
```

Abre `http://localhost:3000`. La demostración local funciona sin variables. Si quieres probar el mismo adaptador que usa Sites, ejecuta `npm run dev` y abre la URL de la terminal. El despliegue de Sites compila con Vinext, conservando las rutas del App Router; los comandos con sufijo `:next` usan Next.js directamente.

## Arquitectura MVC

| Capa | Archivos | Responsabilidad |
| --- | --- | --- |
| Vista | `app/page.tsx`, `app/globals.css` | Panel React, navegación por rol, formularios y selectores. Tailwind CSS y estilos de la aplicación. |
| Controlador | `app/api/session/route.ts`, `app/api/admin/route.ts` | Lee la sesión, autoriza y valida las operaciones antes de persistir. |
| Modelo | `domain/types.ts`, `domain/commands.ts`, `server/repository.ts`, `supabase/migrations/` | Entidades, reglas y repositorio PostgreSQL o repositorio de demostración. |
| Servicio del core | `domain/core.ts` | Días válidos y elegibles, objetivos ajustados a semanas parciales, cobertura y progreso de cada indicador. |

Las ocho tablas son `usuarios`, `metas`, `indicadores`, `mediciones`, `ejercicios`, `alimentos`, `suenos` y `sustancias`. `metas.client_id` enlaza al cliente; `indicadores.meta_id` enlaza a la meta; `mediciones` usa una clave compuesta para garantizar que su indicador pertenezca a la misma meta. Los usuarios solo consultan sus datos, su entrenador o sus clientes asignados, según el rol.

### Requisitos demostrables

- **Validación en back-end.** Propón otra meta desde el cliente de ejemplo. Cambia al entrenador, configúrala y pulsa **Validar y activar**. El servidor devuelve 422 porque ya existe una activa. PostgreSQL refuerza la regla con un índice único y la configuración se realiza en una sola transacción.
- **Relaciones por selectores.** En **Registro diario → Medición**, selecciona el indicador por nombre y unidad. Las opciones dependen de la meta seleccionada. La API rechaza indicadores ajenos, y la base aplica la clave foránea compuesta.
- **Integridad.** El servidor y PostgreSQL impiden fechas fuera de la meta, series o repeticiones inválidas, declaraciones diarias duplicadas, descansos solapados, edición de metas cerradas y mediciones de semanas calculadas. El entrenador consulta los registros y escribe su observación, sin corregir las declaraciones del cliente.
- **Seguimiento.** La semana va de lunes a domingo. El ejercicio cuenta una vez al día, la alimentación se evalúa con una declaración diaria y el sueño se suma por fecha local de finalización. Los porcentajes se limitan a 100 %. La cobertura se muestra por separado; con faltantes, el resultado es provisional. El indicador de semanas cumplidas se calcula con semanas completas y datos suficientes.

## Conectar Supabase

1. Crea un proyecto en [Supabase](https://supabase.com/dashboard). En **SQL Editor** abre y ejecuta el contenido de [`supabase/migrations/001_ritmo.sql`](supabase/migrations/001_ritmo.sql) una vez en la base nueva. Crea tablas, restricciones, RLS y la transacción de activación.
2. En **Authentication → Users**, crea dos usuarios de prueba con correo y contraseña, uno para cada rol. Confirma su correo desde el panel para que puedan entrar. Copia sus UUID de usuario. Consulta la [guía oficial de usuarios](https://supabase.com/docs/guides/auth/users).
3. En **SQL Editor**, inserta los perfiles reemplazando los dos UUID. Conserva el orden, pues el cliente referencia al entrenador:

   ```sql
   insert into public.usuarios (id, name, role, trainer_id, timezone)
   values ('UUID_ENTRENADOR', 'Daniela Torres', 'entrenador', null, 'America/Guayaquil');
   insert into public.usuarios (id, name, role, trainer_id, timezone)
   values ('UUID_CLIENTE', 'Cliente de prueba', 'cliente', 'UUID_ENTRENADOR', 'America/Guayaquil');
   ```

4. Copia `.env.example` a `.env.local`. En el diálogo **Connect** de Supabase obtén el URL del proyecto y la [clave publicable](https://supabase.com/docs/guides/api/creating-routes). Asigna `SUPABASE_URL` y `SUPABASE_PUBLISHABLE_KEY`. Una clave `anon` anterior también funciona con `SUPABASE_ANON_KEY`. No uses `service_role` ni una clave secreta de Supabase: las consultas usan el token del usuario y respetan RLS.
5. Reinicia `npm run dev:next`. Inicia sesión con cada cuenta de prueba, propone una meta y verifica que la operación quede guardada en la base. Los registros de demostración no se copian a Supabase.

## Despliegue y entrega

El sitio de Sites se publica con acceso privado de propietario. Para que el profesor pueda abrirlo, concede acceso desde tu cuenta o despliega una instancia accesible para evaluación. Comparte exclusivamente usuarios de prueba y datos ficticios.

Para usar Next.js directamente, importa tu repositorio Git en un host con Node.js, como [Vercel](https://vercel.com/docs/git), y selecciona el preset Next.js. Usa `npm run build:next` como comando de compilación. En un servidor Node.js propio usa `npm run build:next` y `npm run start:next`. No exportes el sitio como HTML estático: los Route Handlers requieren un servidor. Consulta la [guía de despliegue de Next.js](https://nextjs.org/docs/app/getting-started/deploying).

Configura `SUPABASE_URL` y `SUPABASE_PUBLISHABLE_KEY` como variables del servidor. Para mantener habilitada la demostración en producción, añade `DEMO_SECRET` como secreto. Puedes generar su valor localmente con:

```sh
node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"
```

Para compartir el código, puedes clonar el archivo Git entregado con `git clone ritmo-mvc.bundle ritmo-mvc`, crear un repositorio vacío en tu cuenta y publicar la rama `main`:

```sh
git remote set-url origin https://github.com/TU-USUARIO/ritmo-mvc.git
git push -u origin main
```

Verifica los enlaces del **repositorio**, el **despliegue** y el **video de Loom o YouTube** antes de entregarlos. El [guion](GUION-VIDEO.md) indica qué grabar y cómo probar la validación.

## Verificación

```sh
npm run check
# Con la aplicación en ejecución:
npm run test:flujo -- http://localhost:3000
```

La prueba de integración abre una sesión ficticia aislada y verifica roles, propuesta, rechazo de segunda meta activa, cierre, activación exitosa, corrección de registros, observaciones, asociación de indicadores, fechas y registros duplicados. La migración se comprobó en PostgreSQL de prueba con identidades simuladas. Ejecútala y valídala con dos cuentas en tu proyecto Supabase para comprobar la conexión real.
