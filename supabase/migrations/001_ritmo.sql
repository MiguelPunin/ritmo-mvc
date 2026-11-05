-- Ejecutar una vez en SQL Editor de un proyecto NUEVO de Supabase.
begin;
create extension if not exists btree_gist;
create table public.usuarios (
 id uuid primary key references auth.users(id) on delete cascade,
 name text not null check(length(trim(name)) between 1 and 160),
 role text not null check(role in ('cliente','entrenador')),
 trainer_id uuid references public.usuarios(id),
 timezone text not null default 'America/Guayaquil',
 check((role='entrenador' and trainer_id is null) or role='cliente'), check(trainer_id is distinct from id)
);
create table public.metas (
 id uuid primary key default gen_random_uuid(),client_id uuid not null references public.usuarios(id),
 type text not null check(type in ('BAJAR_PESO','GANAR_MASA','MEJORAR_FUERZA','MANTENER_HABITOS')),
 status text not null default 'propuesta' check(status in ('propuesta','activa','cerrada')),
 start_date date not null,end_date date not null,
 exercise_days integer not null default 0,food_days integer not null default 0,sleep_days integer not null default 0,
 sleep_min numeric not null default 0,sleep_max numeric not null default 0,
 observation text not null default '' check(length(observation)<=2000),observation_author uuid references public.usuarios(id),observation_at timestamptz,
 check(end_date>=start_date and end_date-start_date<=366),
 check(exercise_days between 0 and 7 and food_days between 0 and 7 and sleep_days between 0 and 7),
 check(sleep_min>=0 and sleep_max>=sleep_min and sleep_max<=24),
 exclude using gist(client_id with =,daterange(start_date,end_date,'[]') with &&) where(status in ('activa','cerrada'))
);
create unique index una_meta_activa on public.metas(client_id) where status='activa';
create unique index una_propuesta_pendiente on public.metas(client_id) where status='propuesta';
create table public.indicadores (
 id uuid primary key default gen_random_uuid(),meta_id uuid not null references public.metas(id),
 kind text not null check(kind in ('PESO','PERIMETRO','FUERZA','SEMANAS_CUMPLIDAS')),
 name text not null check(length(trim(name)) between 1 and 160),unit text not null check(length(trim(unit)) between 1 and 160),
 initial numeric not null check(initial>=0),target numeric not null check(target>=0 and target<>initial),
 exercise text not null default '',technique text not null default '',equipment text not null default '',reps integer not null default 0 check(reps>=0),
 unique(id,meta_id),
 check(kind<>'FUERZA' or (length(trim(exercise))>0 and length(trim(technique))>0 and length(trim(equipment))>0 and reps>0)),
 check(kind<>'SEMANAS_CUMPLIDAS' or (initial=0 and target>0 and target=trunc(target) and unit='semanas'))
);
create table public.mediciones (
 id uuid primary key default gen_random_uuid(),meta_id uuid not null references public.metas(id),indicator_id uuid not null,
 date date not null,value numeric not null check(value>=0 and value<=100000),
 foreign key(indicator_id,meta_id) references public.indicadores(id,meta_id),unique(indicator_id,date)
);
create table public.ejercicios (
 id uuid primary key default gen_random_uuid(),meta_id uuid not null references public.metas(id),date date not null,
 time time not null default '12:00',
 name text not null check(length(trim(name)) between 1 and 160),series integer not null check(series between 1 and 100),reps integer not null check(reps between 1 and 1000),
 weight numeric not null check(weight between 0 and 2000),performed boolean not null
);
create table public.alimentos (
 id uuid primary key default gen_random_uuid(),meta_id uuid not null references public.metas(id),date date not null,
 kind text not null check(kind in ('declaracion','comida')),complete boolean not null default false,meal text not null default '' check(length(meal)<=500),
 check(kind<>'comida' or length(trim(meal))>0)
);
create unique index declaracion_diaria_unica on public.alimentos(meta_id,date) where kind='declaracion';
create table public.suenos (
 id uuid primary key default gen_random_uuid(),meta_id uuid not null references public.metas(id),date date not null,
 start timestamptz not null,"end" timestamptz not null,
 check("end">start and "end"-start<=interval '24 hours'),
 exclude using gist(meta_id with =,tstzrange(start,"end",'[)') with &&)
);
create table public.sustancias (
 id uuid primary key default gen_random_uuid(),meta_id uuid not null references public.metas(id),date date not null,
 name text not null check(length(trim(name)) between 1 and 160),amount text not null check(length(trim(amount)) between 1 and 160)
);
-- Funciones de lectura sin recursión de políticas RLS.
create function public.puede_ver_cliente(p_client uuid) returns boolean language sql stable security definer set search_path=public as $$
 select p_client=auth.uid() or exists(select 1 from usuarios where id=p_client and trainer_id=auth.uid())
$$;
create function public.es_entrenador_de(p_client uuid) returns boolean language sql stable security definer set search_path=public as $$
 select exists(select 1 from usuarios c join usuarios t on t.id=c.trainer_id where c.id=p_client and t.id=auth.uid() and t.role='entrenador')
$$;
create function public.puede_ver_usuario(p_id uuid) returns boolean language sql stable security definer set search_path=public as $$
 select p_id=auth.uid() or exists(select 1 from usuarios where id=p_id and trainer_id=auth.uid()) or exists(select 1 from usuarios where id=auth.uid() and trainer_id=p_id)
$$;
create function public.puede_ver_meta(p_meta uuid) returns boolean language sql stable security definer set search_path=public as $$
 select exists(select 1 from metas where id=p_meta and puede_ver_cliente(client_id))
$$;
create function public.puede_registrar(p_meta uuid) returns boolean language sql stable security definer set search_path=public as $$
 select exists(select 1 from metas where id=p_meta and client_id=auth.uid() and status='activa')
$$;
create function public.puede_configurar(p_meta uuid) returns boolean language sql stable security definer set search_path=public as $$
 select exists(select 1 from metas where id=p_meta and status='propuesta' and es_entrenador_de(client_id))
$$;
create function public.validar_usuario() returns trigger language plpgsql set search_path=public as $$
begin
 if not exists(select 1 from pg_timezone_names where name=new.timezone) then raise exception 'Zona horaria inválida'; end if;
 if new.trainer_id is not null and not exists(select 1 from usuarios where id=new.trainer_id and role='entrenador') then raise exception 'La asignación debe referir a un entrenador'; end if;
 if tg_op='UPDATE' and (new.role is distinct from old.role or new.timezone is distinct from old.timezone) and exists(select 1 from metas where client_id=old.id) then raise exception 'No cambies el rol ni la zona horaria de un cliente con historial'; end if;
 return new;
end $$;
create trigger validar_usuario before insert or update on public.usuarios for each row execute function public.validar_usuario();
create function public.validar_meta() returns trigger language plpgsql security definer set search_path=public as $$
declare i indicadores; first_monday date; full_weeks integer; local_today date;
begin
 perform 1 from usuarios where id=new.client_id and role='cliente' for update;
 if not found then raise exception 'La meta debe pertenecer a un cliente'; end if;
 select (now() at time zone timezone)::date into local_today from usuarios where id=new.client_id;
 if tg_op='INSERT' then
   if auth.uid() is distinct from new.client_id or new.status<>'propuesta' or new.exercise_days<>0 or new.food_days<>0 or new.sleep_days<>0 or new.sleep_min<>0 or new.sleep_max<>0 or new.observation<>'' or new.observation_author is not null or new.observation_at is not null then raise exception 'El cliente solo puede crear una propuesta sin configuración'; end if;
 else
   if not es_entrenador_de(old.client_id) then raise exception 'Solo el entrenador asignado administra la meta'; end if;
   if old.status='cerrada' then raise exception 'El historial cerrado es de solo lectura'; end if;
   if new.id<>old.id or new.client_id<>old.client_id or new.type<>old.type then raise exception 'No puedes cambiar identidad, cliente o tipo'; end if;
   if old.status='activa' and (new.start_date<>old.start_date or new.exercise_days<>old.exercise_days or new.food_days<>old.food_days or new.sleep_days<>old.sleep_days or new.sleep_min<>old.sleep_min or new.sleep_max<>old.sleep_max or (new.end_date<>old.end_date and new.status<>'cerrada')) then raise exception 'Los objetivos activos no se editan'; end if;
   if new.status<>old.status and not ((old.status='propuesta' and new.status in ('activa','cerrada')) or (old.status='activa' and new.status='cerrada')) then raise exception 'Transición de estado no permitida'; end if;
   if new.observation is distinct from old.observation then new.observation_author=auth.uid();new.observation_at=now(); else new.observation_author=old.observation_author;new.observation_at=old.observation_at; end if;
   if new.status='cerrada' then
     if new.end_date>local_today or new.end_date>old.end_date then raise exception 'Fecha de cierre inválida'; end if;
     if exists(select 1 from (select meta_id,date from ejercicios union all select meta_id,date from alimentos union all select meta_id,date from suenos union all select meta_id,date from mediciones union all select meta_id,date from sustancias) r where r.meta_id=new.id and r.date>new.end_date) then raise exception 'No puedes cerrar antes de los registros existentes'; end if;
   end if;
 end if;
 if new.status='activa' then
   if new.exercise_days<1 or new.food_days<1 or new.sleep_days<1 or new.sleep_min<=0 then raise exception 'Completa los tres objetivos y el intervalo de sueño'; end if;
   if not exists(select 1 from indicadores where meta_id=new.id) then raise exception 'La meta activa exige al menos un indicador'; end if;
   if exists(select 1 from metas where client_id=new.client_id and status='activa' and id<>new.id) then raise exception 'El cliente ya tiene una meta activa'; end if;
   for i in select * from indicadores where meta_id=new.id loop
     if (new.type='MANTENER_HABITOS' and i.kind<>'SEMANAS_CUMPLIDAS') or (new.type='MEJORAR_FUERZA' and i.kind<>'FUERZA') or (new.type in ('BAJAR_PESO','GANAR_MASA') and i.kind not in ('PESO','PERIMETRO')) then raise exception 'Indicador incompatible'; end if;
     if i.kind='SEMANAS_CUMPLIDAS' then
       first_monday=new.start_date+((8-extract(isodow from new.start_date)::integer)%7);
       full_weeks=greatest(0,(new.end_date-first_monday+1)/7);
       if i.target>full_weeks then raise exception 'No caben las semanas completas previstas'; end if;
     end if;
   end loop;
 end if;
 return new;
end $$;
create trigger validar_meta before insert or update on public.metas for each row execute function public.validar_meta();
create function public.validar_indicador() returns trigger language plpgsql security definer set search_path=public as $$
declare mid uuid; m metas;
begin
 mid=case when tg_op='DELETE' then old.meta_id else new.meta_id end;
 select * into m from metas where id=mid for update;
 if m.status<>'propuesta' or not es_entrenador_de(m.client_id) then raise exception 'Solo el entrenador puede configurar indicadores de una propuesta'; end if;
 if tg_op='UPDATE' and (new.meta_id<>old.meta_id or new.id<>old.id) then raise exception 'No puedes reasignar un indicador'; end if;
 if tg_op='DELETE' then return old; end if;
 return new;
end $$;
create trigger validar_indicador before insert or update or delete on public.indicadores for each row execute function public.validar_indicador();
create function public.validar_registro() returns trigger language plpgsql security definer set search_path=public as $$
declare m metas; tz text; mid uuid; total numeric;
begin
 mid=case when tg_op='DELETE' then old.meta_id else new.meta_id end;
 select * into m from metas where id=mid for update;
 if not found or m.client_id is distinct from auth.uid() or m.status<>'activa' then raise exception 'Solo el cliente registra en su meta activa'; end if;
 if tg_op='DELETE' then return old; end if;
 if tg_op='UPDATE' and (new.meta_id<>old.meta_id or new.id<>old.id) then raise exception 'No puedes reasignar registros'; end if;
 select timezone into tz from usuarios where id=m.client_id;
 if tg_table_name='suenos' then
   new.date=(new."end" at time zone tz)::date;
   select coalesce(sum(extract(epoch from ("end"-start))/3600),0) into total from suenos where meta_id=mid and date=new.date and id<>new.id;
   if total+extract(epoch from (new."end"-new.start))/3600>24 then raise exception 'El sueño diario no puede superar 24 horas'; end if;
 end if;
 if new.date<m.start_date or new.date>m.end_date or new.date>(now() at time zone tz)::date then raise exception 'La fecha debe estar en la meta activa y no puede ser futura'; end if;
 if tg_table_name='mediciones' then
   if not exists(select 1 from indicadores where id=new.indicator_id and meta_id=mid and kind<>'SEMANAS_CUMPLIDAS') then raise exception 'Indicador inválido o calculado automáticamente'; end if;
 end if;
 return new;
end $$;
do $$ declare t text; begin
 foreach t in array array['mediciones','ejercicios','alimentos','suenos','sustancias'] loop
   execute format('create trigger validar_registro before insert or update or delete on public.%I for each row execute function public.validar_registro()',t);
   execute format('create index on public.%I(meta_id,date)',t);
 end loop;
end $$;
-- Una única transacción: indicadores + activación; el bloqueo serializa activaciones.
create function public.activar_meta(p_meta jsonb,p_indicadores jsonb) returns void language plpgsql security invoker set search_path=public as $$
declare m metas; item jsonb;
begin
 select * into m from metas where id=(p_meta->>'id')::uuid for update;
 if not found or m.status<>'propuesta' or not es_entrenador_de(m.client_id) then raise exception 'Propuesta no autorizada'; end if;
 if jsonb_typeof(p_indicadores)<>'array' or jsonb_array_length(p_indicadores) not between 1 and 6 then raise exception 'Configura de 1 a 6 indicadores'; end if;
 delete from indicadores where meta_id=m.id;
 for item in select * from jsonb_array_elements(p_indicadores) loop
   insert into indicadores(id,meta_id,kind,name,unit,initial,target,exercise,technique,equipment,reps) values((item->>'id')::uuid,m.id,item->>'kind',item->>'name',item->>'unit',(item->>'initial')::numeric,(item->>'target')::numeric,coalesce(item->>'exercise',''),coalesce(item->>'technique',''),coalesce(item->>'equipment',''),coalesce((item->>'reps')::integer,0));
 end loop;
 update metas set status='activa',start_date=(p_meta->>'start_date')::date,end_date=(p_meta->>'end_date')::date,exercise_days=(p_meta->>'exercise_days')::integer,food_days=(p_meta->>'food_days')::integer,sleep_days=(p_meta->>'sleep_days')::integer,sleep_min=(p_meta->>'sleep_min')::numeric,sleep_max=(p_meta->>'sleep_max')::numeric where id=m.id;
end $$;
-- RLS: ningún dato de cliente es público y nadie puede autoasignarse un rol.
alter table public.usuarios enable row level security;
alter table public.metas enable row level security;
alter table public.indicadores enable row level security;
create policy usuarios_lectura on public.usuarios for select to authenticated using(puede_ver_usuario(id));
create policy metas_lectura on public.metas for select to authenticated using(puede_ver_cliente(client_id));
create policy metas_proponer on public.metas for insert to authenticated with check(client_id=auth.uid() and status='propuesta');
create policy metas_administrar on public.metas for update to authenticated using(es_entrenador_de(client_id)) with check(es_entrenador_de(client_id));
create policy indicadores_lectura on public.indicadores for select to authenticated using(puede_ver_meta(meta_id));
create policy indicadores_insertar on public.indicadores for insert to authenticated with check(puede_configurar(meta_id));
create policy indicadores_editar on public.indicadores for update to authenticated using(puede_configurar(meta_id)) with check(puede_configurar(meta_id));
create policy indicadores_eliminar on public.indicadores for delete to authenticated using(puede_configurar(meta_id));
do $$ declare t text; begin
 foreach t in array array['mediciones','ejercicios','alimentos','suenos','sustancias'] loop
   execute format('alter table public.%I enable row level security',t);
   execute format('create policy lectura on public.%I for select to authenticated using(public.puede_ver_meta(meta_id))',t);
   execute format('create policy insertar on public.%I for insert to authenticated with check(public.puede_registrar(meta_id))',t);
   execute format('create policy editar on public.%I for update to authenticated using(public.puede_registrar(meta_id)) with check(public.puede_registrar(meta_id))',t);
   execute format('create policy eliminar on public.%I for delete to authenticated using(public.puede_registrar(meta_id))',t);
 end loop;
end $$;
revoke all on public.usuarios,public.metas,public.indicadores,public.mediciones,public.ejercicios,public.alimentos,public.suenos,public.sustancias from anon,authenticated;
grant select on public.usuarios to authenticated;
grant select,insert,update on public.metas to authenticated;
grant select,insert,update,delete on public.indicadores,public.mediciones,public.ejercicios,public.alimentos,public.suenos,public.sustancias to authenticated;
revoke execute on function public.puede_ver_cliente(uuid),public.es_entrenador_de(uuid),public.puede_ver_usuario(uuid),public.puede_ver_meta(uuid),public.puede_registrar(uuid),public.puede_configurar(uuid),public.activar_meta(jsonb,jsonb) from public,anon;
grant execute on function public.puede_ver_cliente(uuid),public.es_entrenador_de(uuid),public.puede_ver_usuario(uuid),public.puede_ver_meta(uuid),public.puede_registrar(uuid),public.puede_configurar(uuid),public.activar_meta(jsonb,jsonb) to authenticated;
commit;
