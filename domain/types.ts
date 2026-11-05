export type Role = "cliente" | "entrenador";
export type GoalType =
  | "BAJAR_PESO"
  | "GANAR_MASA"
  | "DEFINIR"
  | "MEJORAR_FUERZA"
  | "MANTENER_HABITOS";
export type Status = "propuesta" | "activa" | "cerrada" | "cancelada";
export type IndicatorKind =
  "PESO" | "PERIMETRO" | "FUERZA" | "SEMANAS_CUMPLIDAS";
export interface Usuario {
  id: string;
  name: string;
  role: Role;
  trainer_id: string | null;
  timezone: string;
}
export const trainingDays = [
  "Lunes",
  "Martes",
  "Miércoles",
  "Jueves",
  "Viernes",
  "Sábado",
  "Domingo",
] as const;
export const muscleGroups = [
  "Cuerpo completo",
  "Tren superior",
  "Tren inferior",
  "Hombros",
  "Pecho",
  "Espalda",
  "Piernas",
  "Bíceps",
  "Tríceps",
  "Cuádriceps",
  "Glúteos",
  "Abdomen",
  "Cardio",
] as const;
export interface TrainingSession {
  day: (typeof trainingDays)[number];
  minutes: number;
  groups: (typeof muscleGroups)[number][];
}
export interface Meta {
  id: string;
  client_id: string;
  type: GoalType;
  status: Status;
  start_date: string;
  end_date: string;
  reported_weight_kg?: number | null;
  goal_details?: string;
  training_plan?: TrainingSession[];
  exercise_days: number;
  food_days: number;
  sleep_days: number;
  sleep_min: number;
  sleep_max: number;
  observation: string;
  observation_author: string | null;
  observation_at: string | null;
}
export interface Indicador {
  id: string;
  meta_id: string;
  kind: IndicatorKind;
  name: string;
  unit: string;
  initial: number;
  target: number;
  exercise: string;
  technique: string;
  equipment: string;
  reps: number;
}
export interface Medicion {
  id: string;
  meta_id: string;
  indicator_id: string;
  date: string;
  value: number;
}
export interface RegistroEjercicio {
  id: string;
  meta_id: string;
  date: string;
  time: string;
  name: string;
  series: number;
  reps: number;
  weight: number;
  performed: boolean;
}
export interface RegistroAlimentacion {
  id: string;
  meta_id: string;
  date: string;
  kind: "declaracion" | "comida";
  complete: boolean;
  meal: string;
}
export interface RegistroSueno {
  id: string;
  meta_id: string;
  date: string;
  start: string;
  end: string;
}
export interface ConsumoSustancia {
  id: string;
  meta_id: string;
  date: string;
  name: string;
  amount: string;
}
export interface State {
  usuarios: Usuario[];
  metas: Meta[];
  indicadores: Indicador[];
  mediciones: Medicion[];
  ejercicios: RegistroEjercicio[];
  alimentos: RegistroAlimentacion[];
  suenos: RegistroSueno[];
  sustancias: ConsumoSustancia[];
}
export type Table = keyof State;
export interface Context {
  user: Usuario;
  state: State;
  demo: boolean;
}
export const goalLabels: Record<GoalType, string> = {
  BAJAR_PESO: "Bajar de peso",
  GANAR_MASA: "Ganar masa muscular",
  DEFINIR: "Definir y tonificar",
  MEJORAR_FUERZA: "Mejorar fuerza",
  MANTENER_HABITOS: "Mantener hábitos",
};
export const kindLabels: Record<IndicatorKind, string> = {
  PESO: "Peso corporal",
  PERIMETRO: "Perímetro",
  FUERZA: "Fuerza",
  SEMANAS_CUMPLIDAS: "Semanas cumplidas",
};
export const emptyState = (): State => ({
  usuarios: [],
  metas: [],
  indicadores: [],
  mediciones: [],
  ejercicios: [],
  alimentos: [],
  suenos: [],
  sustancias: [],
});
