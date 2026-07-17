export type IucCronStatus = "active" | "paused";

const runtimeState: {
  cronStatus: IucCronStatus;
  lastTickAt: string | null;
} = {
  cronStatus: "paused",
  lastTickAt: null,
};

export function setIucCronStatus(status: IucCronStatus): void {
  runtimeState.cronStatus = status;
}

export function markIucTick(at = new Date()): void {
  runtimeState.lastTickAt = at.toISOString();
}

export function getIucRuntimeStatus(): { cronStatus: IucCronStatus; lastTickAt: string | null } {
  return {
    cronStatus: runtimeState.cronStatus,
    lastTickAt: runtimeState.lastTickAt,
  };
}
