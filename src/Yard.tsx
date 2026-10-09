import { useId } from "react";
import type { Pad, Silo } from "./types";
export const pounds = (n: number) => Math.round(n).toLocaleString("en-US");
export function Tank({
  silo,
  selected = false,
}: {
  silo: Silo;
  selected?: boolean;
}) {
  const uid = useId().replaceAll(":", "");
  const top = 196 - Math.min(100, Math.max(0, silo.percent)) * 1.5;
  return (
    <svg
      viewBox="0 0 140 270"
      className={`tank ${selected ? "selected" : ""} ${silo.offline ? "offline" : ""}`}
      aria-hidden="true"
    >
      <defs>
        <linearGradient id={`${uid}s`}>
          <stop stopColor="#252a30" />
          <stop offset=".22" stopColor="#70767b" />
          <stop offset=".48" stopColor="#484e54" />
          <stop offset=".8" stopColor="#30363b" />
          <stop offset="1" stopColor="#656b70" />
        </linearGradient>
        <linearGradient id={`${uid}c`}>
          <stop stopColor="#2b3035" />
          <stop offset=".45" stopColor="#62676b" />
          <stop offset="1" stopColor="#22272c" />
        </linearGradient>
        <clipPath id={`${uid}clip`}>
          <path d="M34 46 H106 V194 H34Z" />
        </clipPath>
        <pattern
          id={`${uid}grain`}
          width="5"
          height="5"
          patternUnits="userSpaceOnUse"
        >
          <circle cx="1" cy="2" r=".6" fill="#f2d39e" opacity=".22" />
        </pattern>
      </defs>
      <ellipse cx="70" cy="260" rx="65" ry="5" fill="#000" opacity=".5" />
      <g
        stroke={selected ? "#e7e0cf" : "#626970"}
        strokeWidth={selected ? 2 : 1}
      >
        <path
          d="M25 190 L23 257 M115 190 L117 257 M38 205 L40 257 M102 205 L100 257"
          strokeWidth="4"
        />
        <path d="M25 257 L48 210 M115 257 L92 210 M25 216 L40 245 M115 216 L100 245" />
        <path d="M23 194 L70 238 L117 194" fill={`url(#${uid}c)`} />
        <path
          d="M23 48 Q70 33 117 48 L117 194 Q70 203 23 194Z"
          fill={`url(#${uid}s)`}
        />
      </g>
      <g clipPath={`url(#${uid}clip)`}>
        <rect
          className="sand-fill"
          x="34"
          y={top}
          width="72"
          height="220"
          fill="#c4a36a"
          opacity={silo.offline ? 0.25 : 0.86}
        />
        <rect
          className="sand-fill"
          x="34"
          y={top}
          width="72"
          height="220"
          fill={`url(#${uid}grain)`}
        />
        <path
          d="M23 84 Q70 94 117 84 M23 122 Q70 132 117 122 M23 160 Q70 170 117 160"
          stroke="#a9afb3"
          strokeWidth=".6"
          opacity=".28"
        />
      </g>
      <g stroke="#7b8287" fill="none" strokeWidth=".9">
        <ellipse cx="70" cy="46" rx="47" ry="8" />
        <ellipse cx="70" cy="26" rx="43" ry="8" />
        <path d="M27 26V45 M48 19V39 M70 18V38 M92 19V39 M113 26V45 M27 32 Q70 47 113 32" />
        <path d="M124 31V258 M130 31V258" />
        {Array.from({ length: 22 }, (_, i) => (
          <path key={i} d={`M124 ${36 + i * 10}H130`} />
        ))}
        <path d="M117 48L125 31" />
        <path d="M70 238V254H79" strokeWidth="4" />
        {Array.from({ length: 12 }, (_, i) => (
          <path key={`t${i}`} d={`M109 ${63 + i * 11}h8`} />
        ))}
      </g>
      <g fill="#646b71">
        <rect x="17" y="255" width="14" height="5" />
        <rect x="109" y="255" width="14" height="5" />
        <rect x="34" y="255" width="13" height="5" />
        <rect x="94" y="255" width="13" height="5" />
      </g>
    </svg>
  );
}
export default function Yard({
  pad,
  selected,
  onSelect,
  multi = [],
}: {
  pad: Pad;
  selected: number;
  onSelect: (s: Silo) => void;
  multi?: number[];
}) {
  return (
    <section className="yard" aria-label="Silo yard">
      {(["A", "B"] as const).map((side) => (
        <div className="yard-side" key={side}>
          <h2>Side {side}</h2>
          <div className="tank-row">
            {pad.silos
              .filter((s) => s.side === side)
              .map((s) => {
                const mesh = pad.sand_types.find(
                  (m) => m.id === s.sand_type_id,
                )!;
                return (
                  <button
                    type="button"
                    key={s.id}
                    className="silo-button"
                    aria-label={`Silo ${s.number}, ${mesh.name}, ${pounds(s.on_hand)} pounds, ${s.stages_left.toFixed(1)} stages left${s.offline ? ", offline" : ""}`}
                    aria-pressed={
                      multi.length ? multi.includes(s.id) : selected === s.id
                    }
                    title={`${pounds(s.on_hand)} lb · ${s.stages_left.toFixed(1)} stages left`}
                    onClick={() => onSelect(s)}
                  >
                    <span
                      className={`tank-status ${s.offline ? "bad" : s.stages_left < 1 ? "low" : ""}`}
                    >
                      {s.offline
                        ? "OFFLINE"
                        : s.stages_left < 1
                          ? "LOW"
                          : multi.includes(s.id)
                            ? "IN PULL"
                            : "\u00a0"}
                    </span>
                    <span className="silo-number">
                      {String(s.number).padStart(2, "0")}
                    </span>
                    <Tank
                      silo={s}
                      selected={multi.includes(s.id) || selected === s.id}
                    />
                    <span className="mesh-name">{mesh.name}</span>
                    <strong>
                      {pounds(s.on_hand)} <small>LB</small>
                    </strong>
                    <span className="capacity">{pounds(s.capacity)} LB</span>
                  </button>
                );
              })}
          </div>
        </div>
      ))}
    </section>
  );
}
