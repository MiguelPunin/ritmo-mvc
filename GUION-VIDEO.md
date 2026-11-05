# Guion · Tarea 8: Administración MVC

Duración sugerida: 4–5 minutos. Usa cuentas de prueba y registros ficticios. Antes de grabar, comprueba que puedas abrir el sitio y entrar como cliente y entrenador. Si grabas el modo demostración, menciona que los cambios de esa modalidad quedan en la sesión; si ya configuraste Supabase, demuestra la persistencia en PostgreSQL.

| Tiempo | Qué mostrar | Qué explicar |
| --- | --- | --- |
| 0:00–0:30 | Inicio y panel del cliente | “Soy Miguel Andrés Punin. Mi proyecto Ritmo sigue metas y hábitos de clientes de un gimnasio. El core separa cumplimiento de hábitos y progreso físico.” |
| 0:30–1:15 | **Metas y objetivos → Nueva propuesta**. Elige ganar masa muscular y un periodo de dos meses. | “El cliente propone la meta. El entrenador asignado configura objetivos semanales y un indicador compatible.” |
| 1:15–2:20 | Cambia a entrenador. Abre **Configurar y activar** de la nueva propuesta. Completa un indicador, por ejemplo perímetro de brazo de 29 a 32 cm. Intenta activar mientras existe una meta activa. Muestra el error. | “El formulario estaba completo. El Route Handler comprueba en el servidor si el cliente ya tiene otra meta activa y rechaza la solicitud antes de guardar. PostgreSQL también lo protege con un índice único.” |
| 2:20–3:20 | En la meta existente, añade una observación. Cambia a cliente y abre **Registro diario → Medición**. Selecciona Press de banca y una fecha de la meta sin medición. Guarda un valor y abre Historial. | “El selector muestra los indicadores de la meta elegida. No se escribe el ID. El servidor verifica la relación antes de guardar. Cada perfil tiene permisos distintos.” |
| 3:20–4:00 | Abre el resumen. Señala cumplimiento, cobertura, valores inicial, actual y objetivo. | “Ejercicio, alimentación y sueño alimentan el cálculo. Los datos faltantes dejan un resultado provisional. El progreso del indicador se calcula por separado.” |
| 4:00–4:40 | Muestra el repositorio, README y URL. | “Las vistas están en `app/`, los controladores en `app/api/`, el repositorio en `server/`, y los cálculos en `domain/core.ts`. Las ocho tablas y sus políticas están en `supabase/migrations/`.” |

Para demostrar una activación correcta, cierra primero la meta existente con una fecha igual o posterior a su último registro. La nueva meta debe empezar al día siguiente. También puedes grabar la activación después de mostrar el error de segunda meta activa.

**Entrega:** enlace del video en Loom o YouTube (comprueba los permisos), URL del despliegue que pueda abrir tu profesor y enlace al repositorio Git. Si el sitio de Sites todavía está privado, ajusta el acceso desde tu cuenta para que tu profesor pueda verlo o usa el despliegue de Next.js descrito en el README.
