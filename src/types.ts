export interface Well {
  id: number;
  name: string;
  customer: string;
  planned_stages: number;
}
export interface Sand {
  id: number;
  name: string;
  design_pounds: number;
}
export interface Silo {
  id: number;
  number: number;
  side: "A" | "B";
  sand_type_id: number;
  capacity: number;
  starting_balance: number;
  manual_pin: number | null;
  offline: number;
  on_hand: number;
  percent: number;
  stages_left: number;
  run_order: number | null;
  planned_pull: number;
  pin_conflict: boolean;
}
export interface Delivery {
  id: number;
  date: string;
  ticket_number: string;
  supplier: string;
  product_code: string;
  sand_type_id: number;
  pounds: number;
  silo_id: number;
}
export interface Run {
  id: number;
  well_id: number;
  stage: number;
  sand_type_id: number;
  pounds: number;
  silo_id: number;
}
export interface Plan {
  sand_type_id: number;
  required: number;
  recorded: number;
  remaining: number;
  shortfall: number;
  pulls: { silo_id: number; pounds: number }[];
}
export interface Pad {
  wells: Well[];
  sand_types: Sand[];
  silos: Silo[];
  deliveries: Delivery[];
  runs: Run[];
  settings: { reserve: number; strategy: "sequential" };
  next: { well: Well; stage: number; plans: Plan[] } | null;
  totals: {
    sand_type_id: number;
    pounds: number;
    available: number;
    stages: number;
    reorder: boolean;
  }[];
}
