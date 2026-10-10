export interface Well {
  id: number;
  name: string;
  customer: string;
  planned_stages: number;
  toe_stage: number | null;
  deleted_at: string | null;
  overrides: { sand_type_id: number; pounds: number }[];
}
export interface Sand {
  color: string;
  id: number;
  name: string;
  design_pounds: number;
  job_total: number;
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
  name: string;
  deleted_at: string | null;
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
  voided_at: string | null;
}
export interface Run {
  id: number;
  well_id: number;
  stage: number;
  sand_type_id: number;
  pounds: number;
  silo_id: number;
  date: string;
  voided_at: string | null;
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
  pad: {
    id: number;
    name: string;
    customer: string;
    job_name: string;
    job_names: string[];
    shift_names: string[];
    active_shift: string;
  };
  pads: { id: number; name: string }[];
  ledger: { deliveries: Delivery[]; runs: Run[] };
  stage_history: {
    well_id: number;
    stage: number;
    pumped: number;
    design: number;
    short: boolean;
    meshes: {
      sand_type_id: number;
      pumped: number;
      design: number;
      short: boolean;
    }[];
  }[];
  product_map: {
    id: number;
    supplier: string;
    product_code: string;
    sand_type_id: number;
  }[];
  wells: Well[];
  sand_types: Sand[];
  silos: Silo[];
  deliveries: Delivery[];
  runs: Run[];
  suppliers: { id: number; name: string }[];
  customer_orders: {
    id: number;
    customer: string;
    strategy: Pad["settings"]["strategy"] | "custom";
    silo_order: number[];
  }[];
  draw_order: {
    customer: string;
    strategy: Pad["settings"]["strategy"] | "custom";
    source: string;
    silo_order: number[];
  };
  all_wells: Well[];
  all_silos: Silo[];
  job_design: {
    sand_type_id: number;
    planned: number;
    pumped: number;
    job_total: number;
  }[];
  settings: {
    reserve: number;
    strategy:
      | "sequential"
      | "partials"
      | "least_used"
      | "emptiest"
      | "fullest"
      | "pairs";
    pounds_per_ton: number;
    pounds_per_truckload: number;
    clear_pins: number;
    auto_advance: number;
    toe_stage: number;
    current_well_id: number | null;
    current_stage: number;
  };
  next: { well: Well; stage: number; plans: Plan[] } | null;
  totals: {
    sand_type_id: number;
    pounds: number;
    available: number;
    stages: number;
    reorder: boolean;
  }[];
}
