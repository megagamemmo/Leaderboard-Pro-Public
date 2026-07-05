window.LB = window.LB || {};
window.LB.appPlayer = (function() {
  const state = () => window.LB.state;

function normalizeGender(value = "") {
    const key = window.LB.appUtils.keyText(value);
    if (/^(nam|male|men|m)$/.test(key)) return "male";
    if (/^(nu|female|women|f)$/.test(key)) return "female";
    return "";
  }

function inferGenderFromName(name = "") {
    const norm = String(name || "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase();
    const words = norm.split(/[^a-z0-9]/);
    if (words.includes("nu") || words.includes("women") || words.includes("woman") || words.includes("female") || words.includes("lady") || words.includes("ladies")) {
      return "female";
    }
    if (words.includes("nam") || words.includes("men") || words.includes("man") || words.includes("male") || words.includes("gentleman") || words.includes("gentlemen")) {
      return "male";
    }
    return "";
  }

function getPlayerDivision(player = {}) {
    return player.division || player.flight || "";
  }

function getConfiguredDivisionNames() {
    return (Array.isArray(state().flightConfig?.flights) ? state().flightConfig.flights : [])
      .map(flight => window.LB.appUtils.cleanText(flight.name))
      .filter(Boolean);
  }

function getDivisionSelectOptions(current = "", playerGender = "") {
    const flights = Array.isArray(state().flightConfig?.flights) ? state().flightConfig.flights : [];
    const genderMode = state().flightConfig?.genderMode || "combined";
    const normalizedPlayerGender = window.LB.appPlayer.normalizeGender(playerGender);

    let eligibleFlights = flights;
    if (genderMode === "separate" && normalizedPlayerGender) {
      eligibleFlights = flights.filter(flight => {
        const flightGender = window.LB.appPlayer.normalizeGender(flight.gender);
        return !flightGender || flightGender === normalizedPlayerGender;
      });
    }

    const configuredNames = eligibleFlights
      .map(flight => window.LB.appUtils.cleanText(flight.name))
      .filter(Boolean);

    return Array.from(new Set([
      ...configuredNames,
      window.LB.appUtils.cleanText(current)
    ].filter(Boolean)));
  }

function isFlightSystem36(flight = {}, fallback = true) {
    flight = flight || {};
    const mode = window.LB.appUtils.cleanText(flight.scoringMode || flight.scoring_mode || flight.mode || "").toLowerCase();
    if (["system36", "s36", "tour_system36", "toursystem36"].includes(mode)) return true;
    if (["handicap", "whs", "stroke_net", "net", "gross_net"].includes(mode)) return false;
    if (typeof flight.isSystem36 === "boolean") return flight.isSystem36;
    if (typeof flight.system36 === "boolean") return flight.system36;
    if (typeof flight.s36 === "boolean") return flight.s36;
    return !!fallback;
  }

function getFlightConfigByName(name = "") {
    const target = window.LB.appUtils.cleanText(name).toLowerCase();
    if (!target) return null;
    return (Array.isArray(state().flightConfig?.flights) ? state().flightConfig.flights : [])
      .find(flight => window.LB.appUtils.cleanText(flight?.name).toLowerCase() === target) || null;
  }

function isDivisionSystem36(division = "") {
    const flight = window.LB.appPlayer.getFlightConfigByName(division);
    return flight ? window.LB.appPlayer.isFlightSystem36(flight, false) : window.LB.appUtils.hasSystem36RosterMarker(division);
  }

function extractFlightGroupWithSuffix(value = "") {
    const raw = window.LB.appUtils.cleanText(value).toUpperCase().replace(/\s+/g, "");
    const match = raw.match(/(?:^|[^0-9])(1[0-8]|[1-9])[-_]?([AB])(?:[^A-Z0-9]|$)|^(1[0-8]|[1-9])[-_]?([AB])$/i);
    if (!match) return "";
    const hole = Number(match[1] || match[3]);
    const suffix = String(match[2] || match[4] || "").toUpperCase();
    return hole >= 1 && hole <= 18 && suffix ? `${hole}${suffix}` : "";
  }

function normalizeFlightGroupLabel(flightGroup = "", startHole = "") {
    const explicit = window.LB.appPlayer.extractFlightGroupWithSuffix(flightGroup) || window.LB.appPlayer.extractFlightGroupWithSuffix(startHole);
    if (explicit) return explicit;
    const hole = window.LB.appUtils.extractStartHoleNumber(flightGroup) || window.LB.appUtils.extractStartHoleNumber(startHole);
    return hole ? `${hole}A` : "";
  }

function getStartHoleFromFlightGroup(flightGroup = "", fallback = "") {
    const group = window.LB.appPlayer.extractFlightGroupWithSuffix(flightGroup);
    if (group) return group.replace(/[AB]$/i, "");
    return window.LB.appUtils.extractStartHoleNumber(fallback) || window.LB.appUtils.extractStartHoleNumber(flightGroup);
  }

function getFlightGroupOrder(value = "") {
    const group = window.LB.appPlayer.normalizeFlightGroupLabel(value, "");
    const match = group.match(/^(1[0-8]|[1-9])([AB])$/i);
    if (!match) return Number.MAX_SAFE_INTEGER;
    return ((Number(match[1]) - 1) * 2) + (match[2].toUpperCase() === "B" ? 1 : 0);
  }

function compareFlightAssignments(left = {}, right = {}) {
    const orderA = window.LB.appPlayer.getFlightGroupOrder(left.flightGroup);
    const orderB = window.LB.appPlayer.getFlightGroupOrder(right.flightGroup);
    if (orderA !== orderB) return orderA - orderB;
    return (left.flightGroup || "").localeCompare(right.flightGroup || "", "vi", { numeric: true });
  }

function comparePlayersByFlight(left = {}, right = {}) {
    const assignmentA = window.LB.appPlayer.normalizePlayerFlightAssignment(left);
    const assignmentB = window.LB.appPlayer.normalizePlayerFlightAssignment(right);
    const unassignedA = !assignmentA.flightGroup ? 1 : 0;
    const unassignedB = !assignmentB.flightGroup ? 1 : 0;
    if (unassignedA !== unassignedB) return unassignedA - unassignedB;
    return window.LB.appPlayer.compareFlightAssignments(assignmentA, assignmentB)
      || (left.name || "").localeCompare(right.name || "", "vi");
  }

function sortPlayersByFlightInPlace() {
    state().players.sort(window.LB.appPlayer.comparePlayersByFlight);
  }

function normalizePlayerFlightAssignment(player = {}) {
    const group = window.LB.appPlayer.normalizeFlightGroupLabel(player.flightGroup || player.group || "", player.startHole || "");
    const startHole = window.LB.appPlayer.getStartHoleFromFlightGroup(group, player.startHole || player.flightGroup || player.group || "");
    if (group) {
      player.flightGroup = group;
      player.group = group;
    }
    if (startHole) player.startHole = startHole;
    return {
      flightGroup: player.flightGroup || player.group || "",
      startHole: player.startHole || ""
    };
  }

function getFlightGroupOptions() {
    return Array.from({ length: 18 }, (_, index) => [`${index + 1}A`, `${index + 1}B`]).flat();
  }

function getFlightBucket(flight = {}, cfg = {}) {
    const genderBucket = cfg.genderMode === "separate" ? window.LB.appPlayer.normalizeGender(flight.gender) || "unknown" : "combined";
    return `${genderBucket}:${window.LB.appPlayer.isFlightSystem36(flight, true) ? "system36" : "handicap"}`;
  }

function formatDivisionLabel(value = "") {
    const raw = window.LB.appUtils.cleanText(value);
    if (!raw) return "";
    const key = window.LB.appUtils.keyText(raw);
    if (/^bang\b/.test(key)) return raw.replace(/^bang/i, "Bảng");
    if (/^[a-d]$/i.test(raw)) return `Bảng ${raw.toUpperCase()}`;
    if (/^b([a-d0-9]+)$/i.test(raw)) return `Bảng ${raw.slice(1).toUpperCase()}`;
    if (/^(nu|female|women|woman|ladies|lady)$/.test(key)) return "Bảng Nữ";
    if (/^(nam|male|men)$/.test(key)) return "Bảng Nam";
    return raw;
  }

function getDivisionList(players = state().players, options = {}) {
    const discovered = Array.from(new Set((players || []).map(window.LB.appPlayer.getPlayerDivision).filter(Boolean)));
    const configured = (Array.isArray(state().flightConfig?.flights) ? state().flightConfig.flights : [])
      .map(flight => window.LB.appUtils.cleanText(flight.name))
      .filter(Boolean);
    const ordered = [
      ...configured.filter(name => discovered.includes(name)),
      ...discovered.filter(name => !configured.includes(name))
    ];
    if (!options.awardOnly) return ordered;
    const awardDivisions = new Set((players || []).filter(player => player.awardEligible !== false).map(window.LB.appPlayer.getPlayerDivision).filter(Boolean));
    return ordered.filter(name => awardDivisions.has(name));
  }

function setPlayerDivision(player, division) {
    const handicap = window.LB.appPlayer.getPlayerCourseHandicapValue(player);
    const next = division || (window.LB.appPlayer.hasNumericPlayerValue(handicap) ? window.LB.appPlayer.getFlightNameForHandicap(handicap, player.gender || "") : "");
    player.division = next;
    player.flight = next;
    return next;
  }

function getSystem36FlightsForPlayer(player = {}) {
    const cfg = state().flightConfig || {};
    const normalizedGender = window.LB.appPlayer.normalizeGender(player.gender || "");
    const flights = (Array.isArray(cfg.flights) ? cfg.flights : [])
      .filter(flight => window.LB.appPlayer.isFlightSystem36(flight, false));
    const genderMatched = cfg.genderMode === "separate" && normalizedGender
      ? flights.filter(flight => window.LB.appPlayer.normalizeGender(flight.gender) === normalizedGender)
      : flights.filter(flight => !flight.gender);
    return genderMatched.length ? genderMatched : flights;
  }

function getPreferredSystem36DivisionForPlayer(player = {}, preferredDivision = "") {
    const pool = window.LB.appPlayer.getSystem36FlightsForPlayer(player);
    if (!pool.length) return "";
    const preferred = window.LB.appUtils.cleanText(preferredDivision).toLowerCase();
    if (preferred) {
      const explicit = pool.find(flight => window.LB.appUtils.cleanText(flight.name).toLowerCase() === preferred);
      if (explicit) return explicit.name;
    }
    const hcp = window.LB.scoring.clampNumber(player.courseHandicap ?? player.handicap, -10, 54, 0);
    const matched = pool.find(flight => hcp >= Number(flight.min) && hcp <= Number(flight.max));
    return matched?.name || pool[0]?.name || "";
  }

function setPlayerSystem36Division(player, preferredDivision = "") {
    if (!player) return "";
    const division = window.LB.appPlayer.getPreferredSystem36DivisionForPlayer(player, preferredDivision);
    if (!division) return "";
    window.LB.appPlayer.setPlayerDivision(player, division);
    player.divisionSource = "ts36";
    return division;
  }

function ensurePlayerIdentity(player) {
    if (!player) return "";
    if (window.LB.ocr?.ensurePlayerIdentity) return window.LB.ocr.ensurePlayerIdentity(player);
    const vgaId = window.LB.appUtils.normalizeVgaId(player.vgaId || "");
    player.golferId = vgaId || player.golferId || player.id;
    return player.golferId;
  }

function syncPlayerIdentities() {
    state().players.forEach(player => {
      window.LB.appPlayer.ensurePlayerIdentity(player);
      player.gender = window.LB.appPlayer.normalizeGender(player.gender || "");
      window.LB.appPlayer.normalizePlayerFlightAssignment(player);
      const handicap = window.LB.appPlayer.getPlayerCourseHandicapValue(player);
      if (!window.LB.appPlayer.getPlayerDivision(player) && window.LB.appPlayer.hasNumericPlayerValue(handicap)) {
        window.LB.appPlayer.setPlayerDivision(player, window.LB.appPlayer.getFlightNameForHandicap(handicap, player.gender));
      }
    });
  }

function getGenderLabel(gender = "") {
    if (gender === "male") return "Nam";
    if (gender === "female") return "Nữ";
    return "Chung";
  }

function getCourseParTotal() {
    return (state().course.holes || []).reduce((total, hole) => total + (Number(hole.par) || 0), 0) || 72;
  }

function getHandicapRating(gender = "") {
    const ratings = state().tournament.handicapRatings || {};
    return ratings[window.LB.appPlayer.normalizeGender(gender) === "female" ? "female" : "male"] || {};
  }

function calculateCourseHandicap(handicapIndex, gender = "") {
    const index = Number(handicapIndex);
    if (!Number.isFinite(index)) return "";
    const rating = window.LB.appPlayer.getHandicapRating(gender);
    const slope = Number(rating.slopeRating);
    const courseRating = Number(rating.courseRating);
    if (!Number.isFinite(slope) || slope <= 0 || !Number.isFinite(courseRating)) return Math.round(index);
    return Math.round((index * slope / 113) + (courseRating - window.LB.appPlayer.getCourseParTotal()));
  }

function hasNumericPlayerValue(value) {
    return value !== "" && value !== null && value !== undefined && Number.isFinite(Number(value));
  }

function getPlayerCourseHandicapValue(player = {}) {
    if (window.LB.appPlayer.hasNumericPlayerValue(player.courseHandicap)) return Number(player.courseHandicap);
    if (window.LB.appPlayer.hasNumericPlayerValue(player.handicap)) return Number(player.handicap);
    return "";
  }

function shouldShowHandicapIndex() {
    return state().players.some(player => (
      window.LB.appPlayer.hasNumericPlayerValue(player.handicapIndex) ||
      player.handicapIndexNeedsReview ||
      player.importReviewSource === "spreadsheet"
    ));
  }

function hasCourseHandicapLock(player = {}) {
    return !!player.courseHandicapLocked || /^course_handicap/.test(window.LB.appUtils.cleanText(player.handicapSource));
  }

function recomputeCourseHandicapsFromIndex() {
    state().players.forEach(player => {
      if (player.handicapIndex === "" || player.handicapIndex === null || player.handicapIndex === undefined) return;
      if (window.LB.appPlayer.hasCourseHandicapLock(player)) return;
      player.handicap = window.LB.appPlayer.calculateCourseHandicap(player.handicapIndex, player.gender);
      player.courseHandicap = player.handicap;
      if (player.divisionSource !== "import" && player.divisionSource !== "manual") {
        window.LB.appPlayer.setPlayerDivision(player, window.LB.appPlayer.getFlightNameForHandicap(player.handicap, player.gender));
      }
    });
  }

function getPlayerPublicId(player = {}) {
    return window.LB.appPlayer.ensurePlayerIdentity(player) || player.id || "";
  }

function playerMatchesClaimedPlayer(player = {}, claimedPlayerId = "") {
    const claimed = window.LB.appUtils.cleanText(claimedPlayerId);
    if (!claimed) return false;
    window.LB.appPlayer.ensurePlayerIdentity(player);
    return window.LB.appUtils.cleanText(player.id) === claimed || window.LB.appUtils.playerMatchesPublicGolfId(player, claimed);
  }

function findSuggestedPlayer(candidate) {
    window.LB.appPlayer.syncPlayerIdentities();
    const players = state().players || [];
    if (candidate.claimedPlayerId) {
      const claimed = players.find(player => window.LB.appPlayer.playerMatchesClaimedPlayer(player, candidate.claimedPlayerId) && !window.LB.appTs36.isPlayerLinkedToDifferentTs36(player, candidate));
      if (claimed) return { player: claimed, score: 1, reason: "TS36 đã chọn golfer" };
    }
    if (candidate.normalizedVgaId) {
      const byVga = players.find(player => window.LB.appUtils.playerMatchesPublicGolfId(player, candidate.normalizedVgaId) && !window.LB.appTs36.isPlayerLinkedToDifferentTs36(player, candidate));
      if (byVga) return { player: byVga, score: 1, reason: "Trùng ID" };
    }
    const ranked = players
      .filter(player => !window.LB.appTs36.isPlayerLinkedToDifferentTs36(player, candidate))
      .map(player => ({ player, score: window.LB.appUtils.nameSimilarity(candidate.displayName, player.name), reason: "Trùng tên gần đúng" }))
      .sort((a, b) => b.score - a.score);
    return ranked[0]?.score >= 0.42 ? ranked[0] : { player: null, score: 0, reason: "Chưa đủ tin cậy" };
  }

function applyPendingScoresToPlayer(match, player) {
    if (!match || !player) return 0;
    let changed = window.LB.appTs36.clearTourSystemScoresForMatch(match, player.id);
    match.pendingScores = Array.isArray(match.pendingScores) ? match.pendingScores : [];
    match.pendingScores.forEach(score => {
      const originalHole = window.LB.scoring.clampInt(score.hole, 1, 18, 0);
      const effectiveHole = window.LB.appUtils.getEffectivePendingScoreHole(match, player, score);
      const gross = window.LB.scoring.clampInt(score.gross ?? score.userGross ?? score.sourceRow?.gross, 1, 30, 0);
      if (!effectiveHole || !gross) return;
      const hole = String(effectiveHole);
      if (!state().scores[player.id]) state().scores[player.id] = {};
      const previous = state().scores[player.id][hole] || {};
      const previousUserGross = window.LB.scoring.clampInt(previous.userGross, 1, 30, 0);
      state().scores[player.id][hole] = {
        ...previous,
        userGross: gross,
        source: "toursystem36",
        tourSystemSubmissionId: score.id,
        tourSystemMatchId: match.id,
        tourSystemOriginalHole: originalHole || effectiveHole,
        updatedAt: score.submittedAt,
        conflictStatus: previous.confirmedGross && previous.confirmedGross !== gross ? "conflict" : previous.conflictStatus
      };
      if (previousUserGross !== gross) {
        changed += 1;
        markScoreLiveUpdated(player.id, hole);
      }
    });
    return changed;
  }

function getPlayerProfileReviewState(player = {}) {
    const confirmed = player.profileReviewConfirmed === true;
    const vgaMissing = !window.LB.appUtils.normalizeVgaId(player.vgaId || "");
    const handicapIndexMissing = !window.LB.appPlayer.hasNumericPlayerValue(player.handicapIndex);
    const courseHandicapMissing = !window.LB.appPlayer.hasNumericPlayerValue(window.LB.appPlayer.getPlayerCourseHandicapValue(player));
    return {
      division: !!player.divisionNeedsReview || !window.LB.appPlayer.getPlayerDivision(player),
      vga: !confirmed && (vgaMissing || player.vgaNeedsReview),
      handicapIndex: !confirmed && (handicapIndexMissing || player.handicapIndexNeedsReview),
      courseHandicap: !confirmed && (courseHandicapMissing || player.courseHandicapNeedsReview),
      courseHandicapMissing
    };
  }

function markPlayerProfileReviewPending(player = {}) {
    if (!player) return;
    player.profileReviewConfirmed = false;
  }

function confirmPlayerImportReview(playerId = "") {
    const player = state().players.find(item => item.id === playerId);
    if (!player) return;
    const review = window.LB.appPlayer.getPlayerProfileReviewState(player);
    if (review.division) {
      alert("Hãy chọn bảng đấu cho golfer trước khi xác nhận.");
      return;
    }
    player.profileReviewConfirmed = true;
    player.vgaNeedsReview = false;
    player.handicapIndexNeedsReview = false;
    player.courseHandicapNeedsReview = false;
    player.profileReviewConfirmedAt = new Date().toISOString();
    window.LB.storage.saveState();
    window.LB.appPlayer.renderPlayers();
    renderScoreTable();
    window.LB.appUtils.renderLight();
  }

function getPlayerSearchField() {
    return document.getElementById("player-search");
  }

function renderPlayerSearchInput(id, value = "", placeholder = "Tìm golfer hoặc ID", scope = "players") {
    return `<input id="${window.LB.appUtils.escapeHtml(id)}" class="player-search" type="search" autocomplete="off" data-search-scope="${window.LB.appUtils.escapeHtml(scope)}" value="${window.LB.appUtils.escapeHtml(value)}" placeholder="${window.LB.appUtils.escapeHtml(placeholder)}">`;
  }

function addPlayer(input = {}, shouldRender = true) {
    const id = `p-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
    const rawHandicap = input.courseHandicap ?? input.handicap ?? "";
    const handicap = window.LB.appPlayer.hasNumericPlayerValue(rawHandicap)
      ? window.LB.scoring.clampNumber(rawHandicap, -10, 54, 0)
      : "";
    const gender = window.LB.appPlayer.normalizeGender(input.gender || input.sex || "");
    const hasExplicitFlight = !!(input.flightGroup || input.group || input.startHole);
    const division = input.division || input.flight || (hasExplicitFlight && window.LB.appPlayer.hasNumericPlayerValue(handicap) ? window.LB.appPlayer.getFlightNameForHandicap(handicap, gender) : "");
    const flightGroup = window.LB.appPlayer.normalizeFlightGroupLabel(input.flightGroup || input.group || "", input.startHole || "");
    const startHole = window.LB.appPlayer.getStartHoleFromFlightGroup(flightGroup, input.startHole || input.flightGroup || input.group || "");
    const player = {
      id,
      name: input.name || "",
      handicap,
      courseHandicap: window.LB.appPlayer.hasNumericPlayerValue(input.courseHandicap) ? Number(input.courseHandicap) : handicap,
      handicapIndex: input.handicapIndex ?? "",
      handicapSource: input.handicapSource || (input.courseHandicap !== undefined ? "course_handicap" : ""),
      courseHandicapLocked: input.courseHandicapLocked ?? input.courseHandicap !== undefined,
      gender,
      division,
      flight: division,
      divisionSource: input.division || input.flight ? "manual" : "auto",
      flightGroup,
      group: flightGroup,
      startHole,
      caddyNumber: input.caddyNumber || "",
      awardEligible: input.awardEligible !== false,
      operationNote: input.operationNote || input.note || "",
      vgaId: window.LB.appUtils.normalizeVgaId(input.vgaId || input.golferId || ""),
      golferId: window.LB.appUtils.normalizeVgaId(input.golferId || input.vgaId || ""),
      tourSystemUserId: input.tourSystemUserId || "",
      status: "active",
      createdAt: new Date().toISOString()
    };
    player.divisionNeedsReview = !division;
    player.vgaNeedsReview = !window.LB.appUtils.normalizeVgaId(player.vgaId || "");
    player.handicapIndexNeedsReview = !window.LB.appPlayer.hasNumericPlayerValue(player.handicapIndex);
    player.courseHandicapNeedsReview = !window.LB.appPlayer.hasNumericPlayerValue(player.courseHandicap);
    player.profileReviewConfirmed = !(player.vgaNeedsReview || player.handicapIndexNeedsReview || player.courseHandicapNeedsReview);
    window.LB.appPlayer.ensurePlayerIdentity(player);
    state().players.unshift(player);
    state().scores[id] = {};
    if (shouldRender) window.LB.appUtils.persistAndRender();
  }

function applySimulator2RosterPlayers(players = []) {
    const existingScores = state().scores || {};
    const existingScoreIndex = window.LB.appSnapshot.buildScoreRestoreIndex(state().players, existingScores);
    const snapshotScoreIndex = window.LB.appSnapshot.buildSnapshotScoreRestoreIndex();
    const simulatorPlayers = Array.isArray(players) ? players.map(player => ({ ...player })) : [];
    const simulatorPlayerIds = new Set(simulatorPlayers.map(player => player.id).filter(Boolean));
    const retainedPlayers = (state().players || []).filter(player => (
      !simulatorPlayerIds.has(player.id) && player.operationNote !== "simulator2_auto_roster"
    ));
    state().players = [...retainedPlayers, ...simulatorPlayers];
    simulatorPlayers.forEach(player => {
      window.LB.appPlayer.ensurePlayerIdentity(player);
      window.LB.appPlayer.normalizePlayerFlightAssignment(player);
      const handicap = window.LB.appPlayer.getPlayerCourseHandicapValue(player);
      if (!window.LB.appPlayer.getPlayerDivision(player) && window.LB.appPlayer.hasNumericPlayerValue(handicap)) {
        window.LB.appPlayer.setPlayerDivision(player, window.LB.appPlayer.getFlightNameForHandicap(handicap, player.gender));
      }
    });
    state().scores = {
      ...existingScores,
      ...Object.fromEntries(state().players.map(player => [
        player.id,
        existingScores[player.id] || window.LB.appUtils.findRestorableScoreMap(player, [existingScoreIndex, snapshotScoreIndex])
      ]))
    };
    window.LB.appFinal.invalidatePublishedFinalResults();
    window.LB.storage.saveState();
    window.LB.appPlayer.renderPlayers();
    window.LB.appPlayer.renderFlightConfigPanel();
    renderScoreTable();
    renderLeaderboard();
    renderTs36MatchReview();
    window.LB.appUtils.renderSummary();
    renderOperatorTournamentControls();
  }

function removePlayer(playerId) {
    if (!playerId) return;
    state().players = state().players.filter(player => player.id !== playerId);
    delete state().scores[playerId];
  }

function confirmPlayerScores(playerId) {
    const playerScores = state().scores[playerId] || {};
    return Object.keys(playerScores).reduce((count, hole) => (
      window.LB.appUtils.confirmScore(playerId, hole) ? count + 1 : count
    ), 0);
  }

function getPlayerPendingScoreCount(playerId) {
    const playerScores = state().scores[playerId] || {};
    return Object.values(playerScores).filter(window.LB.appUtils.isScorePendingReview).length;
  }

function normalizeFlightConfig(input = {}) {
    const fallback = state().flightConfig || {};
    const tournamentFormat = input.tournamentFormat || fallback.tournamentFormat || "mixed";
    const bestGrossAward = input.bestGrossAward || fallback.bestGrossAward || "yes";

    let rawFlights = Array.isArray(input.flights)
      ? input.flights
      : (Array.isArray(input.divisions) ? input.divisions : fallback.flights);

    // Bảng Pro Gross luôn được xử lý độc lập, không cần quan tâm logic phân nam/nữ
    const proGrossFlight = {
      name: "Bảng Pro Gross",
      min: -10,
      max: 54,
      gender: "",
      isSystem36: false,
      scoringMode: "stroke_gross"
    };

    if (tournamentFormat === "pro_gross") {
      return {
        ...fallback,
        ...input,
        locked: input.locked !== false,
        source: input.source || fallback.source || "toursystem36",
        tournamentFormat,
        bestGrossAward: "yes",
        genderMode: "combined",
        allowFlightJump: false,
        fixedDivisionName: proGrossFlight.name,
        fixedFlightName: proGrossFlight.name,
        divisionCount: 1,
        maleDivisionCount: 0,
        femaleDivisionCount: 0,
        flights: [proGrossFlight]
      };
    }

    // Xử lý các bảng Net cho chế độ net_only và mixed
    const netRawFlights = rawFlights.filter(f => f.scoringMode !== "stroke_gross");
    const inferredSeparate = netRawFlights.some(flight => window.LB.appPlayer.normalizeGender(flight?.gender || "") || window.LB.appPlayer.inferGenderFromName(flight?.name || flight?.division || ""));
    const genderMode = input.genderMode || input.divisionGenderMode || fallback.genderMode || (inferredSeparate ? "separate" : "combined");

    let netFlights = netRawFlights.map((flight, index) => {
      const name = String(flight?.name || flight?.division || `Bảng ${String.fromCharCode(65 + index)}`).trim();
      return {
        name,
        min: window.LB.scoring.clampInt(flight?.min, -10, 54, index === 0 ? 0 : 13),
        max: window.LB.scoring.clampInt(flight?.max, -10, 54, index === 0 ? 12 : 54),
        gender: genderMode === "separate" ? (window.LB.appPlayer.normalizeGender(flight?.gender || flight?.divisionGender || "") || window.LB.appPlayer.inferGenderFromName(name)) : "",
        isSystem36: window.LB.appPlayer.isFlightSystem36(flight, true),
        scoringMode: window.LB.appPlayer.isFlightSystem36(flight, true) ? "system36" : "handicap"
      };
    }).filter(flight => flight.name);

    if (!netFlights.length || (genderMode === "separate" && !netFlights.some(flight => flight.gender))) {
      netFlights = genderMode === "separate"
        ? [
            ...window.LB.appPlayer.getDefaultFlightConfig(input.maleDivisionCount || fallback.maleDivisionCount || 3, "male"),
            ...window.LB.appPlayer.getDefaultFlightConfig(input.femaleDivisionCount || fallback.femaleDivisionCount || 3, "female")
          ]
        : window.LB.appPlayer.getDefaultFlightConfig(input.divisionCount || input.flightCount || fallback.divisionCount || 3);
    }
    if (genderMode !== "separate") {
      netFlights = netFlights.map(flight => ({ ...flight, gender: "" }));
    }

    let flights = tournamentFormat === "mixed"
      ? [proGrossFlight, ...netFlights]
      : [...netFlights];

    const fixedDivisionName = input.fixedDivisionName || input.fixedFlightName || fallback.fixedDivisionName || fallback.fixedFlightName || flights[0]?.name || "";
    const maleDivisionCount = netFlights.filter(flight => flight.gender === "male").length || fallback.maleDivisionCount || 3;
    const femaleDivisionCount = netFlights.filter(flight => flight.gender === "female").length || fallback.femaleDivisionCount || 3;

    return {
      ...fallback,
      ...input,
      locked: input.locked !== false,
      source: input.source || fallback.source || "toursystem36",
      tournamentFormat,
      bestGrossAward,
      genderMode: genderMode === "separate" ? "separate" : "combined",
      allowFlightJump: !!input.allowFlightJump,
      fixedDivisionName: fixedDivisionName || flights[0]?.name || "",
      fixedFlightName: fixedDivisionName || flights[0]?.name || "",
      divisionCount: genderMode === "separate" ? 0 : netFlights.length,
      maleDivisionCount,
      femaleDivisionCount,
      flights
    };
  }

function applyFlightConfig(config = {}) {
    state().flightConfig = window.LB.appPlayer.normalizeFlightConfig(config);
    state().players.forEach(player => {
      player.gender = window.LB.appPlayer.normalizeGender(player.gender || "");
      const handicap = window.LB.appPlayer.getPlayerCourseHandicapValue(player);
      window.LB.appPlayer.setPlayerDivision(player, window.LB.appPlayer.getPlayerDivision(player) || (window.LB.appPlayer.hasNumericPlayerValue(handicap) ? window.LB.appPlayer.getFlightNameForHandicap(handicap, player.gender) : ""));
      if (state().flightConfig.locked && player.divisionSource !== "import" && player.divisionSource !== "manual") {
        if (window.LB.appPlayer.hasNumericPlayerValue(handicap)) {
          window.LB.appPlayer.setPlayerDivision(player, window.LB.appPlayer.getFlightNameForHandicap(handicap, player.gender));
        }
      }
    });
  }

function getFlightNameForHandicap(handicap, gender = "") {
    const cfg = state().flightConfig || {};
    const hcp = window.LB.scoring.clampNumber(handicap, -10, 54, 0);
    const normalizedGender = window.LB.appPlayer.normalizeGender(gender);
    const flights = Array.isArray(cfg.flights) ? cfg.flights : [];
    const eligible = cfg.genderMode === "separate" && normalizedGender
      ? flights.filter(flight => window.LB.appPlayer.normalizeGender(flight.gender) === normalizedGender)
      : flights.filter(flight => !flight.gender);
    const pool = eligible.length ? eligible : flights;
    const matched = pool.find(flight => hcp >= Number(flight.min) && hcp <= Number(flight.max));
    return matched?.name || pool[0]?.name || flights[0]?.name || "";
  }

function renderFlightMeta() {
    const cfg = state().flightConfig || {};
    const flights = Array.isArray(cfg.flights) ? cfg.flights : [];
    if (!flights.length) return "Bảng TS36";
    return flights.map(flight => `${flight.name}${flight.gender ? ` ${window.LB.appPlayer.getGenderLabel(flight.gender)}` : ""} ${flight.min}-${flight.max} · ${window.LB.appPlayer.isFlightSystem36(flight) ? "S36" : "WHS"}`).join(" · ");
  }

function getDefaultFlightConfig(count = 3, gender = "") {
    const templates = {
      1: [{ name: "Bảng A", min: 0, max: 54 }],
      2: [
        { name: "Bảng A", min: 0, max: 18 },
        { name: "Bảng B", min: 19, max: 54 }
      ],
      3: [
        { name: "Bảng A", min: 0, max: 12 },
        { name: "Bảng B", min: 13, max: 23 },
        { name: "Bảng C", min: 24, max: 54 }
      ],
      4: [
        { name: "Bảng A", min: 0, max: 9 },
        { name: "Bảng B", min: 10, max: 18 },
        { name: "Bảng C", min: 19, max: 27 },
        { name: "Bảng D", min: 28, max: 54 }
      ]
    };
    const normalizedGender = window.LB.appPlayer.normalizeGender(gender);
    const prefix = normalizedGender === "male" ? "Bảng Nam" : (normalizedGender === "female" ? "Bảng Nữ" : "Bảng");
    const normalizedCount = window.LB.scoring.clampInt(count, 1, 8, 3);
    const generated = templates[normalizedCount] || Array.from({ length: normalizedCount }, (_, index) => {
      const width = Math.ceil(55 / normalizedCount);
      const min = index === 0 ? 0 : Math.min(54, index * width);
      const max = index === normalizedCount - 1 ? 54 : Math.min(54, ((index + 1) * width) - 1);
      return { name: `Bảng ${String.fromCharCode(65 + index)}`, min, max };
    });
    return generated.map(flight => ({
      ...flight,
      name: normalizedGender ? flight.name.replace("Bảng", prefix) : flight.name,
      gender: normalizedGender,
      isSystem36: true,
      scoringMode: "system36"
    }));
  }

function buildSystem36FlightConfig(config = {}) {
    const cfg = window.LB.appPlayer.normalizeFlightConfig(config || {});
    const sourceFlights = Array.isArray(cfg.flights) ? cfg.flights : [];
    const flights = sourceFlights
      .filter(flight => window.LB.appPlayer.isFlightSystem36(flight, false))
      .map(flight => ({
        name: flight.name,
        division: flight.name,
        min: Number(flight.min),
        max: Number(flight.max),
        system36Min: Number(flight.min),
        system36Max: Number(flight.max),
        handicapMin: Number(flight.min),
        handicapMax: Number(flight.max),
        gender: flight.gender || "",
        isSystem36: true,
        scoringMode: "system36"
      }));
    const fixedDivisionName = flights.some(flight => flight.name === cfg.fixedDivisionName) ? cfg.fixedDivisionName : flights[0]?.name || "";
    return {
      locked: cfg.locked !== false,
      source: "leaderboard_pro",
      genderMode: cfg.genderMode === "separate" ? "separate" : "combined",
      allowDivisionJump: !!cfg.allowFlightJump,
      allowFlightJump: !!cfg.allowFlightJump,
      fixedDivisionName,
      fixedFlightName: fixedDivisionName,
      s36DivisionNames: flights.map(flight => flight.name),
      divisions: flights,
      flights
    };
  }

function countDivisionsByGender(flights = [], gender = "") {
    const normalizedGender = window.LB.appPlayer.normalizeGender(gender);
    return flights.filter(flight => window.LB.appPlayer.normalizeGender(flight.gender) === normalizedGender).length;
  }

function validateFlightConfig() {
    const cfg = state().flightConfig || {};
    const flights = Array.isArray(cfg.flights) ? cfg.flights : [];
    const names = new Set();
    const rangesByModeAndGender = new Map();
    for (const flight of flights) {
      const name = String(flight.name || "").trim();
      const min = Number(flight.min);
      const max = Number(flight.max);
      if (!name) return { ok: false, message: "Tên bảng không được để trống." };
      if (names.has(name.toLowerCase())) return { ok: false, message: "Tên bảng không được trùng nhau." };
      names.add(name.toLowerCase());

      if (flight.scoringMode === "stroke_gross") {
        continue; // Bỏ qua kiểm tra HCP và giới tính cho bảng Gross
      }

      if (!Number.isInteger(min) || !Number.isInteger(max) || min < -10 || max > 54 || min > max) {
        return { ok: false, message: "Range HCP phải hợp lệ và min không lớn hơn max." };
      }
      if (cfg.genderMode === "separate" && !window.LB.appPlayer.normalizeGender(flight.gender)) {
        return { ok: false, message: "Bảng Nam/Nữ phải có giới tính rõ ràng." };
      }

      const genderBucket = cfg.genderMode === "separate" ? window.LB.appPlayer.normalizeGender(flight.gender) : "combined";
      const modeBucket = window.LB.appPlayer.isFlightSystem36(flight, false) ? "system36" : "handicap";
      const bucket = `${genderBucket}:${modeBucket}`;
      if (!rangesByModeAndGender.has(bucket)) rangesByModeAndGender.set(bucket, []);
      rangesByModeAndGender.get(bucket).push({ min, max });
    }
    for (const ranges of rangesByModeAndGender.values()) {
      ranges.sort((a, b) => a.min - b.min);
      for (let index = 1; index < ranges.length; index += 1) {
        if (ranges[index].min <= ranges[index - 1].max) return { ok: false, message: "Range HCP giữa các bảng cùng mode đang bị chồng lấn." };
      }
    }
    const system36Count = flights.filter(flight => window.LB.appPlayer.isFlightSystem36(flight, false)).length;
    if (state().operator?.linkedTournament?.id && !system36Count) {
      return { ok: false, message: "Tournament đã link TS36 cần có ít nhất 1 bảng tick S36." };
    }
    const modeLabel = cfg.genderMode === "separate"
      ? `${window.LB.appPlayer.countDivisionsByGender(flights, "male")} bảng nam · ${window.LB.appPlayer.countDivisionsByGender(flights, "female")} bảng nữ`
      : `${flights.length} bảng chung`;
    return {
      ok: true,
      message: `${modeLabel} hợp lệ · ${system36Count} S36 · ${flights.length - system36Count} WHS`
    };
  }

function isFlightConfigReadyForRosterImport() {
    return state().flightConfig?.rosterImportReady === true;
  }

function renderFlightConfigStatus() {
    const status = document.getElementById("flight-config-status");
    if (!status) return;
    const result = window.LB.appPlayer.validateFlightConfig();
    const ready = result.ok && window.LB.appPlayer.isFlightConfigReadyForRosterImport();
    status.textContent = result.ok && !ready ? "" : result.message;
    status.classList.toggle("is-linked", ready);
    status.classList.toggle("is-error", !ready && !result.ok);
  }

function renderFlightConfigPanel() {
    const cfg = window.LB.appPlayer.normalizeFlightConfig(state().flightConfig || {});
    state().flightConfig = cfg;
    const countSelect = document.getElementById("flight-count-select");
    const genderModeSelect = document.getElementById("division-gender-mode-select");
    const maleCountSelect = document.getElementById("male-flight-count-select");
    const femaleCountSelect = document.getElementById("female-flight-count-select");
    const jumpToggle = document.getElementById("flight-jump-toggle");
    const tournamentFormatSelect = document.getElementById("tournament-format-select");
    const bestGrossAwardSelect = document.getElementById("best-gross-award-select");
    const bestGrossAwardContainer = document.getElementById("best-gross-award-container");
    const list = document.getElementById("flight-config-list");
    if (!countSelect || !genderModeSelect || !maleCountSelect || !femaleCountSelect || !jumpToggle || !list) return;

    const combinedLabel = countSelect.closest("label");
    const maleLabel = maleCountSelect.closest("label");
    const femaleLabel = femaleCountSelect.closest("label");
    const genderModeLabel = genderModeSelect.closest("label");

    if (tournamentFormatSelect) tournamentFormatSelect.value = cfg.tournamentFormat || "mixed";
    if (bestGrossAwardSelect) bestGrossAwardSelect.value = cfg.bestGrossAward || "yes";

    if (bestGrossAwardContainer) {
      bestGrossAwardContainer.hidden = cfg.tournamentFormat === "pro_gross";
    }

    genderModeSelect.value = cfg.genderMode || "combined";
    countSelect.value = String(cfg.genderMode === "separate" ? (cfg.divisionCount || 3) : cfg.flights.filter(f => f.scoringMode !== "stroke_gross").length || 1);
    maleCountSelect.value = String(cfg.maleDivisionCount || 3);
    femaleCountSelect.value = String(cfg.femaleDivisionCount || 3);

    const isProGrossOnly = cfg.tournamentFormat === "pro_gross";
    if (genderModeLabel) genderModeLabel.hidden = isProGrossOnly;
    if (combinedLabel) combinedLabel.hidden = isProGrossOnly || cfg.genderMode === "separate";
    if (maleLabel) maleLabel.hidden = isProGrossOnly || cfg.genderMode !== "separate";
    if (femaleLabel) femaleLabel.hidden = isProGrossOnly || cfg.genderMode !== "separate";

    jumpToggle.checked = !!cfg.allowFlightJump;
    list.innerHTML = cfg.flights.map((flight, index) => {
      const isGross = flight.scoringMode === "stroke_gross";
      return `
      <article class="flight-config-row ${cfg.genderMode === "separate" && !isGross ? "is-gendered" : ""}" data-flight-index="${index}">
        <input class="flight-config-name" type="text" data-flight-field="name" value="${window.LB.appUtils.escapeHtml(flight.name)}" aria-label="Tên bảng ${index + 1}" ${isGross ? "readonly" : ""}>
        ${cfg.genderMode === "separate" && !isGross ? `
          <label class="flight-config-gender">
            <span>Nam/Nữ</span>
            <select data-flight-field="gender">
              <option value="male" ${flight.gender === "male" ? "selected" : ""}>Nam</option>
              <option value="female" ${flight.gender === "female" ? "selected" : ""}>Nữ</option>
            </select>
          </label>
        ` : ""}
        <label class="flight-config-range" ${isGross ? 'style="opacity: 0.5"' : ""}>
          <span>Min HCP</span>
          <input type="number" min="-10" max="54" step="1" data-flight-field="min" value="${isGross ? "" : window.LB.appUtils.escapeHtml(Math.round(Number(flight.min) || 0))}" ${isGross ? "disabled" : ""}>
        </label>
        <label class="flight-config-range" ${isGross ? 'style="opacity: 0.5"' : ""}>
          <span>Max HCP</span>
          <input type="number" min="-10" max="54" step="1" data-flight-field="max" value="${isGross ? "" : window.LB.appUtils.escapeHtml(Math.round(Number(flight.max) || 0))}" ${isGross ? "disabled" : ""}>
        </label>
        <label class="flight-config-mode" title="Chế độ tính giải">
          <select data-flight-field="scoringMode" ${isGross ? "disabled" : ""}>
            <option value="system36" ${flight.scoringMode === "system36" || (window.LB.appPlayer.isFlightSystem36(flight, true) && !isGross) ? "selected" : ""}>System 36</option>
            <option value="handicap" ${flight.scoringMode === "handicap" ? "selected" : ""}>Handicap Net</option>
            <option value="stroke_gross" ${isGross ? "selected" : ""} style="display: none;">Stroke Gross</option>
          </select>
        </label>
      </article>
    `}).join("");
    window.LB.appPlayer.renderFlightConfigStatus();
  }

function handleFlightConfigInput(target) {
    const cfg = window.LB.appPlayer.normalizeFlightConfig({
      ...(state().flightConfig || {}),
      rosterImportReady: false
    });
    const field = target.dataset.field || "";
    if (field === "tournament-format" || field === "best-gross-award") {
      state().flightConfig = window.LB.appPlayer.normalizeFlightConfig({
        ...cfg,
        [field === "tournament-format" ? "tournamentFormat" : "bestGrossAward"]: target.value
      });
      window.LB.appPlayer.applyFlightConfig(state().flightConfig);
      window.LB.storage.saveState();
      window.LB.appPlayer.renderFlightConfigPanel();
      window.LB.appPlayer.renderPlayers();
      renderScoreTable();
      renderLeaderboard();
      scheduleOperatorFlightConfigPublish();
      return;
    }

    if (field === "division-gender-mode") {
      const genderMode = target.value === "separate" ? "separate" : "combined";
      const flights = genderMode === "separate"
        ? [
            ...window.LB.appPlayer.getDefaultFlightConfig(cfg.maleDivisionCount || 3, "male"),
            ...window.LB.appPlayer.getDefaultFlightConfig(cfg.femaleDivisionCount || 3, "female")
          ]
        : window.LB.appPlayer.getDefaultFlightConfig(cfg.divisionCount || 3);
      state().flightConfig = window.LB.appPlayer.normalizeFlightConfig({
        ...cfg,
        genderMode,
        flights,
        fixedDivisionName: flights[0]?.name || "",
        fixedFlightName: flights[0]?.name || ""
      });
      window.LB.appPlayer.applyFlightConfig(state().flightConfig);
      window.LB.storage.saveState();
      window.LB.appPlayer.renderFlightConfigPanel();
      window.LB.appPlayer.renderPlayers();
      renderScoreTable();
      renderLeaderboard();
      scheduleOperatorFlightConfigPublish();
      return;
    }
    if (field === "flight-count") {
      const count = window.LB.scoring.clampInt(target.value, 1, 8, 3);
      const flights = window.LB.appPlayer.getDefaultFlightConfig(count);
      state().flightConfig = window.LB.appPlayer.normalizeFlightConfig({
        ...cfg,
        genderMode: "combined",
        divisionCount: count,
        flights,
        fixedDivisionName: flights[0]?.name || "",
        fixedFlightName: flights[0]?.name || ""
      });
      window.LB.appPlayer.applyFlightConfig(state().flightConfig);
      window.LB.storage.saveState();
      window.LB.appPlayer.renderFlightConfigPanel();
      window.LB.appPlayer.renderPlayers();
      renderScoreTable();
      renderLeaderboard();
      scheduleOperatorFlightConfigPublish();
      return;
    }
    if (field === "division-count-male" || field === "division-count-female") {
      const maleCount = field === "division-count-male"
        ? window.LB.scoring.clampInt(target.value, 1, 8, 3)
        : (window.LB.appPlayer.countDivisionsByGender(cfg.flights, "male") || cfg.maleDivisionCount || 3);
      const femaleCount = field === "division-count-female"
        ? window.LB.scoring.clampInt(target.value, 1, 8, 3)
        : (window.LB.appPlayer.countDivisionsByGender(cfg.flights, "female") || cfg.femaleDivisionCount || 3);
      const flights = [
        ...window.LB.appPlayer.getDefaultFlightConfig(maleCount, "male"),
        ...window.LB.appPlayer.getDefaultFlightConfig(femaleCount, "female")
      ];
      state().flightConfig = window.LB.appPlayer.normalizeFlightConfig({
        ...cfg,
        genderMode: "separate",
        maleDivisionCount: maleCount,
        femaleDivisionCount: femaleCount,
        flights,
        fixedDivisionName: flights[0]?.name || "",
        fixedFlightName: flights[0]?.name || ""
      });
      window.LB.appPlayer.applyFlightConfig(state().flightConfig);
      window.LB.storage.saveState();
      window.LB.appPlayer.renderFlightConfigPanel();
      window.LB.appPlayer.renderPlayers();
      renderScoreTable();
      renderLeaderboard();
      scheduleOperatorFlightConfigPublish();
      return;
    }
    if (field === "best-gross-scope") {
      // Logic cũ đã được loại bỏ
      return;
    }
    if (field === "flight-allow-jump") {
      state().flightConfig = window.LB.appPlayer.normalizeFlightConfig({ ...cfg, allowFlightJump: !!target.checked });
      window.LB.appPlayer.renderFlightConfigStatus();
      window.LB.storage.saveState();
      scheduleOperatorFlightConfigPublish();
      return;
    }
    const row = target.closest("[data-flight-index]");
    if (!row || !target.dataset.flightField) return;
    const index = Number.parseInt(row.dataset.flightIndex, 10);
    const flights = cfg.flights.map(flight => ({ ...flight }));
    const flight = flights[index];
    if (!flight) return;
    if (target.dataset.flightField === "name") flight.name = target.value.trim();
    if (target.dataset.flightField === "gender") flight.gender = window.LB.appPlayer.normalizeGender(target.value);
    if (target.dataset.flightField === "isSystem36") {
      flight.isSystem36 = !!target.checked;
      flight.scoringMode = flight.isSystem36 ? "system36" : "handicap";
    }
    if (target.dataset.flightField === "scoringMode") {
      flight.scoringMode = target.value;
      flight.isSystem36 = flight.scoringMode === "system36";
    }
    if (target.dataset.flightField === "min" || target.dataset.flightField === "max") {
      const fieldName = target.dataset.flightField;
      const nextValue = window.LB.scoring.clampInt(target.value, -10, 54, fieldName === "min" ? flight.min : flight.max);
      flight[fieldName] = nextValue;
      const bucket = window.LB.appPlayer.getFlightBucket(flight, cfg);
      if (fieldName === "min") {
        for (let previousIndex = index - 1; previousIndex >= 0; previousIndex -= 1) {
          if (window.LB.appPlayer.getFlightBucket(flights[previousIndex], cfg) !== bucket) continue;
          flights[previousIndex].max = window.LB.scoring.clampInt(nextValue - 1, -10, 54, flights[previousIndex].max);
          break;
        }
      }
      if (fieldName === "max") {
        for (let nextIndex = index + 1; nextIndex < flights.length; nextIndex += 1) {
          if (window.LB.appPlayer.getFlightBucket(flights[nextIndex], cfg) !== bucket) continue;
          flights[nextIndex].min = window.LB.scoring.clampInt(nextValue + 1, -10, 54, flights[nextIndex].min);
          break;
        }
      }
    }
    state().flightConfig = window.LB.appPlayer.normalizeFlightConfig({ ...cfg, flights });
    window.LB.appPlayer.applyFlightConfig(state().flightConfig);
    if (["min", "max"].includes(target.dataset.flightField)) window.LB.appPlayer.renderFlightConfigPanel();
    else window.LB.appPlayer.renderFlightConfigStatus();
    window.LB.appPlayer.renderPlayers();
    renderScoreTable();
    renderLeaderboard();
    window.LB.storage.saveState();
    scheduleOperatorFlightConfigPublish();
  }

function confirmFlightConfig() {
    const result = window.LB.appPlayer.validateFlightConfig();
    if (!result.ok) {
      window.LB.appPlayer.renderFlightConfigStatus();
      alert(result.message);
      return;
    }
    state().flightConfig = window.LB.appPlayer.normalizeFlightConfig({
      ...(state().flightConfig || {}),
      rosterImportReady: true
    });
    window.LB.storage.saveState();
    window.LB.appPlayer.renderFlightConfigStatus();
    scheduleOperatorFlightConfigPublish();
  }

function normalizeLeaderboardCourseHoles(holes = []) {
    const byHole = {};
    (Array.isArray(holes) ? holes : []).forEach(item => {
      const hole = window.LB.scoring.clampInt(item.hole ?? item.hole_number, 1, 18, 0);
      if (!hole) return;
      const si = item.stroke_index_men || item.strokeIndexMen || item.stroke_index || item.strokeIndex || hole;
      byHole[hole] = {
        hole,
        par: window.LB.scoring.clampInt(item.par, 3, 6, 4),
        strokeIndex: window.LB.scoring.clampInt(si, 1, 18, hole)
      };
    });
    return Array.from({ length: 18 }, (_, index) => byHole[index + 1] || {
      hole: index + 1,
      par: 4,
      strokeIndex: index + 1
    });
  }

function readOfflineCourseAliases(value = []) {
    const rawAliases = Array.isArray(value) ? value : String(value || "").split(",");
    const seen = new Set();
    const aliases = [];
    rawAliases.forEach(alias => {
      const cleanAlias = window.LB.appUtils.cleanText(alias);
      const key = window.LB.appUtils.keyText(cleanAlias);
      if (!cleanAlias || seen.has(key)) return;
      seen.add(key);
      aliases.push(cleanAlias);
    });
    return aliases;
  }

function normalizeOfflineCourseCatalogCourse(raw = {}) {
    const name = window.LB.appUtils.cleanText(raw.name || raw.courseName || raw.course_name || "");
    if (!name) return null;
    const location = window.LB.appUtils.cleanText(raw.location || raw.province || raw.city || raw.country || "");
    const aliases = window.LB.appPlayer.readOfflineCourseAliases(raw.aliases || raw.alias || []);
    const holes = window.LB.appPlayer.normalizeLeaderboardCourseHoles(raw.holes_data || raw.holesData || raw.holes || []);
    const totalPar = holes.reduce((sum, hole) => sum + window.LB.scoring.clampInt(hole.par, 3, 6, 4), 0);
    const displayName = location ? `${name} · ${location}` : name;
    const searchKeys = Array.from(new Set([
      name,
      displayName,
      location ? `${location} ${name}` : "",
      ...aliases
    ].map(window.LB.appUtils.keyText).filter(Boolean)));
    return {
      id: window.LB.appUtils.cleanText(raw.id || raw.courseId || raw.course_id || ""),
      name,
      location,
      aliases,
      displayName,
      totalPar,
      holes,
      holes_data: holes.map(hole => ({
        hole: hole.hole,
        par: hole.par,
        stroke_index: hole.strokeIndex,
        stroke_index_men: hole.strokeIndex,
        strokeIndex: hole.strokeIndex,
        strokeIndexMen: hole.strokeIndex
      })),
      searchKeys,
      updatedAt: raw.updatedAt || raw.updated_at || ""
    };
  }

function normalizeOfflineCourseCatalogPayload(payload = {}) {
    const rawCourses = Array.isArray(payload)
      ? payload
      : Array.isArray(payload.courses)
        ? payload.courses
        : [];
    const byKey = new Map();
    rawCourses.forEach(rawCourse => {
      const course = window.LB.appPlayer.normalizeOfflineCourseCatalogCourse(rawCourse);
      if (!course) return;
      const key = window.LB.appUtils.keyText(`${course.name} ${course.location}`);
      if (!byKey.has(key)) byKey.set(key, course);
    });
    return Array.from(byKey.values())
      .sort((a, b) => a.displayName.localeCompare(b.displayName, "vi"));
  }

function setOfflineCourseStatus(message = "", mode = "") {
    const status = document.getElementById("offline-course-status");
    if (!status) return;
    const icon = mode === "linked" ? "✓" : "i";
    status.hidden = !message;
    status.textContent = icon;
    status.title = message;
    status.setAttribute("aria-label", message);
    status.classList.toggle("is-linked", mode === "linked");
    status.classList.toggle("is-error", mode === "error");
  }

function clearOfflineCourseSelectionLock(value = state().tournament.courseName) {
    const selected = state().course?.offlineCatalogCourse;
    if (!selected) return false;
    const stillSelected = window.LB.appUtils.keyText(value) === window.LB.appUtils.keyText(selected.name);
    if (stillSelected) return false;
    delete state().course.offlineCatalogCourse;
    offlineCourseCatalogNotice = "";
    renderOfflineCourseStatus();
    return true;
  }

function isOfflineCourseSelectionLocked() {
    const selected = state().course?.offlineCatalogCourse;
    if (!selected) return false;
    return window.LB.appUtils.keyText(state().tournament.courseName) === window.LB.appUtils.keyText(selected.name);
  }

function renderCourseGrid() {
    const root = document.getElementById("course-grid");
    if (!root) return;
    const holes = window.LB.appPlayer.normalizeLeaderboardCourseHoles(state().course?.holes || []);
    const lockedByOfflineCourse = window.LB.appPlayer.isOfflineCourseSelectionLocked();
    const lockedByCloudRuntime = window.LB.appUtils.getCapabilities().cloudRuntime;
    const locked = lockedByOfflineCourse || lockedByCloudRuntime;
    const lockTitle = lockedByCloudRuntime
      ? "Mode 3 khóa Par/SI theo course snapshot của tournament."
      : "Par/SI đang khóa vì sân được chọn từ offline list. Đổi tên sân thủ công để mở nhập tay.";
    state().course = state().course || {};
    state().course.holes = holes;
    root.innerHTML = holes.map(hole => `
      <div class="course-hole ${locked ? "is-readonly" : ""}" data-hole="${hole.hole}">
        <span>H${hole.hole}</span>
        <div class="course-hole-row">
          <label class="course-hole-field" aria-label="Par hố ${hole.hole}${locked ? " - đang khóa" : ""}">
            <em>P</em>
            <input data-field="par" type="text" inputmode="numeric" pattern="[0-9]*" value="${window.LB.appUtils.escapeHtml(hole.par)}" ${locked ? `readonly tabindex="-1" title="${window.LB.appUtils.escapeHtml(lockTitle)}"` : ""}>
          </label>
          <label class="course-hole-field" aria-label="Stroke Index hố ${hole.hole}${locked ? " - đang khóa" : ""}">
            <em>SI</em>
            <input data-field="si" type="text" inputmode="numeric" pattern="[0-9]*" value="${window.LB.appUtils.escapeHtml(hole.strokeIndex)}" ${locked ? `readonly tabindex="-1" title="${window.LB.appUtils.escapeHtml(lockTitle)}"` : ""}>
          </label>
        </div>
      </div>
    `).join("");
  }

function getFilteredPlayersForQuery(players = [], query = "") {
    return !query ? players : players.filter(player => window.LB.appUtils.playerMatchesSearch(player, query));
  }

function groupPlayersForPanel(players = []) {
    const groups = [];
    const byKey = new Map();
    players.forEach(player => {
      const assignment = window.LB.appPlayer.normalizePlayerFlightAssignment(player);
      const key = assignment.flightGroup || "unassigned";
      if (!byKey.has(key)) {
        const isUnassigned = !assignment.flightGroup;
        const group = {
          key,
          label: isUnassigned ? "Chưa phân Flight" : assignment.flightGroup,
          startHole: assignment.startHole || "",
          players: [],
          isUnassigned
        };
        byKey.set(key, group);
        if (isUnassigned) groups.unshift(group);
        else groups.push(group);
      }
      byKey.get(key).players.push(player);
    });
    const unassigned = groups.filter(group => group.isUnassigned);
    const assigned = groups.filter(group => !group.isUnassigned);
    return [...unassigned, ...assigned];
  }

function renderPlayerField(className, label, tooltip, control) {
    return `
      <div class="player-field ${className}" data-tooltip="${window.LB.appUtils.escapeHtml(tooltip)}">
        <span class="player-field-label">${window.LB.appUtils.escapeHtml(label)}</span>
        ${control}
      </div>
    `;
  }

function renderPlayerRow(player, showHcpIndex, flightGroupOptions) {
    const assignment = window.LB.appPlayer.normalizePlayerFlightAssignment(player);
    const playerHandicap = window.LB.appPlayer.getPlayerCourseHandicapValue(player);
    const division = window.LB.appPlayer.getPlayerDivision(player) || (window.LB.appPlayer.hasNumericPlayerValue(playerHandicap) ? window.LB.appPlayer.getFlightNameForHandicap(playerHandicap, player.gender) : "");
    const divisionOptions = window.LB.appPlayer.getDivisionSelectOptions(division, player.gender);
    const caddyNumber = window.LB.appUtils.cleanText(player.caddyNumber || "");
    const duplicateClass = player.caddyDuplicate && /^\d+$/.test(caddyNumber) ? "is-caddy-duplicate" : "";
    const review = window.LB.appPlayer.getPlayerProfileReviewState(player);
    const needsProfileConfirmation = review.vga || review.handicapIndex || review.courseHandicap;
    const rowClasses = [
      "player-row",
      review.division ? "is-division-review" : "",
      needsProfileConfirmation ? "is-profile-review" : ""
    ].filter(Boolean).join(" ");
    const idReviewClass = review.vga ? "is-review-field" : "";
    const indexReviewClass = review.handicapIndex ? "is-review-field" : "";
    const handicapReviewClass = review.courseHandicap ? "is-review-field" : "";
    const divisionReviewClass = review.division ? "is-review-field is-division-review-field" : "";
    return `
      <article class="${rowClasses}" data-player-id="${window.LB.appUtils.escapeHtml(player.id)}">
        ${window.LB.appPlayer.renderPlayerField(
          "player-field-name",
          "Golfer",
          "Tên golfer hiển thị trong danh sách và bảng xếp hạng.",
          `<input data-field="name" type="text" value="${window.LB.appUtils.escapeHtml(player.name)}" placeholder="Tên golfer" aria-label="Tên golfer">`
        )}
        ${window.LB.appPlayer.renderPlayerField(
          "player-field-id",
          "ID",
          review.vga ? "Chưa có VGA. Nhập mã VGA hoặc xác nhận sử dụng ID CLW nội bộ." : "Mã VGA hoặc ID CLW nội bộ của golfer.",
          `<input data-field="vgaId" class="${idReviewClass}" type="text" value="${window.LB.appUtils.escapeHtml(player.vgaId || player.golferId || "")}" placeholder="ID / CLW" aria-label="ID golfer">`
        )}
        ${showHcpIndex ? window.LB.appPlayer.renderPlayerField(
          "player-field-index",
          "Index",
          review.handicapIndex ? "Thiếu HCP Index. Nhập WHS Index nếu có hoặc xác nhận bỏ qua." : "WHS Handicap Index dùng để tính handicap sân.",
          `<input data-field="handicapIndex" class="${indexReviewClass}" type="number" min="-10" max="54" step="0.1" value="${window.LB.appUtils.escapeHtml(player.handicapIndex ?? "")}" placeholder="Index" aria-label="HCP Index">`
        ) : ""}
        ${window.LB.appPlayer.renderPlayerField(
          "player-field-handicap",
          "HCP sân",
          review.courseHandicap ? "Thiếu handicap sân. Nhập giá trị hoặc chọn bảng rồi xác nhận bỏ qua." : "Course Handicap áp dụng cho tournament này.",
          `<input data-field="handicap" class="${handicapReviewClass}" type="number" min="-10" max="54" step="1" value="${window.LB.appUtils.escapeHtml(playerHandicap)}" placeholder="HCP" aria-label="HCP sân">`
        )}
        ${window.LB.appPlayer.renderPlayerField(
          "player-field-gender",
          "Giới tính",
          "Giới tính dùng để chọn rating và bảng đấu phù hợp.",
          `<select data-field="gender" aria-label="Giới tính">
            <option value="" ${!player.gender ? "selected" : ""}>Giới tính</option>
            <option value="male" ${player.gender === "male" ? "selected" : ""}>Nam</option>
            <option value="female" ${player.gender === "female" ? "selected" : ""}>Nữ</option>
          </select>`
        )}
        ${window.LB.appPlayer.renderPlayerField(
          "player-field-division",
          "Bảng",
          review.division ? "Bảng đấu chưa chắc chắn. GO hãy chọn lại bảng đúng." : `Bảng đấu được phân theo cấu hình: ${window.LB.appPlayer.renderFlightMeta()}`,
          `<select data-field="division" class="${divisionReviewClass}" aria-label="Bảng đấu">
            ${review.division ? `<option value="" selected>⚠ Chọn / xác nhận bảng</option>` : (division ? "" : `<option value="">Bảng đấu</option>`)}
            ${divisionOptions.map(name => `<option value="${window.LB.appUtils.escapeHtml(name)}" ${!review.division && name === division ? "selected" : ""}>${window.LB.appUtils.escapeHtml(window.LB.appPlayer.formatDivisionLabel(name))}</option>`).join("")}
          </select>`
        )}
        ${window.LB.appPlayer.renderPlayerField(
          "player-field-flight",
          "Flight",
          "Nhóm xuất phát của golfer trong vận hành giải.",
          `<select data-field="flightGroup" aria-label="Flight nhóm đấu">
            ${assignment.flightGroup ? "" : `<option value="">Flight</option>`}
            ${flightGroupOptions.map(option => `<option value="${option}" ${option === assignment.flightGroup ? "selected" : ""}>${option}</option>`).join("")}
          </select>`
        )}
        ${window.LB.appPlayer.renderPlayerField(
          "player-field-hole",
          "Hố",
          "Hố xuất phát được suy ra từ Flight đã chọn.",
          `<input data-field="startHole" type="text" value="${window.LB.appUtils.escapeHtml(assignment.startHole)}" placeholder="Hố" aria-label="Hố xuất phát" readonly>`
        )}
        ${window.LB.appPlayer.renderPlayerField(
          "player-field-caddy",
          "Caddy",
          "Số caddy. Hệ thống sẽ cảnh báo khi bị trùng trong danh sách.",
          `<input data-field="caddyNumber" class="${duplicateClass}" type="text" value="${window.LB.appUtils.escapeHtml(player.caddyNumber || "")}" placeholder="CD" aria-label="Số caddy">`
        )}
        ${window.LB.appPlayer.renderPlayerField(
          "player-field-award",
          "Tính giải",
          "Tắt lựa chọn này nếu golfer không được tính giải.",
          `<label class="award-toggle">
            <input data-field="awardEligible" type="checkbox" ${player.awardEligible === false ? "" : "checked"}>
            <span>Giải</span>
            <input type="hidden" data-field="operationNote" value="${window.LB.appUtils.escapeHtml(player.operationNote || player.note || "")}">
          </label>`
        )}
        ${window.LB.appPlayer.renderPlayerField(
          "player-field-note",
          "Ghi chú",
          "Ghi chú vận hành nội bộ, không công khai trên leaderboard.",
          `<input data-field="operationNote" type="text" value="${window.LB.appUtils.escapeHtml(player.operationNote || player.note || "")}" placeholder="Note vận hành" aria-label="Ghi chú vận hành">`
        )}
        <div class="player-row-actions">
          ${needsProfileConfirmation ? `<button class="player-review-confirm" type="button" data-action="confirm-player-import-review" title="Xác nhận dữ liệu ID và handicap hiện tại">Xác nhận</button>` : ""}
          <button class="player-remove-button" type="button" data-action="remove-player">Xóa</button>
        </div>
      </article>
    `;
  }

function renderPlayers() {
    const root = document.getElementById("player-list");
    if (!root) return;
    window.LB.appPlayer.syncPlayerIdentities();
    const showHcpIndex = window.LB.appPlayer.shouldShowHandicapIndex();
    root.classList.toggle("has-hcp-index", showHcpIndex);
    syncPlayerSearchField();
    const flightGroupOptions = window.LB.appPlayer.getFlightGroupOptions();
    const visiblePlayers = getFilteredPlayers(state().players);
    const groups = window.LB.appPlayer.groupPlayersForPanel(visiblePlayers);
    root.innerHTML = groups.length ? groups.map(group => `
      <section class="player-flight-group ${group.isUnassigned ? "is-unassigned" : ""}" data-flight-group="${window.LB.appUtils.escapeHtml(group.key)}">
        <div class="player-flight-group-head">
          <strong>Flight ${window.LB.appUtils.escapeHtml(group.label)}</strong>
          <span>${group.startHole ? `Hố ${window.LB.appUtils.escapeHtml(group.startHole)} · ` : ""}${group.players.length} golfer</span>
        </div>
        ${group.players.map(player => window.LB.appPlayer.renderPlayerRow(player, showHcpIndex, flightGroupOptions)).join("")}
      </section>
    `).join("") : `<div class="empty-state">Không tìm thấy golfer phù hợp.</div>`;
  }

function formatHandicapValue(value) {
    if (value === "" || value === null || value === undefined) return "-";
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) return window.LB.appPrint.formatPrintValue(value);
    return numeric.toFixed(1).replace(/\.0$/, "");
  }

function printPlayerRoster(layoutInput = "landscape") {
    const printLayout = window.LB.appPrint.getPlayerRosterPrintLayout(layoutInput);
    window.LB.appPlayer.syncPlayerIdentities();
    window.LB.appUtils.recomputeCaddyDuplicates();
    const frame = document.createElement("iframe");
    frame.className = "print-frame";
    frame.dataset.printLayout = printLayout.id;
    frame.setAttribute("aria-hidden", "true");
    frame.style.width = printLayout.frameWidth;
    frame.style.height = printLayout.frameHeight;
    document.body.appendChild(frame);
    const printWindow = frame.contentWindow;
    const doc = printWindow?.document;
    if (!printWindow || !doc) {
      frame.remove();
      return;
    }
    doc.open();
    doc.write(window.LB.appPrint.buildPlayerRosterPrintDocument(printLayout.id));
    doc.close();
    const cleanup = () => window.setTimeout(() => frame.remove(), 800);
    printWindow.onafterprint = cleanup;
    window.setTimeout(() => {
      printWindow.focus();
      printWindow.print();
      window.setTimeout(() => {
        if (document.body.contains(frame)) frame.remove();
      }, 2500);
    }, 150);
  }

function sortScoreEntryPlayers(players = []) {
    return [...players].sort((a, b) => {
      const assignmentA = window.LB.appPlayer.normalizePlayerFlightAssignment(a);
      const assignmentB = window.LB.appPlayer.normalizePlayerFlightAssignment(b);
      return window.LB.appPlayer.compareFlightAssignments(assignmentA, assignmentB)
        || (assignmentA.startHole || "").localeCompare(assignmentB.startHole || "", "vi", { numeric: true })
        || (a.name || "").localeCompare(b.name || "", "vi");
    });
  }

function groupScoreEntryPlayers(players = []) {
    const groups = [];
    const byKey = new Map();
    players.forEach(player => {
      const assignment = window.LB.appPlayer.normalizePlayerFlightAssignment(player);
      const key = assignment.flightGroup || "unassigned";
      if (!byKey.has(key)) {
        const isUnassigned = !assignment.flightGroup;
        const group = {
          key,
          label: isUnassigned ? "Chưa phân Flight" : assignment.flightGroup,
          startHole: assignment.startHole || "",
          players: [],
          isUnassigned
        };
        byKey.set(key, group);
        if (isUnassigned) groups.unshift(group);
        else groups.push(group);
      }
      byKey.get(key).players.push(player);
    });
    const unassigned = groups.filter(group => group.isUnassigned);
    const assigned = groups.filter(group => !group.isUnassigned);
    return [...unassigned, ...assigned];
  }

function renderMobileScorePlayer(player, halves) {
    const summary = window.LB.scoring.summarizePlayer(state(), player, { includeStaging: true });
    const publicId = window.LB.appPlayer.getPlayerPublicId(player);
    const pendingCount = window.LB.appPlayer.getPlayerPendingScoreCount(player.id);
    const holeScores = summary.holeScores || {};
    let frontGross = 0, backGross = 0, frontPlayed = 0, backPlayed = 0;
    for (let h = 1; h <= 18; h++) {
      const v = Number(holeScores[h] ?? holeScores[String(h)]);
      if (Number.isFinite(v) && v > 0) {
        if (h <= 9) { frontGross += v; frontPlayed++; }
        else { backGross += v; backPlayed++; }
      }
    }
    const frontDisplay = frontPlayed > 0 ? frontGross : "-";
    const backDisplay = backPlayed > 0 ? backGross : "-";
    const totalDisplay = (frontPlayed > 0 || backPlayed > 0) ? (frontGross + backGross) : "-";
    return `
      <article class="score-mobile-player" data-player-id="${window.LB.appUtils.escapeHtml(player.id)}">
        <div class="score-mobile-player-bar">
          <div class="score-mobile-player-info">
            <strong>${window.LB.appUtils.escapeHtml(player.name || "Golfer")}</strong>
            <small>${publicId ? `${window.LB.appUtils.escapeHtml(publicId)} · ` : ""}HCP ${window.LB.appUtils.escapeHtml(player.handicap || 0)}</small>
          </div>
          <div class="score-mobile-half-totals">
            <div class="score-mobile-half-total" title="Front 9 gross">
              <span>Front</span>
              <strong>${frontDisplay}</strong>
            </div>
            <div class="score-mobile-half-total" title="Back 9 gross">
              <span>Back</span>
              <strong>${backDisplay}</strong>
            </div>
            <div class="score-mobile-half-total" title="Total gross">
              <span>Total</span>
              <strong>${totalDisplay}</strong>
            </div>
          </div>
          <div class="score-mobile-total" title="Số hố đã nhập">
            <span></span>
            <strong>${summary.holesPlayed}/18</strong>
          </div>
          <button class="row-confirm-button score-mobile-confirm" type="button" data-action="confirm-player-scores" data-player-id="${window.LB.appUtils.escapeHtml(player.id)}" ${pendingCount ? "" : "disabled"} title="${pendingCount ? `Xác nhận ${pendingCount} điểm đang chờ của ${window.LB.appUtils.escapeHtml(player.name || "golfer")}` : "Không có điểm chờ xác nhận"}">${pendingCount ? `Duyệt ${pendingCount}` : "✓"}</button>
        </div>
        <div class="score-mobile-score-rows">
          ${halves.map(holes => `
            <div class="score-mobile-hole-grid score-mobile-score-row">
              ${holes.map(hole => renderScoreCell(player, hole, { mobile: true })).join("")}
            </div>
          `).join("")}
        </div>
      </article>
    `;
  }

  return { normalizeGender, inferGenderFromName, getPlayerDivision, getConfiguredDivisionNames, getDivisionSelectOptions, isFlightSystem36, getFlightConfigByName, isDivisionSystem36, extractFlightGroupWithSuffix, normalizeFlightGroupLabel, getStartHoleFromFlightGroup, getFlightGroupOrder, compareFlightAssignments, comparePlayersByFlight, sortPlayersByFlightInPlace, normalizePlayerFlightAssignment, getFlightGroupOptions, getFlightBucket, formatDivisionLabel, getDivisionList, setPlayerDivision, getSystem36FlightsForPlayer, getPreferredSystem36DivisionForPlayer, setPlayerSystem36Division, ensurePlayerIdentity, syncPlayerIdentities, getGenderLabel, getCourseParTotal, getHandicapRating, calculateCourseHandicap, hasNumericPlayerValue, getPlayerCourseHandicapValue, shouldShowHandicapIndex, hasCourseHandicapLock, recomputeCourseHandicapsFromIndex, getPlayerPublicId, playerMatchesClaimedPlayer, findSuggestedPlayer, applyPendingScoresToPlayer, getPlayerProfileReviewState, markPlayerProfileReviewPending, confirmPlayerImportReview, getPlayerSearchField, renderPlayerSearchInput, addPlayer, applySimulator2RosterPlayers, removePlayer, confirmPlayerScores, getPlayerPendingScoreCount, normalizeFlightConfig, applyFlightConfig, getFlightNameForHandicap, renderFlightMeta, getDefaultFlightConfig, buildSystem36FlightConfig, countDivisionsByGender, validateFlightConfig, isFlightConfigReadyForRosterImport, renderFlightConfigStatus, renderFlightConfigPanel, handleFlightConfigInput, confirmFlightConfig, normalizeLeaderboardCourseHoles, readOfflineCourseAliases, normalizeOfflineCourseCatalogCourse, normalizeOfflineCourseCatalogPayload, setOfflineCourseStatus, clearOfflineCourseSelectionLock, isOfflineCourseSelectionLocked, renderCourseGrid, getFilteredPlayersForQuery, groupPlayersForPanel, renderPlayerField, renderPlayerRow, renderPlayers, formatHandicapValue, printPlayerRoster, sortScoreEntryPlayers, groupScoreEntryPlayers, renderMobileScorePlayer };
})();
