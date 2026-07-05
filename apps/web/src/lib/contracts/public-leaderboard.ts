export type PublicLeaderboardScoringMode = "handicap" | "system36" | "stroke_gross";

export type PublicLeaderboardAward = "best_gross";

export type PublicFinalPodium = {
  key: string;
  label: string;
  scope: "division" | "gender";
  rank1PlayerId?: string;
  rank2PlayerId?: string;
  rank3PlayerId?: string;
};

export type PublicFinalTechnicalAward = {
  group: "combined" | "male" | "female";
  slot?: number;
  playerId: string;
  hole?: string;
  distance?: string;
};

export type PublicFinalHoleInOneAward = {
  slot?: number;
  playerId: string;
  hole: string;
  prizes: string[];
};

export type PublicFinalSpecialAward = {
  id: string;
  name: string;
  playerId: string;
  note?: string;
};

export type PublicFinalResults = {
  status: "published";
  publishedAt: string;
  rankingScope: "division" | "gender";
  netCutLimit?: number | null;
  netCutAppliedPlayerIds?: string[];
  bestGrossPlayerId?: string;
  podiums: PublicFinalPodium[];
  technicalGenderMode: "combined" | "separate";
  technicalAwardCounts?: {
    longestDrive?: number;
    nearestToPin?: number;
    nearToTheLine?: number;
    longestPutt?: number;
  };
  longestDrive: PublicFinalTechnicalAward[];
  nearestToPin: PublicFinalTechnicalAward[];
  nearToTheLine: PublicFinalTechnicalAward[];
  longestPutt: PublicFinalTechnicalAward[];
  holeInOneCount?: number;
  holeInOneAwards: PublicFinalHoleInOneAward[];
  specialAwards: PublicFinalSpecialAward[];
};

export type PublicLeaderboardPlayer = {
  rank: number | string;
  placementRank?: number;
  award?: PublicLeaderboardAward;
  playerId: string;
  golferId?: string;
  name: string;
  division?: string;
  flight?: string;
  registeredDivision?: string;
  dynamicDivision?: string;
  flightGroup?: string;
  handicap?: number;
  handicapIndex?: number | string;
  courseHandicap?: number;
  scoringMode?: PublicLeaderboardScoringMode;
  isSystem36Division?: boolean;
  holesPlayed: number;
  gross?: number;
  net?: number;
  toPar?: number;
  system36Points?: number;
  system36Handicap?: number;
  system36Net?: number;
  holeScores?: Record<string, number>;
  holeNetScores?: Record<string, number>;
};

export type PublicLeaderboardSync = {
  scorePollMs?: number;
  snapshotAutoPublishMs?: number;
  publicRefreshMs?: number;
  publicPollMs?: number;
  simulatorRefreshMs?: number;
  liveNotificationDisplayMs?: number;
  liveNotificationMaxAgeMs?: number;
  liveNotificationMaxItems?: number;
  liveNotificationRetentionMode?: "time" | "count";
};

export type PublicLiveNotification = {
  id: string;
  fingerprint: string;
  createdAt: number;
  snapshotTime: number;
  tone: "ace" | "brilliant" | "damage" | "rank";
  trend: "up" | "down" | "steady";
  severity: number;
  playerName: string;
  division: string;
  hole: number;
  par: number;
  strokes: number;
  holeDiff: number;
  term: string;
  headlinePhrase: string;
  holesPlayed: number;
  gross?: number;
  net?: number;
  rankBefore?: number;
  rankAfter?: number;
};

export type PublicLeaderboardSimulator = {
  id?: string;
  turn?: number;
  localOnly?: boolean;
  liveSeconds?: number;
  debugRefreshMs?: number;
};

export type PublicLeaderboardState = {
  version: number;
  shareSlug: string;
  tournament: {
    id: string;
    name: string;
    operatorName?: string;
    courseName?: string;
    startHole?: number;
    scoringFormat?: string;
    updatedAt?: string;
  };
  course?: {
    holes?: Array<{
      hole: number;
      par: number;
      strokeIndex?: number;
    }>;
  };
  leaderboard: PublicLeaderboardPlayer[];
  divisionLeaderboards?: Array<{
    division: string;
    scoringMode?: PublicLeaderboardScoringMode;
    isSystem36Division?: boolean;
    rows: PublicLeaderboardPlayer[];
  }>;
  liveNotifications?: PublicLiveNotification[];
  finalResults?: PublicFinalResults;
  sync?: PublicLeaderboardSync;
  simulator?: PublicLeaderboardSimulator;
  metrics?: {
    players?: number;
    confirmed?: number;
    conflicts?: number;
  };
};

export type PublicLeaderboardFetchResult =
  | { ok: true; snapshot: PublicLeaderboardState; updatedAt?: string }
  | { ok: false; status: number; error: string };

export function getPublicLeaderboardDivisionName(player: PublicLeaderboardPlayer) {
  return String(player.division || player.flight || "").trim();
}

export function isSystem36PublicLeaderboardPlayer(player: PublicLeaderboardPlayer) {
  return player.scoringMode === "system36" || player.isSystem36Division === true;
}

export function isHandicapPublicLeaderboardPlayer(player: PublicLeaderboardPlayer) {
  return !isSystem36PublicLeaderboardPlayer(player);
}
