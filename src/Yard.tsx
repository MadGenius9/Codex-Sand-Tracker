import { useId } from "react";
import type { Pad, Silo } from "./types";
export const pounds = (n: number) => Math.round(n).toLocaleString("en-US");
export const tankState = (s: Silo) =>
  s.offline
    ? "offline"
    : s.percent <= 10
      ? "critical"
      : s.percent <= 25
        ? "low"
        : "ready";
export function Tank({
  silo,
  selected = false,
  color = "#38bdf8",
}: {
  silo: Silo;
  selected?: boolean;
  color?: string;
}) {
  const uid = useId().replaceAll(":", ""),
    state = tankState(silo),
    fill =
      state === "critical" ? "#f25f63" : state === "low" ? "#f4b64e" : color;
  const percent = Math.min(100, Math.max(0, silo.percent)),
    top = 172 - percent * 1.42;
  return (
    <svg
      viewBox="0 0 140 230"
      className={
        "tank " +
        (selected ? "selected " : "") +
        (silo.offline ? "offline" : "")
      }
      aria-hidden="true"
    >
      <defs>
        <linearGradient id={uid + "glass"}>
          <stop stopColor="#5dd5ff" stopOpacity=".18" />
          <stop offset=".25" stopColor="#142e46" stopOpacity=".1" />
          <stop offset=".75" stopColor="#183a55" stopOpacity=".1" />
          <stop offset="1" stopColor="#77d5f2" stopOpacity=".2" />
        </linearGradient>
        <linearGradient id={uid + "fill"} x1="0" y1="0" x2="0" y2="1">
          <stop stopColor={fill} stopOpacity=".85" />
          <stop offset="1" stopColor={fill} stopOpacity=".35" />
        </linearGradient>
        <clipPath id={uid + "clip"}>
          <path d="M26 32Q70 23 114 32V172Q70 181 26 172Z" />
        </clipPath>
      </defs>
      <g
        stroke={selected ? "#a4edff" : "#28718a"}
        strokeWidth={selected ? 1.8 : 1}
      >
        <path
          d="M26 31Q70 19 114 31V172Q70 186 26 172Z"
          fill={"url(#" + uid + "glass)"}
        />
        <g clipPath={"url(#" + uid + "clip)"}>
          <rect
            className="sand-fill"
            x="26"
            y={top}
            width="88"
            height={172 - top}
            fill={"url(#" + uid + "fill)"}
          />
          {percent > 0 && (
            <ellipse
              className="sand-surface"
              cx="70"
              cy={top}
              rx="44"
              ry="7"
              fill={fill}
              fillOpacity=".65"
              stroke={fill}
            />
          )}
        </g>
        <ellipse cx="70" cy="31" rx="44" ry="8" fill="#0a1c2b" />
        <path d="M26 172L70 205L114 172" fill="#10293b" />
        <path
          d="M34 181V221M106 181V221M70 205V214M28 221H41M99 221H112"
          strokeWidth="3"
        />
        <path d="M34 44V160M41 44V160" stroke="#7ce3ff" strokeOpacity=".25" />
        {[60, 88, 116, 144].map((y) => (
          <path
            key={y}
            d={"M108 " + y + "H114"}
            stroke="#7ce3ff"
            strokeOpacity=".5"
          />
        ))}
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
          <h2>
            Side {side}
            <span>{pad.silos.filter((s) => s.side === side).length} SILOS</span>
          </h2>
          <div className="tank-row">
            {pad.silos
              .filter((s) => s.side === side)
              .map((s) => {
                const m = pad.sand_types.find((m) => m.id === s.sand_type_id)!;
                const state = tankState(s),
                  active = multi.length
                    ? multi.includes(s.id)
                    : selected === s.id;
                return (
                  <button
                    type="button"
                    key={s.id}
                    className={"silo-button " + (active ? "is-selected" : "")}
                    aria-label={
                      "Silo " +
                      s.number +
                      ", " +
                      m.name +
                      ", " +
                      pounds(s.on_hand) +
                      " pounds, " +
                      s.stages_left.toFixed(1) +
                      " stages left" +
                      (s.offline ? ", offline" : "")
                    }
                    aria-pressed={active}
                    title={
                      pounds(s.on_hand) +
                      " lb · " +
                      s.stages_left.toFixed(1) +
                      " stages left"
                    }
                    onClick={() => onSelect(s)}
                  >
                    <span className="silo-top">
                      <span className="silo-number">
                        SILO {String(s.number).padStart(2, "0")}
                      </span>
                      <span className={"status-dot " + state} />
                    </span>
                    <Tank silo={s} color={m.color} selected={active} />
                    <strong>
                      {pounds(s.on_hand)} <small>LB</small>
                    </strong>
                    <span className="fill-percent">
                      {s.percent.toFixed(1)}% FULL
                    </span>
                    <span className="mesh-name">
                      <span
                        className="mesh-key"
                        style={{ background: m.color }}
                      />
                      {m.name}
                    </span>
                    <span className={"tank-status " + state}>
                      {multi.includes(s.id)
                        ? "IN PULL"
                        : state === "ready"
                          ? "ONLINE"
                          : state.toUpperCase()}
                    </span>
                  </button>
                );
              })}
          </div>
        </div>
      ))}
    </section>
  );
}
