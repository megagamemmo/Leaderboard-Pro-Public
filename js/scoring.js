(function () {
  function clampInt(value, min, max, fallback = min) {
    const parsed = parseInt(String(value).replace(/[^\d-]/g, ""), 10);
    if (Number.isNaN(parsed)) return fallback;
    return Math.max(min, Math.min(max, parsed));
  }

  function clampNumber(value, min, max, fallback = 0) {
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) return fallback;
    return Math.max(min, Math.min(max, parsed));
  }

  function buildPlaySequence(startHole = 1) {
    const start = clampInt(startHole, 1, 18, 1);
    const sequence = [];
    for (let hole = start; hole <= 18; hole += 1) sequence.push(hole);
    for (let hole = 1; hole < start; hole += 1) sequence.push(hole);
    return sequence;
  }

  function getHoleConfig(state, hole) {
    return state.course.holes.find(item => item.hole === hole) || { hole, par: 4, strokeIndex: hole };
  }

  function getScoreRecord(state, playerId, hole) {
    return state.scores[playerId]?.[hole] || {};
  }

  function getPlayerDivision(player = {}) {
    return player.division || player.flight || "";
  }

  function normalizeGender(value = "") {
    const key = String(value || "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .trim()
      .toLowerCase();
    if (["male", "men", "nam", "m"].includes(key)) return "male";
    if (["female", "women", "woman", "nu", "nữ", "f"].includes(key)) return "female";
    return "";
  }

  function isFlightSystem36(flight = {}, fallback = true) {
    flight = flight || {};
    const mode = String(flight.scoringMode || flight.scoring_mode || flight.mode || "").trim().toLowerCase();
    if (["system36", "s36", "tour_system36", "toursystem36"].includes(mode)) return true;
    if (["handicap", "whs", "stroke_net", "net", "gross_net", "stroke_gross"].includes(mode)) return false;
    if (typeof flight.isSystem36 === "boolean") return flight.isSystem36;
    if (typeof flight.system36 === "boolean") return flight.system36;
    if (typeof flight.s36 === "boolean") return flight.s36;
    return !!fallback;
  }

  function getFlightConfigByDivision(state, division = "") {
    const target = String(division || "").trim().toLowerCase();
    if (!target) return null;
    return (Array.isArray(state.flightConfig?.flights) ? state.flightConfig.flights : [])
      .find(flight => String(flight?.name || "").trim().toLowerCase() === target) || null;
  }

  function getDivisionScoringMode(state, division = "") {
    const flight = getFlightConfigByDivision(state, division);
    if (flight) {
      if (flight.scoringMode === "stroke_gross") return "stroke_gross";
      return isFlightSystem36(flight, false) ? "system36" : "handicap";
    }
    const target = String(division || "").trim().toLowerCase();
    const rows = [
      ...(Array.isArray(state.players) ? state.players : []),
      ...(Array.isArray(state.operator?.publishedRosterSnapshot) ? state.operator.publishedRosterSnapshot : [])
    ];
    const hasSystem36Marker = rows.some(row => {
      const rowDivision = String(row?.division || row?.flight || "").trim().toLowerCase();
      if (!target || rowDivision !== target) return false;
      const mode = String(row?.scoringMode || row?.scoring_mode || "").trim().toLowerCase();
      return mode === "system36" || row?.isSystem36Division === true || row?.isSystem36 === true;
    });
    return hasSystem36Marker ? "system36" : "handicap";
  }

  function getDivisionScoringMeta(state, division = "") {
    const scoringMode = getDivisionScoringMode(state, division);
    return {
      scoringMode,
      isSystem36Division: scoringMode === "system36"
    };
  }

  function getDynamicSystem36Division(state, row = {}, player = {}) {
    if (!state.flightConfig?.allowFlightJump) return "";
    if (row.scoringMode !== "system36") return "";
    if (!Number.isFinite(row.system36Handicap)) return "";

    const playerGender = normalizeGender(player.gender || row.gender || "");
    const flights = (Array.isArray(state.flightConfig?.flights) ? state.flightConfig.flights : [])
      .filter(flight => isFlightSystem36(flight, false));
    const genderMatched = playerGender
      ? flights.filter(flight => normalizeGender(flight.gender || "") === playerGender)
      : flights.filter(flight => !normalizeGender(flight.gender || ""));
    const pool = genderMatched.length ? genderMatched : flights;
    const matched = pool.find(flight => {
      const min = Number(flight.handicapMin ?? flight.system36Min ?? flight.min);
      const max = Number(flight.handicapMax ?? flight.system36Max ?? flight.max);
      return Number.isFinite(min) && Number.isFinite(max)
        && row.system36Handicap >= Math.min(min, max)
        && row.system36Handicap <= Math.max(min, max);
    });
    return matched?.name || "";
  }

  function getOfficialGross(record = {}) {
    const confirmed = Number(record.confirmedGross);
    if (Number.isFinite(confirmed) && confirmed > 0) return confirmed;
    return null;
  }

  function getDisplayGross(record = {}, options = {}) {
    const official = getOfficialGross(record);
    if (official) return official;
    if (!options.includeStaging) return null;

    const operator = Number(record.operatorGross);
    if (Number.isFinite(operator) && operator > 0) return operator;
    const user = Number(record.userGross);
    if (Number.isFinite(user) && user > 0) return user;
    return null;
  }

  function getDisplaySource(record = {}, options = {}) {
    if (getOfficialGross(record)) return "confirmed";
    if (!options.includeStaging) return "";
    const operator = Number(record.operatorGross);
    if (Number.isFinite(operator) && operator > 0) return "operator";
    const user = Number(record.userGross);
    if (Number.isFinite(user) && user > 0) return "toursystem36";
    return "";
  }

  function system36Points(gross, par) {
    if (!Number.isFinite(gross) || !Number.isFinite(par)) return 0;
    const diff = gross - par;
    if (diff <= -1) return 2;
    if (diff === 0) return 2;
    if (diff === 1) return 1;
    return 0;
  }

  function handicapStrokeForHole(handicap, strokeIndex) {
    const rounded = Math.round(handicap);
    if (!rounded) return 0;
    const direction = rounded > 0 ? 1 : -1;
    const absolute = Math.abs(rounded);
    const base = Math.floor(absolute / 18);
    const extra = absolute % 18;
    const si = clampInt(strokeIndex, 1, 18, 18);
    return direction * (base + (si <= extra ? 1 : 0));
  }

  function summarizePlayer(state, player, options = {}) {
    const handicap = clampNumber(player.courseHandicap ?? player.handicap, -10, 54, 0);
    const division = getPlayerDivision(player);
    const scoringMode = getDivisionScoringMode(state, division);
    let holesPlayed = 0;
    let gross = 0;
    let parPlayed = 0;
    let handicapStrokesUsed = 0;
    let system36Total = 0;
    const holeScores = {};
    const holeNetScores = {};
    const holeSources = {};

    for (const holeConfig of state.course.holes) {
      const record = getScoreRecord(state, player.id, holeConfig.hole);
      const grossForDisplay = getDisplayGross(record, options);
      holeScores[holeConfig.hole] = grossForDisplay;
      holeSources[holeConfig.hole] = getDisplaySource(record, options);
      if (!grossForDisplay) continue;
      holesPlayed += 1;
      gross += grossForDisplay;
      parPlayed += holeConfig.par;
      const handicapStrokes = handicapStrokeForHole(handicap, holeConfig.strokeIndex);
      handicapStrokesUsed += handicapStrokes;
      holeNetScores[holeConfig.hole] = grossForDisplay - handicapStrokes;
      system36Total += system36Points(grossForDisplay, holeConfig.par);
    }

    const toPar = holesPlayed ? gross - parPlayed : null;
    const net = holesPlayed ? gross - handicapStrokesUsed : null;
    const system36Handicap = holesPlayed ? 36 - system36Total : null;
    const system36Net = holesPlayed ? gross - system36Handicap : null;

    const row = {
      playerId: player.id,
      golferId: player.golferId || player.vgaId || player.id,
      vgaId: player.vgaId || "",
      name: player.name || "Golfer",
      registeredDivision: division,
      division,
      flight: division,
      flightGroup: player.flightGroup || player.group || "",
      startHole: player.startHole || "",
      gender: player.gender || "",
      handicap,
      handicapIndex: player.handicapIndex ?? "",
      courseHandicap: handicap,
      scoringMode,
      holesPlayed,
      gross,
      parPlayed,
      toPar,
      net,
      handicapStrokesUsed,
      system36Points: system36Total,
      system36Handicap,
      system36Net,
      holeScores,
      holeNetScores,
      holeSources
    };
    const dynamicDivision = getDynamicSystem36Division(state, row, player);
    if (dynamicDivision) {
      row.division = dynamicDivision;
      row.flight = dynamicDivision;
      row.dynamicDivision = dynamicDivision;
    }
    return row;
  }

  function compareLeaderboardNumber(left, right) {
    const leftNumber = Number(left);
    const rightNumber = Number(right);
    const leftMissing = left === null || left === undefined || !Number.isFinite(leftNumber);
    const rightMissing = right === null || right === undefined || !Number.isFinite(rightNumber);
    if (leftMissing && rightMissing) return 0;
    if (leftMissing) return 1;
    if (rightMissing) return -1;
    return leftNumber - rightNumber;
  }

  function sumLeaderboardHoles(row, field, holes) {
    const scores = row[field] || {};
    let total = 0;
    for (const hole of holes) {
      const score = Number(scores[hole] ?? scores[String(hole)]);
      if (!Number.isFinite(score) || score <= 0) return null;
      total += score;
    }
    return total;
  }

  function compareLeaderboardCountback(left, right, field = "holeScores") {
    const groups = [
      [10, 11, 12, 13, 14, 15, 16, 17, 18],
      [13, 14, 15, 16, 17, 18],
      [16, 17, 18],
      [18]
    ];
    for (const holes of groups) {
      const comparison = compareLeaderboardNumber(
        sumLeaderboardHoles(left, field, holes),
        sumLeaderboardHoles(right, field, holes)
      );
      if (comparison !== 0) return comparison;
    }
    return 0;
  }

  function compareReverseHoleScores(left, right) {
    for (let hole = 18; hole >= 1; hole -= 1) {
      const comparison = compareLeaderboardNumber(
        left.holeScores?.[hole] ?? left.holeScores?.[String(hole)],
        right.holeScores?.[hole] ?? right.holeScores?.[String(hole)]
      );
      if (comparison !== 0) return comparison;
    }
    return 0;
  }

  function compareStablePlayerIdentity(left, right) {
    return String(left.name || "").localeCompare(String(right.name || ""), "vi")
      || String(left.playerId || left.golferId || "").localeCompare(
        String(right.playerId || right.golferId || ""),
        "vi"
      );
  }

  function compareLeaderboardScoreOnly(left, right, allFinished) {
    const getMetric = (row) => {
      if (row.scoringMode === "stroke_gross") return row.toPar;
      if (row.scoringMode === "system36") {
        const holesPlayed = Number(row.holesPlayed) || 0;
        if (holesPlayed === 0) return Number.POSITIVE_INFINITY;
        const points = Number(row.system36Points) || 0;
        const proratedHandicap = (holesPlayed * 2) - points;
        const toPar = Number(row.toPar) || 0;
        return toPar - proratedHandicap;
      }
      // handicap mode: netToPar = net - parPlayed = net - gross + toPar
      const net = Number(row.net) || 0;
      const gross = Number(row.gross) || 0;
      const toPar = Number(row.toPar) || 0;
      return net - gross + toPar;
    };

    const leftMetric = getMetric(left);
    const rightMetric = getMetric(right);
    const metricComparison = compareLeaderboardNumber(leftMetric, rightMetric);
    if (metricComparison !== 0) return metricComparison;

    if (allFinished) {
      if (left.scoringMode !== "system36" && right.scoringMode !== "system36" && left.scoringMode !== "stroke_gross" && right.scoringMode !== "stroke_gross") {
        const netCountback = compareLeaderboardCountback(left, right, "holeNetScores");
        if (netCountback !== 0) return netCountback;
      }

      const grossComparison = compareLeaderboardNumber(left.gross, right.gross);
      if (grossComparison !== 0) return grossComparison;

      const grossCountback = compareLeaderboardCountback(left, right, "holeScores");
      if (grossCountback !== 0) return grossCountback;

      const reverseHoleComparison = compareReverseHoleScores(left, right);
      if (reverseHoleComparison !== 0) return reverseHoleComparison;
    } else {
      if (right.holesPlayed !== left.holesPlayed) return right.holesPlayed - left.holesPlayed;
    }

    return 0; // Tied
  }

  function compareLeaderboardRows(left, right, allFinished = false) {
    const scoreDiff = compareLeaderboardScoreOnly(left, right, allFinished);
    if (scoreDiff !== 0) return scoreDiff;
    return compareStablePlayerIdentity(left, right);
  }

  function compareBestGrossRows(left, right) {
    if (right.holesPlayed !== left.holesPlayed) return right.holesPlayed - left.holesPlayed;
    const grossComparison = compareLeaderboardNumber(left.gross, right.gross);
    if (grossComparison !== 0) return grossComparison;
    const countbackComparison = compareLeaderboardCountback(left, right, "holeScores");
    if (countbackComparison !== 0) return countbackComparison;
    const reverseHoleComparison = compareReverseHoleScores(left, right);
    if (reverseHoleComparison !== 0) return reverseHoleComparison;
    return compareStablePlayerIdentity(left, right);
  }

  function buildLeaderboard(state, options = {}) {
    const requestedDivision = options.division || "";
    const eligiblePlayers = state.players.filter(player => player.awardEligible !== false);
    const rows = eligiblePlayers
      .map(player => summarizePlayer(state, player, options))
      .filter(row => !requestedDivision || row.division === requestedDivision);
      
    const activeRows = rows.filter(r => r.holesPlayed > 0);
    const allFinished = activeRows.length > 0 && activeRows.every(r => r.holesPlayed === 18);

    rows.sort((a, b) => compareLeaderboardRows(a, b, allFinished));

    let currentRank = 1;
    for (let i = 0; i < rows.length; i++) {
      if (i > 0) {
        if (compareLeaderboardScoreOnly(rows[i - 1], rows[i], allFinished) !== 0) {
          currentRank = i + 1;
        }
      }
      
      const isTiedWithPrev = i > 0 && compareLeaderboardScoreOnly(rows[i - 1], rows[i], allFinished) === 0;
      const isTiedWithNext = i < rows.length - 1 && compareLeaderboardScoreOnly(rows[i], rows[i + 1], allFinished) === 0;
      const isTied = isTiedWithPrev || isTiedWithNext;
      
      rows[i].placementRank = currentRank;
      rows[i].rank = (isTied && !allFinished) ? `T${currentRank}` : currentRank;
    }

    return rows;
  }

  function countMetrics(state) {
    let confirmed = 0;
    let conflicts = 0;
    Object.values(state.scores).forEach(playerScores => {
      Object.values(playerScores).forEach(record => {
        if (getOfficialGross(record)) confirmed += 1;
        if (record.conflictStatus === "conflict") conflicts += 1;
      });
    });
    return {
      players: state.players.length,
      confirmed,
      conflicts
    };
  }

  function readPositiveMs(value, fallback) {
    const parsed = Number(value);
    return Number.isFinite(parsed) && parsed > 0 ? Math.trunc(parsed) : fallback;
  }

  function buildPublicSnapshotSync(state) {
    const operator = state.operator || {};
    const scorePollMs = readPositiveMs(
      operator.scorePollMs,
      readPositiveMs(window.ENV?.OPERATOR_SCORE_POLL_MS, 10000)
    );
    const snapshotAutoPublishMs = readPositiveMs(
      operator.snapshotAutoPublishMs,
      readPositiveMs(window.ENV?.OPERATOR_SNAPSHOT_AUTO_PUBLISH_MS, 300000)
    );
    const publicRefreshMs = readPositiveMs(operator.publicRefreshMs, snapshotAutoPublishMs);
    const retentionMode = operator.liveNotificationRetentionMode === "count" ? "count" : "time";
    const maxAgeMinutes = clampInt(operator.liveNotificationMaxAgeMinutes, 1, 360, 45);
    const maxItems = clampInt(operator.liveNotificationMaxItems, 4, 48, 20);
    return {
      scorePollMs,
      snapshotAutoPublishMs,
      publicRefreshMs,
      publicPollMs: publicRefreshMs,
      liveNotificationDisplayMs: 3800,
      liveNotificationRetentionMode: retentionMode,
      liveNotificationMaxAgeMs: maxAgeMinutes * 60 * 1000,
      liveNotificationMaxItems: maxItems
    };
  }

  const LIVE_NOTIFICATION_DAMAGE_PHRASES = ["trượt chân", "sảy chân", "mất nhịp", "hụt bước", "chững lại", "vấp nhịp"];
  const LIVE_NOTIFICATION_BRILLIANT_PHRASES = ["xuất thần", "bứt phá", "tỏa sáng", "lên tiếng", "ghi dấu", "bùng nổ"];
  const LIVE_NOTIFICATION_ACE_PHRASES = ["ghi dấu khoảnh khắc hiếm", "tạo dấu ấn đặc biệt", "làm bùng sáng bảng điểm"];
  const LIVE_NOTIFICATION_RANK_PHRASES = ["làm đổi hạng", "kéo bảng điểm chuyển động", "tạo biến động thứ hạng"];

  function pickLiveNotificationPhrase(values, seed) {
    const text = String(seed || "");
    let hash = 0;
    for (let index = 0; index < text.length; index += 1) {
      hash = (hash * 31 + text.charCodeAt(index)) | 0;
    }
    return values[Math.abs(hash) % values.length] || values[0] || "";
  }

  function getLiveNotificationHeadlinePhrase(tone, seed) {
    if (tone === "ace") return pickLiveNotificationPhrase(LIVE_NOTIFICATION_ACE_PHRASES, seed);
    if (tone === "damage") return pickLiveNotificationPhrase(LIVE_NOTIFICATION_DAMAGE_PHRASES, seed);
    if (tone === "rank") return pickLiveNotificationPhrase(LIVE_NOTIFICATION_RANK_PHRASES, seed);
    return pickLiveNotificationPhrase(LIVE_NOTIFICATION_BRILLIANT_PHRASES, seed);
  }

  function getSnapshotRowKey(row = {}) {
    return String(row.playerId || row.golferId || row.name || "").trim();
  }

  function getSnapshotScoreValue(row = {}, hole) {
    const scores = row.holeScores || {};
    return scores[String(hole)] ?? scores[hole] ?? null;
  }

  function getSnapshotCourseHoles(snapshot = {}) {
    return Array.isArray(snapshot.course?.holes) && snapshot.course.holes.length
      ? snapshot.course.holes
      : Array.from({ length: 18 }, (_, index) => ({ hole: index + 1, par: 4 }));
  }

  function getSnapshotCoursePar(snapshot = {}, hole) {
    return getSnapshotCourseHoles(snapshot).find(item => Number(item.hole) === Number(hole))?.par || 4;
  }

  function getSnapshotUpdatedAtMs(snapshot = {}, fallback = "") {
    const value = fallback || snapshot.tournament?.updatedAt || snapshot.updatedAt || "";
    const time = new Date(value).getTime();
    return Number.isFinite(time) ? time : Date.now();
  }

  function getSnapshotPlacementRank(row = {}) {
    if (typeof row.placementRank === "number") return row.placementRank;
    if (typeof row.rank === "number") return row.rank;
    const match = String(row.rank || "").match(/\d+/);
    return match ? parseInt(match[0], 10) : 0;
  }

  function getSnapshotRankMap(snapshot = {}) {
    const rankMap = new Map();
    const groups = Array.isArray(snapshot.divisionLeaderboards) && snapshot.divisionLeaderboards.length
      ? snapshot.divisionLeaderboards
      : [{ rows: Array.isArray(snapshot.leaderboard) ? snapshot.leaderboard : [] }];
    groups.forEach(group => {
      (Array.isArray(group.rows) ? group.rows : []).forEach(row => {
        const key = getSnapshotRowKey(row);
        const rank = getSnapshotPlacementRank(row);
        if (key && rank > 0) rankMap.set(key, rank);
      });
    });
    return rankMap;
  }

  function getSnapshotScoredHoleDiffs(row = {}, snapshot = {}, excludeHole) {
    return getSnapshotCourseHoles(snapshot)
      .filter(({ hole }) => Number(hole) !== Number(excludeHole))
      .map(({ hole, par }) => {
        const score = Number(getSnapshotScoreValue(row, hole));
        return Number.isFinite(score) && score > 0 ? score - Number(par || 4) : null;
      })
      .filter(value => value !== null);
  }

  function average(values) {
    if (!values.length) return 0;
    return values.reduce((sum, value) => sum + value, 0) / values.length;
  }

  function getSnapshotPlayerExpectedHoleDiff(row = {}) {
    const handicap = Number(row.courseHandicap ?? row.handicap ?? row.handicapIndex);
    if (!Number.isFinite(handicap)) return 1;
    return Math.max(-0.2, Math.min(3.4, handicap / 18));
  }

  function getSnapshotPlayerFormBaseline(previousRow, nextRow, previousSnapshot, nextSnapshot, hole) {
    const previousDiffs = getSnapshotScoredHoleDiffs(previousRow, previousSnapshot, hole);
    if (previousDiffs.length >= 3) return average(previousDiffs);
    const nextDiffs = getSnapshotScoredHoleDiffs(nextRow, nextSnapshot, hole);
    if (nextDiffs.length >= 3) return average(nextDiffs);
    return getSnapshotPlayerExpectedHoleDiff(nextRow);
  }

  function getLiveNotificationTone(input) {
    if (input.score === 1) return "ace";
    if (input.holeDiff < 0) return "brilliant";
    if (input.holeDiff > 1) return "damage";
    if (Math.abs(input.rankDelta) >= 2 || input.severity >= 68) return "rank";
    return "brilliant";
  }

  function scoreLiveNotification(input) {
    const rankDelta = input.rankBefore && input.rankAfter ? input.rankBefore - input.rankAfter : 0;
    const rankImpact = Math.abs(rankDelta);
    const movedIntoTopThree = Boolean(input.rankBefore && input.rankAfter && input.rankBefore > 3 && input.rankAfter <= 3);
    const droppedFromTopThree = Boolean(input.rankBefore && input.rankAfter && input.rankBefore <= 3 && input.rankAfter > 3);
    const leaderChanged = Boolean(input.rankBefore && input.rankAfter && (input.rankBefore === 1 || input.rankAfter === 1) && input.rankBefore !== input.rankAfter);
    const isLowHandicap = input.handicapDiff <= 0.9;
    const isHighBaseline = input.baselineDiff >= 2.7;
    let severity = 0;

    if (input.score === 1) severity += 120;
    if (input.holeDiff <= -3) severity += 96;
    else if (input.holeDiff === -2) severity += 78;
    else if (input.holeDiff === -1) severity += input.baselineDiff >= 1.1 ? 56 : 36;

    if (input.holeDiff >= 5 && !isHighBaseline) severity += 74;
    else if (input.holeDiff >= 4 && input.baselineDiff <= 2.5) severity += 62;
    else if (input.holeDiff >= 3 && (isLowHandicap || input.baselineDiff <= 1.55 || rankImpact >= 2)) severity += 54;

    if (input.holeDiff - input.baselineDiff >= 2.5 && input.baselineDiff <= 2.3) severity += 18;
    if (input.holeDiff - input.expectedDiff >= 2.7 && input.expectedDiff <= 1.2) severity += 18;
    if (rankImpact >= 4) severity += 48;
    else if (rankImpact >= 2) severity += 30;
    else if (rankImpact === 1 && (movedIntoTopThree || droppedFromTopThree || leaderChanged)) severity += 22;
    if (movedIntoTopThree || droppedFromTopThree) severity += 28;
    if (leaderChanged) severity += 34;

    return { rankDelta, severity };
  }

  function getLiveNotificationTerm(score, par) {
    const diff = score - par;
    if (score === 1) return "Hole In One";
    if (diff <= -3) return "albatross";
    if (diff === -2) return "eagle";
    if (diff === -1) return "birdie";
    if (diff === 0) return "par";
    if (diff === 1) return "bogey";
    if (diff === 2) return "double bogey";
    return `${formatDiff(diff)}`;
  }

  function buildLiveNotificationsFromSnapshotChange(previous, next) {
    if (!previous?.leaderboard?.length) return [];
    const previousRows = new Map((previous.leaderboard || []).map(row => [getSnapshotRowKey(row), row]));
    const previousRankMap = getSnapshotRankMap(previous);
    const nextRankMap = getSnapshotRankMap(next);
    const snapshotStamp = getSnapshotUpdatedAtMs(next);
    const events = [];

    (next.leaderboard || []).forEach(row => {
      const rowKey = getSnapshotRowKey(row);
      const previousRow = previousRows.get(rowKey);
      if (!rowKey || !previousRow) return;

      getSnapshotCourseHoles(next).forEach(({ hole }) => {
        const previousScore = getSnapshotScoreValue(previousRow, hole);
        const nextScore = getSnapshotScoreValue(row, hole);
        if (previousScore === nextScore) return;
        const score = Number(nextScore);
        if (!Number.isFinite(score) || score <= 0) return;

        const par = Number(getSnapshotCoursePar(next, hole)) || 4;
        const holeDiff = score - par;
        const rankBefore = previousRankMap.get(rowKey);
        const rankAfter = nextRankMap.get(rowKey);
        const expectedDiff = getSnapshotPlayerExpectedHoleDiff(row);
        const baselineDiff = getSnapshotPlayerFormBaseline(previousRow, row, previous, next, hole);
        const { rankDelta, severity } = scoreLiveNotification({
          score,
          holeDiff,
          baselineDiff,
          expectedDiff,
          rankBefore,
          rankAfter,
          handicapDiff: expectedDiff
        });
        if (severity < 45) return;

        const tone = getLiveNotificationTone({ score, holeDiff, rankDelta, severity });
        const fingerprint = [
          rowKey,
          `h${hole}`,
          `s${score}`,
          `r${rankBefore || 0}-${rankAfter || 0}`,
          snapshotStamp
        ].join(":");
        events.push({
          id: `${fingerprint}:${snapshotStamp}`,
          fingerprint,
          createdAt: snapshotStamp,
          snapshotTime: snapshotStamp,
          tone,
          trend: rankDelta > 0 ? "up" : rankDelta < 0 ? "down" : "steady",
          severity,
          playerName: row.name || "Golfer",
          division: row.division || row.flight || "Chưa có bảng",
          hole: Number(hole),
          par,
          strokes: score,
          holeDiff,
          term: getLiveNotificationTerm(score, par),
          headlinePhrase: getLiveNotificationHeadlinePhrase(tone, fingerprint),
          holesPlayed: row.holesPlayed,
          gross: row.gross,
          net: row.scoringMode === "system36" ? row.system36Net : row.net,
          rankBefore,
          rankAfter
        });
      });
    });

    return events
      .sort((left, right) => right.severity - left.severity || right.createdAt - left.createdAt)
      .slice(0, 6);
  }

  function getLiveNotificationSettings(state) {
    const operator = state.operator || {};
    return {
      retentionMode: operator.liveNotificationRetentionMode === "count" ? "count" : "time",
      maxAgeMs: clampInt(operator.liveNotificationMaxAgeMinutes, 1, 360, 45) * 60 * 1000,
      maxItems: clampInt(operator.liveNotificationMaxItems, 4, 48, 20)
    };
  }

  function normalizeLiveNotificationHistory(value) {
    if (!Array.isArray(value)) return [];
    return value
      .filter(item => item && typeof item === "object")
      .map(item => ({
        ...item,
        id: String(item.id || item.fingerprint || ""),
        fingerprint: String(item.fingerprint || item.id || ""),
        createdAt: Number(item.createdAt) || Date.now(),
        snapshotTime: Number(item.snapshotTime) || Number(item.createdAt) || Date.now(),
        severity: Number(item.severity) || 0
      }))
      .filter(item => item.id && item.fingerprint);
  }

  function pruneLiveNotificationHistory(items, settings) {
    const now = Date.now();
    const deduped = new Map();
    normalizeLiveNotificationHistory(items)
      .sort((left, right) => right.createdAt - left.createdAt || right.severity - left.severity)
      .forEach(item => {
        if (!deduped.has(item.fingerprint)) deduped.set(item.fingerprint, item);
      });
    const source = Array.from(deduped.values());
    if (settings.retentionMode === "count") {
      return source.slice(0, settings.maxItems);
    }
    return source
      .filter(item => now - item.createdAt <= settings.maxAgeMs)
      .slice(0, 48);
  }

  function buildPublicSnapshotLiveNotifications(state, snapshot) {
    const previousSnapshot = window.LB.storage?.getSnapshot
      ? window.LB.storage.getSnapshot(snapshot.shareSlug)
      : null;
    const baseHistory = Array.isArray(state.liveNotifications) && state.liveNotifications.length
      ? state.liveNotifications
      : previousSnapshot?.liveNotifications || [];
    const nextEvents = buildLiveNotificationsFromSnapshotChange(previousSnapshot, snapshot);
    const merged = pruneLiveNotificationHistory(
      [...nextEvents, ...baseHistory],
      getLiveNotificationSettings(state)
    );
    state.liveNotifications = merged;
    return merged;
  }

  function buildPublicSnapshot(state, options = {}) {
    const leaderboard = buildLeaderboard(state, options);
    const divisions = Array.from(new Set(leaderboard.map(getPlayerDivision).filter(Boolean)));
    const snapshot = {
      version: 1,
      shareSlug: state.tournament.shareSlug,
      tournament: {
        id: state.tournament.id,
        name: state.tournament.name,
        operatorName: state.tournament.operatorName,
        courseName: state.tournament.courseName,
        startHole: state.tournament.startHole,
        scoringFormat: state.tournament.scoringFormat,
        updatedAt: new Date().toISOString()
      },
      course: {
        holes: state.course.holes.map(hole => ({
          hole: hole.hole,
          par: hole.par,
          strokeIndex: hole.strokeIndex
        }))
      },
      flightConfig: state.flightConfig || null,
      leaderboard,
      divisionLeaderboards: divisions.map(division => {
        const scoringMeta = getDivisionScoringMeta(state, division);
        return {
          division,
          ...scoringMeta,
          rows: buildLeaderboard(state, { ...options, division })
        };
      }),
      sync: buildPublicSnapshotSync(state),
      metrics: countMetrics(state)
    };
    snapshot.liveNotifications = buildPublicSnapshotLiveNotifications(state, snapshot);
    if (state.finalResults?.status === "published" && state.finalResults.publishedSnapshot) {
      snapshot.finalResults = state.finalResults.publishedSnapshot;
    }
    return snapshot;
  }

  function formatDiff(value) {
    if (!Number.isFinite(value)) return "-";
    if (value > 0) return `+${value}`;
    return String(value);
  }

  window.LB.scoring = {
    clampInt,
    clampNumber,
    buildPlaySequence,
    getHoleConfig,
    getScoreRecord,
    getPlayerDivision,
    getOfficialGross,
    getDisplayGross,
    getDisplaySource,
    getDivisionScoringMeta,
    system36Points,
    handicapStrokeForHole,
    summarizePlayer,
    compareLeaderboardCountback,
    compareLeaderboardRows,
    compareBestGrossRows,
    buildLeaderboard,
    countMetrics,
    buildPublicSnapshot,
    formatDiff
  };
})();
