type Meta = Record<string, unknown>;

function emit(level: "info" | "warn" | "error", msg: string, meta?: Meta): void {
  const line = JSON.stringify({ level, msg, time: new Date().toISOString(), ...meta });
  if (level === "error") console.error(line);
  else console.log(line);
}

export const log = {
  info: (msg: string, meta?: Meta) => emit("info", msg, meta),
  warn: (msg: string, meta?: Meta) => emit("warn", msg, meta),
  error: (msg: string, meta?: Meta) => emit("error", msg, meta),
};
