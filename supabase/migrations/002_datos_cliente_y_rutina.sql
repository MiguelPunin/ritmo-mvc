-- Ejecutar una vez después de 001_ritmo.sql.
begin;

alter table public.metas
  add column reported_weight_kg numeric check (reported_weight_kg between 20 and 500),
  add column goal_details text not null default '' check (length(goal_details) <= 1000),
  add column training_plan jsonb check (
    case when training_plan is null then true
         when jsonb_typeof(training_plan) = 'array' then
           jsonb_array_length(training_plan) = exercise_days and exercise_days > 0
         else false
    end
  );

alter table public.metas drop constraint metas_type_check;
alter table public.metas add constraint metas_type_check
  check (type in ('BAJAR_PESO', 'GANAR_MASA', 'DEFINIR', 'MEJORAR_FUERZA', 'MANTENER_HABITOS'));
create or replace function public.validar_meta() returns trigger language plpgsql security definer set search_path=public as $$
declare i indicadores; first_monday date; full_weeks integer; local_today date;
begin
 perform 1 from usuarios where id=new.client_id and role='cliente' for update;
 if not found then raise exception 'La meta debe pertenecer a un cliente'; end if;
 select (now() at time zone timezone)::date into local_today from usuarios where id=new.client_id;
 if tg_op='INSERT' and new.training_plan is not null then
   raise exception 'La rutina la define el entrenador';
 end if;
 if tg_op='UPDATE' then
   if new.reported_weight_kg is distinct from old.reported_weight_kg
      or new.goal_details is distinct from old.goal_details then
     raise exception 'Los datos reportados por el cliente son de solo lectura';
   end if;
   if new.training_plan is distinct from old.training_plan
      and not (old.status='propuesta' and new.status='activa') then
     raise exception 'La rutina se define al activar la propuesta';
   end if;
 end if;
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
     if (new.type='MANTENER_HABITOS' and i.kind<>'SEMANAS_CUMPLIDAS') or (new.type='MEJORAR_FUERZA' and i.kind<>'FUERZA') or (new.type in ('BAJAR_PESO','GANAR_MASA','DEFINIR') and i.kind not in ('PESO','PERIMETRO')) then raise exception 'Indicador incompatible'; end if;
     if i.kind='SEMANAS_CUMPLIDAS' then
       first_monday=new.start_date+((8-extract(isodow from new.start_date)::integer)%7);
       full_weeks=greatest(0,(new.end_date-first_monday+1)/7);
       if i.target>full_weeks then raise exception 'No caben las semanas completas previstas'; end if;
     end if;
   end loop;
 end if;
 return new;
end $$;
create or replace function public.activar_meta(p_meta jsonb,p_indicadores jsonb) returns void language plpgsql security invoker set search_path=public as $$
declare m metas; item jsonb;
begin
 select * into m from metas where id=(p_meta->>'id')::uuid for update;
 if not found or m.status<>'propuesta' or not es_entrenador_de(m.client_id) then raise exception 'Propuesta no autorizada'; end if;
 if jsonb_typeof(p_indicadores)<>'array' or jsonb_array_length(p_indicadores) not between 1 and 6 then raise exception 'Configura de 1 a 6 indicadores'; end if;
 delete from indicadores where meta_id=m.id;
 for item in select * from jsonb_array_elements(p_indicadores) loop
   insert into indicadores(id,meta_id,kind,name,unit,initial,target,exercise,technique,equipment,reps) values((item->>'id')::uuid,m.id,item->>'kind',item->>'name',case when item->>'kind'='PESO' and m.reported_weight_kg is not null then 'kg' else item->>'unit' end,case when item->>'kind'='PESO' and m.reported_weight_kg is not null then m.reported_weight_kg else (item->>'initial')::numeric end,(item->>'target')::numeric,coalesce(item->>'exercise',''),coalesce(item->>'technique',''),coalesce(item->>'equipment',''),coalesce((item->>'reps')::integer,0));
 end loop;
 update metas set status='activa',start_date=(p_meta->>'start_date')::date,end_date=(p_meta->>'end_date')::date,exercise_days=(p_meta->>'exercise_days')::integer,food_days=(p_meta->>'food_days')::integer,sleep_days=(p_meta->>'sleep_days')::integer,sleep_min=(p_meta->>'sleep_min')::numeric,sleep_max=(p_meta->>'sleep_max')::numeric ,
   training_plan = case when p_meta ? 'training_plan' then p_meta->'training_plan' else m.training_plan end,
   observation = coalesce(p_meta->>'observation', m.observation)
 where id=m.id;
end $$;
commit;
