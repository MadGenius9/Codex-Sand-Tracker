import type { Pad } from "./types";
let activePad = 1;
export function setActivePad(id: number) {
  activePad = id;
}
export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}
export async function request<T = Pad>(
  path: string,
  body?: unknown,
  method = "POST",
  padId = activePad,
): Promise<T> {
  const res = await fetch(
    `/api/${path}?pad_id=${padId}`,
    body === undefined
      ? undefined
      : {
          method,
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        },
  );
  const data = await res.json();
  if (!res.ok) throw new ApiError(data.error ?? "Request failed.", res.status);
  return data;
}
export function today() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
