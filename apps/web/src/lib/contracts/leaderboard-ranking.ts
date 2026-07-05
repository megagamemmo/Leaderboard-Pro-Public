import {
  getPublicLeaderboardDivisionName,
  isSystem36PublicLeaderboardPlayer,
  type PublicLeaderboardPlayer,
  type PublicLeaderboardScoringMode,
} from "@/lib/contracts/public-leaderboard";

export type HandicapRating = {
  courseRating?: number | string;
  slopeRating?: number | string;
};

export type LeaderboardRankingBucket = {
  key: string;
  division: string;
  scoringMode: PublicLeaderboardScoringMode;
  isSystem36Division: boolean;
  rows: PublicLeaderboardPlayer[];
};

export type PublicLeaderboardDivisionRanking = {
  division: string;
  scoringMode: PublicLeaderboardScoringMode;
  isSystem36Division: boolean;
  rows: PublicLeaderboardPlayer[];
};

export type PublicLeaderboardRankingResult = {
  rankedRowsByDivisionMode: PublicLeaderboardPlayer[];
  divisionLeaderboards: PublicLeaderboardDivisionRanking[];
};

export type PublicLeaderboardCourseHole = {
  hole: number;
  par: number;
  strokeIndex?: number;
};

export function calculateWhsCourseHandicap(input: {
  handicapIndex: number | string;
  coursePar?: number;
  rating?: HandicapRating;
}) {
  const index = Number(input.handicapIndex);
  if (!Number.isFinite(index)) return null;

  const slope = Number(input.rating?.slopeRating);
  const courseRating = Number(input.rating?.courseRating);
  const coursePar = Number.isFinite(Number(input.coursePar))
    ? Number(input.coursePar)
    : 72;

  if (!Number.isFinite(slope) || slope <= 0 || !Number.isFinite(courseRating)) {
    return Math.round(index);
  }

  return Math.round((index * slope) / 113 + (courseRating - coursePar));
}

export function getSystem36PointsByDiff(diff: number) {
  if (diff <= -1) return 2;
  if (diff === 0) return 2;
  if (diff === 1) return 1;
  return 0;
}

export function getSystem36Points(gross: number, par: number) {
  if (!Number.isFinite(gross) || !Number.isFinite(par)) return 0;
  return getSystem36PointsByDiff(gross - par);
}

function getGrossScoreForHole(row: PublicLeaderboardPlayer, hole: number) {
  const scores = row.holeScores || {};
  const score = Number(scores[String(hole)] ?? scores[hole]);
  return Number.isFinite(score) && score > 0 ? score : null;
}

export function recalculateSystem36PublicLeaderboardRow(
  row: PublicLeaderboardPlayer,
  courseHoles: PublicLeaderboardCourseHole[] = [],
): PublicLeaderboardPlayer {
  if (!isSystem36PublicLeaderboardPlayer(row) || !courseHoles.length) return row;

  let holesPlayed = 0;
  let gross = 0;
  let parPlayed = 0;
  let points = 0;

  for (const holeConfig of courseHoles) {
    const score = getGrossScoreForHole(row, holeConfig.hole);
    const par = Number(holeConfig.par);
    if (!score || !Number.isFinite(par)) continue;

    holesPlayed += 1;
    gross += score;
    parPlayed += par;
    points += getSystem36Points(score, par);
  }

  if (!holesPlayed) return row;

  const system36Handicap = 36 - points;
  const system36Net = gross - system36Handicap;

  return {
    ...row,
    holesPlayed,
    gross,
    handicap: system36Handicap,
    toPar: gross - parPlayed,
    system36Points: points,
    system36Handicap,
    system36Net,
  };
}

export function recalculateSystem36PublicLeaderboardRows(
  rows: PublicLeaderboardPlayer[],
  courseHoles: PublicLeaderboardCourseHole[] = [],
) {
  return rows.map((row) => recalculateSystem36PublicLeaderboardRow(row, courseHoles));
}

export function getPublicLeaderboardRankingMode(
  row: PublicLeaderboardPlayer,
): PublicLeaderboardScoringMode {
  if (row.scoringMode === "stroke_gross") return "stroke_gross";
  return isSystem36PublicLeaderboardPlayer(row) ? "system36" : "handicap";
}

export function getPublicLeaderboardRankingMetric(
  row: PublicLeaderboardPlayer,
  netCutLimit?: number | null,
) {
  const mode = getPublicLeaderboardRankingMode(row);
  let metric: number;

  if (mode === "stroke_gross") {
    metric = Number(row.toPar); // toPar is gross - parPlayed
  } else if (mode === "system36") {
    const holesPlayed = Number(row.holesPlayed) || 0;
    if (holesPlayed === 0) return Number.POSITIVE_INFINITY;
    const points = Number(row.system36Points) || 0;
    const proratedHandicap = (holesPlayed * 2) - points;
    const toPar = Number(row.toPar) || 0;
    metric = toPar - proratedHandicap;
  } else {
    // handicap mode: netToPar = net - parPlayed
    // net = gross - handicapStrokesUsed. toPar = gross - parPlayed.
    // So netToPar = net - gross + toPar.
    const net = Number(row.net) || 0;
    const gross = Number(row.gross) || 0;
    const toPar = Number(row.toPar) || 0;
    metric = net - gross + toPar;
  }

  if (
    typeof netCutLimit === "number" &&
    Number.isFinite(netCutLimit) &&
    mode !== "stroke_gross" &&
    metric < netCutLimit
  ) {
    metric = netCutLimit;
  }

  return Number.isFinite(metric) ? metric : Number.POSITIVE_INFINITY;
}

function getComparableNumber(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : Number.POSITIVE_INFINITY;
}

function getHoleScore(
  row: PublicLeaderboardPlayer,
  hole: number,
  field: "holeScores" | "holeNetScores" = "holeScores",
) {
  const scores = row[field] || {};
  const score = Number(scores[String(hole)] ?? scores[hole]);
  return Number.isFinite(score) && score > 0 ? score : Number.POSITIVE_INFINITY;
}

function getCountbackTotal(
  row: PublicLeaderboardPlayer,
  holes: number[],
  field: "holeScores" | "holeNetScores",
) {
  let total = 0;
  for (const hole of holes) {
    const score = getHoleScore(row, hole, field);
    if (!Number.isFinite(score)) return Number.POSITIVE_INFINITY;
    total += score;
  }
  return total;
}

export function comparePublicLeaderboardCountback(
  left: PublicLeaderboardPlayer,
  right: PublicLeaderboardPlayer,
  field: "holeScores" | "holeNetScores" = "holeScores",
) {
  const groups = [
    [10, 11, 12, 13, 14, 15, 16, 17, 18],
    [13, 14, 15, 16, 17, 18],
    [16, 17, 18],
    [18],
  ];
  for (const holes of groups) {
    const difference =
      getCountbackTotal(left, holes, field) - getCountbackTotal(right, holes, field);
    if (Number.isFinite(difference) && difference !== 0) return difference;
  }
  return 0;
}

function compareReverseHoleScores(
  left: PublicLeaderboardPlayer,
  right: PublicLeaderboardPlayer,
) {
  for (let hole = 18; hole >= 1; hole -= 1) {
    const difference = getHoleScore(left, hole) - getHoleScore(right, hole);
    if (Number.isFinite(difference) && difference !== 0) return difference;
  }
  return 0;
}

function compareStableIdentity(left: PublicLeaderboardPlayer, right: PublicLeaderboardPlayer) {
  const nameDifference = String(left.name || "").localeCompare(String(right.name || ""), "vi");
  if (nameDifference !== 0) return nameDifference;
  return String(left.playerId || left.golferId || "").localeCompare(
    String(right.playerId || right.golferId || ""),
    "vi",
  );
}

export function comparePublicLeaderboardScoreOnly(
  left: PublicLeaderboardPlayer,
  right: PublicLeaderboardPlayer,
  allFinished: boolean,
  netCutLimit?: number | null,
) {
  const leftMetric = getPublicLeaderboardRankingMetric(left, netCutLimit);
  const rightMetric = getPublicLeaderboardRankingMetric(right, netCutLimit);
  const metricComparison = leftMetric - rightMetric;
  if (metricComparison !== 0 && !Number.isNaN(metricComparison)) return metricComparison;

  if (allFinished) {
    if (
      getPublicLeaderboardRankingMode(left) === "handicap" &&
      getPublicLeaderboardRankingMode(right) === "handicap"
    ) {
      const netCountbackDifference = comparePublicLeaderboardCountback(
        left,
        right,
        "holeNetScores",
      );
      if (netCountbackDifference !== 0) return netCountbackDifference;
    }

    const leftGross = getComparableNumber(left.gross);
    const rightGross = getComparableNumber(right.gross);
    if (leftGross !== rightGross) return leftGross - rightGross;

    const countbackDifference = comparePublicLeaderboardCountback(left, right);
    if (countbackDifference !== 0) return countbackDifference;

    const reverseHoleDifference = compareReverseHoleScores(left, right);
    if (reverseHoleDifference !== 0) return reverseHoleDifference;
  } else {
    const leftHoles = Number(left.holesPlayed) || 0;
    const rightHoles = Number(right.holesPlayed) || 0;
    if (rightHoles !== leftHoles) {
      return rightHoles - leftHoles;
    }
  }

  return 0; // Tied
}

export function comparePublicLeaderboardRows(
  left: PublicLeaderboardPlayer,
  right: PublicLeaderboardPlayer,
  allFinished: boolean = false,
  netCutLimit?: number | null,
) {
  const scoreComparison = comparePublicLeaderboardScoreOnly(left, right, allFinished, netCutLimit);
  if (scoreComparison !== 0) return scoreComparison;
  return compareStableIdentity(left, right);
}

export function comparePublicLeaderboardBestGross(
  left: PublicLeaderboardPlayer,
  right: PublicLeaderboardPlayer,
) {
  if (right.holesPlayed !== left.holesPlayed) return right.holesPlayed - left.holesPlayed;

  const grossDifference = getComparableNumber(left.gross) - getComparableNumber(right.gross);
  if (grossDifference !== 0) return grossDifference;

  const countbackDifference = comparePublicLeaderboardCountback(left, right);
  if (countbackDifference !== 0) return countbackDifference;

  const reverseHoleDifference = compareReverseHoleScores(left, right);
  if (reverseHoleDifference !== 0) return reverseHoleDifference;

  return compareStableIdentity(left, right);
}

export function getPublicLeaderboardPlayerKey(row: PublicLeaderboardPlayer) {
  const explicitId = String(row.playerId || row.golferId || "").trim();
  if (explicitId) return explicitId;
  return `${getPublicLeaderboardDivisionName(row)}:${String(row.name || "").trim()}`;
}

export function getPublicLeaderboardBestGrossWinner(rows: PublicLeaderboardPlayer[]) {
  return [...rows]
    .filter((row) => row.holesPlayed > 0 && Number.isFinite(Number(row.gross)))
    .sort(comparePublicLeaderboardBestGross)[0] || null;
}

export function rankPublicLeaderboardRows(
  rows: PublicLeaderboardPlayer[],
  courseHoles: PublicLeaderboardCourseHole[] = [],
  netCutLimit?: number | null,
) {
  const recalculated = recalculateSystem36PublicLeaderboardRows(rows, courseHoles);
  const activeRows = recalculated.filter(r => (r.holesPlayed || 0) > 0);
  const allFinished = activeRows.length > 0 && activeRows.every(r => r.holesPlayed === 18);

  const sorted = recalculated.sort((a, b) => comparePublicLeaderboardRows(a, b, allFinished, netCutLimit));

  let currentRank = 1;
  return sorted.map((row, index) => {
    if (index > 0) {
      if (comparePublicLeaderboardScoreOnly(sorted[index - 1], row, allFinished, netCutLimit) !== 0) {
        currentRank = index + 1;
      }
    }
    
    const isTiedWithPrev = index > 0 && comparePublicLeaderboardScoreOnly(sorted[index - 1], row, allFinished, netCutLimit) === 0;
    const isTiedWithNext = index < sorted.length - 1 && comparePublicLeaderboardScoreOnly(row, sorted[index + 1], allFinished, netCutLimit) === 0;
    const isTied = isTiedWithPrev || isTiedWithNext;
    
    return {
      ...row,
      placementRank: currentRank,
      rank: (isTied && !allFinished) ? `T${currentRank}` : currentRank,
    };
  });
}

export function getPublicLeaderboardRankingBucketKey(row: PublicLeaderboardPlayer) {
  const division = getPublicLeaderboardDivisionName(row) || "unassigned";
  const mode = getPublicLeaderboardRankingMode(row);
  return `${division.toLowerCase()}:${mode}`;
}

export function buildPublicLeaderboardRankingBuckets(
  rows: PublicLeaderboardPlayer[],
  courseHoles: PublicLeaderboardCourseHole[] = [],
  netCutLimit?: number | null,
): LeaderboardRankingBucket[] {
  const buckets = new Map<string, PublicLeaderboardPlayer[]>();

  recalculateSystem36PublicLeaderboardRows(rows, courseHoles).forEach((row) => {
    const key = getPublicLeaderboardRankingBucketKey(row);
    buckets.set(key, [...(buckets.get(key) || []), row]);
  });

  return Array.from(buckets.entries()).map(([key, bucketRows]) => {
    const first = bucketRows[0];
    const scoringMode = getPublicLeaderboardRankingMode(first);
    return {
      key,
      division: getPublicLeaderboardDivisionName(first) || "Chưa có bảng",
      scoringMode,
      isSystem36Division: scoringMode === "system36",
      rows: rankPublicLeaderboardRows(bucketRows, courseHoles, netCutLimit),
    };
  });
}

export function buildPublicLeaderboardDivisionLeaderboards(
  rows: PublicLeaderboardPlayer[],
  courseHoles: PublicLeaderboardCourseHole[] = [],
  netCutLimit?: number | null,
): PublicLeaderboardDivisionRanking[] {
  return buildPublicLeaderboardRankingBuckets(rows, courseHoles, netCutLimit).map((bucket) => ({
    division: bucket.division,
    scoringMode: bucket.scoringMode,
    isSystem36Division: bucket.isSystem36Division,
    rows: bucket.rows,
  }));
}

export function buildPublicLeaderboardRankingResult(
  rows: PublicLeaderboardPlayer[],
  courseHoles: PublicLeaderboardCourseHole[] = [],
  netCutLimit?: number | null,
): PublicLeaderboardRankingResult {
  const divisionLeaderboards = buildPublicLeaderboardDivisionLeaderboards(rows, courseHoles, netCutLimit);
  return {
    rankedRowsByDivisionMode: divisionLeaderboards.flatMap((division) => division.rows),
    divisionLeaderboards,
  };
}
