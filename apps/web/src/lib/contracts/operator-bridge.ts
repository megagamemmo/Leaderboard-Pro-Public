export type BridgeScoringMode = "handicap" | "system36" | "stroke_gross";

export type OperatorBridgeFlight = {
  name: string;
  division?: string;
  min?: number;
  max?: number;
  gender?: string;
  scoringMode?: BridgeScoringMode | string;
  isSystem36?: boolean;
  isSystem36Division?: boolean;
};

export type OperatorBridgePlayer = {
  playerId: string;
  golferId?: string;
  name: string;
  division?: string;
  flight?: string;
  gender?: string;
  handicap?: number;
  handicapIndex?: number | string;
  scoringMode?: BridgeScoringMode | string;
  isSystem36Division?: boolean;
};

export type OperatorBridgeFlightConfig = {
  locked: boolean;
  source: "leaderboard_pro";
  genderMode: "combined" | "separate";
  allowDivisionJump: boolean;
  allowFlightJump: boolean;
  fixedDivisionName: string;
  fixedFlightName: string;
  s36DivisionNames: string[];
  divisions: OperatorBridgeFlight[];
  flights: OperatorBridgeFlight[];
};

function normalizeGender(value?: string) {
  const normalized = String(value || "").trim().toLowerCase();
  if (["male", "men", "nam", "m"].includes(normalized)) return "male";
  if (["female", "women", "nu", "nữ", "f"].includes(normalized)) return "female";
  return "";
}

function normalizeScoringMode(value?: string): BridgeScoringMode {
  const mode = String(value || "").trim().toLowerCase();
  if (["system36", "s36"].includes(mode)) return "system36";
  if (["stroke_gross"].includes(mode)) return "stroke_gross";
  return "handicap";
}

export function isOperatorBridgeSystem36Flight(flight: OperatorBridgeFlight) {
  return (
    normalizeScoringMode(flight.scoringMode) === "system36" ||
    flight.isSystem36 === true ||
    flight.isSystem36Division === true
  );
}

export function getOperatorBridgeDivisionName(value: {
  division?: string;
  flight?: string;
  name?: string;
}) {
  return String(value.division || value.flight || value.name || "").trim();
}

export function buildOperatorBridgeSystem36FlightConfig(input: {
  flights?: OperatorBridgeFlight[];
  fixedDivisionName?: string;
  fixedFlightName?: string;
  allowDivisionJump?: boolean;
  allowFlightJump?: boolean;
  genderMode?: string;
  locked?: boolean;
}): OperatorBridgeFlightConfig {
  const flights = (input.flights || [])
    .filter(isOperatorBridgeSystem36Flight)
    .map((flight) => {
      const name = getOperatorBridgeDivisionName(flight);
      return {
        name,
        division: name,
        min: Number.isFinite(Number(flight.min)) ? Number(flight.min) : 0,
        max: Number.isFinite(Number(flight.max)) ? Number(flight.max) : 36,
        gender: normalizeGender(flight.gender),
        scoringMode: "system36" as const,
        isSystem36: true,
        isSystem36Division: true,
      };
    })
    .filter((flight) => Boolean(flight.name));
  const requestedFixed = String(
    input.fixedDivisionName || input.fixedFlightName || "",
  ).trim();
  const fixedDivisionName = flights.some((flight) => flight.name === requestedFixed)
    ? requestedFixed
    : flights[0]?.name || "";
  const allowDivisionJump = Boolean(
    input.allowDivisionJump ?? input.allowFlightJump ?? false,
  );

  return {
    locked: input.locked !== false,
    source: "leaderboard_pro",
    genderMode: input.genderMode === "separate" ? "separate" : "combined",
    allowDivisionJump,
    allowFlightJump: allowDivisionJump,
    fixedDivisionName,
    fixedFlightName: fixedDivisionName,
    s36DivisionNames: flights.map((flight) => flight.name),
    divisions: flights,
    flights,
  };
}

export function buildClaimableOperatorBridgeRoster(
  players: OperatorBridgePlayer[],
) {
  return players.filter((player) => {
    if (!player.playerId || !player.name) return false;
    return (
      normalizeScoringMode(player.scoringMode) === "system36" ||
      player.isSystem36Division === true
    );
  });
}
