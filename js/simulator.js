(function () {
  if (window.LB?.getCapabilities?.().canUseSimulator === false) return;

  const BACKUP_KEY = "lbpro_simulator_backup_state";
  const LEGACY_HISTORY_KEY = "lbpro_simulator_history";
  const MAX_LOG_ITEMS = 900;
  const NEXT_SHARE_PAGE_SHELL_BYTES = 430 * 1024;
  const NEXT_PUBLIC_API_OVERHEAD_BYTES = 2 * 1024;
  const NEXT_PUBLIC_API_RANKING_MULTIPLIER = 1.35;
  const FINAL_RESULTS_EFFECT_BYTES = 260 * 1024;
  const AWARD_ASSET_COUNT = 4;
  const AWARD_ASSET_BYTES = 160 * 1024;
  let runTimer = null;

  const vietnameseFamilyNames = [
    "Nguyễn", "Trần", "Lê", "Phạm", "Hoàng", "Huỳnh", "Phan", "Vũ", "Võ", "Đặng",
    "Bùi", "Đỗ", "Hồ", "Ngô", "Dương", "Lý", "Đinh", "Mai", "Trịnh", "Đoàn",
    "Cao", "Tạ", "Hà", "Chu", "Lương", "Quách", "Tô", "Kiều", "Khương", "La",
    "Thái", "Tăng", "Châu", "Lâm", "Ninh", "Trương", "Tống"
  ];

  const vietnameseMiddleNames = [
    "Văn", "Hữu", "Đức", "Minh", "Quốc", "Anh", "Thành", "Công", "Xuân", "Ngọc",
    "Hoàng", "Tuấn", "Quang", "Nhật", "Gia", "Đình", "Thanh", "Tiến", "Trọng", "Mạnh",
    "Duy", "Bá", "Hải", "Phúc", "Thiện", "Khánh", "Bảo", "Thế", "Trung", "Đăng",
    "Tấn", "Chí", "Đông", "Việt", "Nam", "Sơn", "Vĩnh", "Đại", "Phương", "Thiên",
    "Vũ", "Đắc", "Sỹ"
  ];

  const vietnameseGivenNames = [
    "An", "Bách", "Bình", "Cường", "Dũng", "Duy", "Đạt", "Đức", "Giang", "Hải",
    "Hiếu", "Hoàng", "Hùng", "Huy", "Khang", "Khánh", "Khiêm", "Kiên", "Lâm", "Long",
    "Minh", "Nam", "Nghĩa", "Nguyên", "Nhân", "Phong", "Phúc", "Quân", "Quang", "Sơn",
    "Tài", "Tâm", "Tân", "Thắng", "Thành", "Thiện", "Thịnh", "Thọ", "Trí", "Trung",
    "Trường", "Tuấn", "Việt", "Vinh", "Vũ", "Bảo", "Công", "Danh", "Dương", "Đông",
    "Hào", "Hậu", "Hưng", "Khoa", "Khôi", "Kiệt", "Luân", "Mạnh", "Nhật", "Phát",
    "Phi", "Phương", "Quý", "Tùng", "Vương", "Xuân", "Đăng", "Hà", "Lộc", "Toàn",
    "Triều", "Uy", "Viễn"
  ];

  const simulatorStoryRoles = [
    { role: "comeback", story: "Tâm điểm lội ngược dòng" },
    { role: "steady", story: "Golfer giữ Par ổn định" },
    { role: "early_leader_collapse", story: "Dẫn đầu sớm rồi hụt hơi" },
    { role: "silent_contender", story: "Nhân tố bứt phá thầm lặng" },
    { role: "chaser", story: "Golfer bám đuổi nhóm đầu" }
  ];

  function state() {
    return window.LB.state;
  }

  function clone(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function cleanInt(value, min, max, fallback) {
    const parsed = Number.parseInt(String(value), 10);
    if (!Number.isFinite(parsed)) return fallback;
    return Math.max(min, Math.min(max, parsed));
  }

  function cleanFloat(value, min, max, fallback) {
    const parsed = Number.parseFloat(String(value));
    if (!Number.isFinite(parsed)) return fallback;
    return Math.max(min, Math.min(max, parsed));
  }

  function optionalInt(id) {
    const raw = document.getElementById(id)?.value;
    if (raw === undefined || raw === null || String(raw).trim() === "") return null;
    return cleanInt(raw, 0, 10000, 0);
  }

  function normalizeViewerSegments(total, segments = null) {
    const safeTotal = Math.max(0, total);
    const values = segments ? {
      directFull: cleanInt(segments.directFull, 0, 10000, 0),
      directBurst: cleanInt(segments.directBurst, 0, 10000, 0),
      indirectFull: cleanInt(segments.indirectFull, 0, 10000, 0),
      indirectBurst: cleanInt(segments.indirectBurst, 0, 10000, 0)
    } : null;
    if (values && Object.values(values).some(value => value > 0)) return values;
    const autoDirectFull = Math.round(safeTotal * 0.12);
    const autoDirectBurst = Math.round(safeTotal * 0.48);
    const autoIndirectFull = Math.round(safeTotal * 0.12);
    return {
      directFull: autoDirectFull,
      directBurst: autoDirectBurst,
      indirectFull: autoIndirectFull,
      indirectBurst: Math.max(0, safeTotal - autoDirectFull - autoDirectBurst - autoIndirectFull)
    };
  }

  function buildViewerConfig(total) {
    const directFull = optionalInt("sim-viewer-direct-full");
    const directBurst = optionalInt("sim-viewer-direct-burst");
    const indirectFull = optionalInt("sim-viewer-indirect-full");
    const indirectBurst = optionalInt("sim-viewer-indirect-burst");
    const values = [directFull, directBurst, indirectFull, indirectBurst];
    const manualViewerSegments = values.some(value => value !== null);
    const viewerSegments = manualViewerSegments
      ? normalizeViewerSegments(total, {
        directFull: directFull || 0,
        directBurst: directBurst || 0,
        indirectFull: indirectFull || 0,
        indirectBurst: indirectBurst || 0
      })
      : normalizeViewerSegments(total);
    return { viewerSegments, manualViewerSegments };
  }

  function hashText(value = "") {
    let hash = 0;
    for (const char of String(value)) {
      hash = ((hash << 5) - hash) + char.charCodeAt(0);
      hash |= 0;
    }
    return Math.abs(hash);
  }

  function createScenarioSeed() {
    const values = new Uint32Array(2);
    if (window.crypto?.getRandomValues) window.crypto.getRandomValues(values);
    else {
      values[0] = Date.now() >>> 0;
      values[1] = Math.floor(Math.random() * 0xffffffff) >>> 0;
    }
    return `${Date.now().toString(36)}-${values[0].toString(36)}-${values[1].toString(36)}`;
  }

  function createSeededRandom(seed) {
    let value = hashText(seed) || 0x6d2b79f5;
    return function random() {
      value |= 0;
      value = (value + 0x6d2b79f5) | 0;
      let next = Math.imul(value ^ (value >>> 15), 1 | value);
      next = (next + Math.imul(next ^ (next >>> 7), 61 | next)) ^ next;
      return ((next ^ (next >>> 14)) >>> 0) / 4294967296;
    };
  }

  function randomInt(random, min, max) {
    return min + Math.floor(random() * (max - min + 1));
  }

  function shuffle(values, random) {
    const rows = [...values];
    for (let index = rows.length - 1; index > 0; index -= 1) {
      const target = randomInt(random, 0, index);
      [rows[index], rows[target]] = [rows[target], rows[index]];
    }
    return rows;
  }

  function nowIso() {
    return new Date().toISOString();
  }

  function escapeHtml(value = "") {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function estimateJsonBytes(value) {
    const json = typeof value === "string" ? value : JSON.stringify(value || {});
    if (window.TextEncoder) return new TextEncoder().encode(json).length;
    return json.length * 2;
  }

  function formatNumber(value) {
    return Math.round(Number(value) || 0).toLocaleString("vi-VN");
  }

  function formatBytes(bytes) {
    const value = Number(bytes) || 0;
    if (value >= 1024 * 1024) return `${(value / 1024 / 1024).toFixed(2)} MB`;
    if (value >= 1024) return `${(value / 1024).toFixed(1)} KB`;
    return `${Math.round(value)} B`;
  }

  function formatDuration(seconds) {
    const value = Math.max(0, Math.round(Number(seconds) || 0));
    const hours = Math.floor(value / 3600);
    const minutes = Math.floor(value / 60);
    const rest = value % 60;
    if (hours) return `${hours}h ${Math.floor((value % 3600) / 60)}m`;
    return minutes ? `${minutes}m ${rest}s` : `${rest}s`;
  }

  function getEnvMs(name, fallback) {
    const value = Number(window.ENV?.[name]);
    return Number.isFinite(value) && value > 0 ? value : fallback;
  }

  function getEnvSeconds(name, fallback, min = 1, max = 86400) {
    const value = Number(window.ENV?.[name]);
    return Number.isFinite(value) && value > 0
      ? Math.max(min, Math.min(max, Math.trunc(value)))
      : fallback;
  }

  function getConfigFromUi() {
    const playerCount = cleanInt(document.getElementById("sim-player-count")?.value, 6, 288, 25);
    const viewerInput = document.getElementById("sim-viewer-count")?.value;
    const fallbackViewerCount = Math.max(playerCount, Math.round(playerCount * 1.8));
    const viewerCount = cleanInt(viewerInput, 0, 10000, fallbackViewerCount);
    const viewerConfig = buildViewerConfig(viewerCount);
    return {
      playerCount,
      ts36UserCount: Math.min(playerCount, cleanInt(document.getElementById("sim-ts36-count")?.value, 0, 288, 25)),
      viewerCount,
      viewerSegments: viewerConfig.viewerSegments,
      manualViewerSegments: viewerConfig.manualViewerSegments,
      liveSeconds: cleanInt(document.getElementById("sim-live-seconds")?.value, 1, 120, 5),
      productionHours: cleanFloat(document.getElementById("sim-production-hours")?.value, 1, 12, 6),
      volatility: cleanInt(document.getElementById("sim-volatility")?.value, 1, 5, 4),
      scope: document.getElementById("sim-scope")?.value || "all"
    };
  }

  function addLog(message, type = "info") {
    const sim = state().simulator;
    if (!sim) return;
    sim.telemetry = sim.telemetry || {};
    sim.telemetry.logsCreated = (sim.telemetry.logsCreated || 0) + 1;
    sim.logs = Array.isArray(sim.logs) ? sim.logs : [];
    sim.logs.push({
      id: `sim-log-${Date.now().toString(36)}-${sim.logs.length}`,
      turn: sim.currentTurn || 0,
      type,
      message,
      at: nowIso()
    });
    if (sim.logs.length > MAX_LOG_ITEMS) sim.logs = sim.logs.slice(-MAX_LOG_ITEMS);
  }

  function buildVietnameseNames(playerCount, random) {
    const names = [];
    const usedNames = new Set();
    for (let index = 0; index < playerCount; index += 1) {
      let attempt = 0;
      while (attempt < 1000) {
        const family = vietnameseFamilyNames[randomInt(random, 0, vietnameseFamilyNames.length - 1)];
        const middle = vietnameseMiddleNames[randomInt(random, 0, vietnameseMiddleNames.length - 1)];
        const secondMiddle = random() < 0.24
          ? vietnameseMiddleNames[randomInt(random, 0, vietnameseMiddleNames.length - 1)]
          : "";
        const given = vietnameseGivenNames[randomInt(random, 0, vietnameseGivenNames.length - 1)];
        const name = [family, middle, secondMiddle, given].filter(Boolean).join(" ").toLocaleUpperCase("vi-VN");
        if (!usedNames.has(name)) {
          usedNames.add(name);
          names.push(name);
          break;
        }
        attempt += 1;
      }
    }
    return names;
  }

  function buildRoster(playerCount, random) {
    const names = buildVietnameseNames(playerCount, random);
    const usedVgaIds = new Set();
    const roleAssignments = new Map();
    shuffle(Array.from({ length: playerCount }, (_item, index) => index), random)
      .slice(0, Math.min(playerCount, simulatorStoryRoles.length))
      .forEach((playerIndex, roleIndex) => roleAssignments.set(playerIndex, simulatorStoryRoles[roleIndex]));
    const rows = names.map((name, index) => {
      const story = roleAssignments.get(index) || null;
      let vgaId = "";
      do vgaId = String(700000 + randomInt(random, 1, 299999));
      while (usedVgaIds.has(vgaId));
      usedVgaIds.add(vgaId);
      return {
        id: `sim-player-${index + 1}-${vgaId}`,
        vgaId,
        name,
        seed: Boolean(story),
        storyRole: story?.role || "",
        story: story?.story || "",
        templateIndex: index,
        group: 0,
        startHole: 1,
        teeSlot: "A"
      };
    });
    const groupSize = 4;
    const groupCount = Math.ceil(rows.length / groupSize);
    const scattered = shuffle(rows, random);

    return scattered.map((row, index) => {
      const group = Math.floor(index / groupSize) + 1;
      const holeBand = Math.floor((group - 1) / 18);
      const startHole = ((group - 1) % 18) + 1;
      return {
        ...row,
        group,
        startHole,
        teeSlot: String.fromCharCode(65 + (holeBand % 4)),
        groupCount
      };
    });
  }

  function getSimulatedHandicap(index, random) {
    const ranges = [
      { min: -2, max: 12 },
      { min: 13, max: 24 },
      { min: 25, max: 54 }
    ];
    const band = index % ranges.length;
    const range = ranges[band];
    const spread = range.max - range.min + 1;
    return range.min + randomInt(random, 0, spread - 1);
  }

  function getHandicapBand(handicap) {
    if (handicap <= 12) return "A";
    if (handicap <= 24) return "B";
    return "C";
  }

  function shouldUseSystem36(index, scope) {
    if (scope === "only_s36") return true;
    if (scope === "exclude_s36") return false;
    return index % 5 !== 0;
  }

  function getDivisionForPlayer(row, index, scope, handicap) {
    const band = getHandicapBand(handicap);
    return shouldUseSystem36(index, scope) ? `S36 ${band}` : `Nam ${band}`;
  }

  function getFlightConfig(scope = "all", allowFlightJump = false) {
    const whsFlights = [
      { name: "Nam A", min: -10, max: 12, isSystem36: false, scoringMode: "handicap" },
      { name: "Nam B", min: 13, max: 24, isSystem36: false, scoringMode: "handicap" },
      { name: "Nam C", min: 25, max: 54, isSystem36: false, scoringMode: "handicap" }
    ];
    const s36Flights = [
      { name: "S36 A", min: -10, max: 12, isSystem36: true, scoringMode: "system36" },
      { name: "S36 B", min: 13, max: 24, isSystem36: true, scoringMode: "system36" },
      { name: "S36 C", min: 25, max: 54, isSystem36: true, scoringMode: "system36" }
    ];
    const flights = scope === "only_s36" ? s36Flights : scope === "exclude_s36" ? whsFlights : [...whsFlights, ...s36Flights];
    return {
      locked: true,
      source: "simulator",
      genderMode: "combined",
      allowFlightJump: scope !== "exclude_s36" && !!allowFlightJump,
      fixedFlightName: "",
      flights
    };
  }

  function isDivisionInScope(division, scope) {
    const isS36 = /^S36\b/i.test(division);
    if (scope === "only_s36") return isS36;
    if (scope === "exclude_s36") return !isS36;
    return true;
  }

  function getStoryShape(role, turn) {
    if (role === "comeback") return turn <= 6 ? 2 : turn >= 13 ? -1 : 0;
    if (role === "early_leader_collapse") return turn <= 6 ? -1 : turn >= 13 ? 2 : 0;
    if (role === "steady") return 0;
    if (role === "silent_contender") return turn >= 10 ? -1 : 0;
    if (role === "chaser") return turn % 5 === 0 ? -1 : 0;
    return 0;
  }

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function pickWeightedOutcome(outcomes, random) {
    const total = outcomes.reduce((sum, item) => sum + Math.max(0, item.weight), 0);
    if (!total) return outcomes[outcomes.length - 1]?.diff || 1;
    let cursor = random() * total;
    for (const item of outcomes) {
      cursor -= Math.max(0, item.weight);
      if (cursor <= 0) return item.diff;
    }
    return outcomes[outcomes.length - 1].diff;
  }

  function getBirdieCap(handicap, random) {
    if (handicap <= 2) return random() < 0.18 ? 4 : 3;
    if (handicap <= 8) return random() < 0.12 ? 3 : 2;
    if (handicap <= 12) return random() < 0.1 ? 2 : 1;
    if (handicap <= 24) return random() < 0.16 ? 1 : 0;
    return random() < 0.04 ? 1 : 0;
  }

  function getEagleCap(handicap, random) {
    if (handicap <= 2) return random() < 0.12 ? 1 : 0;
    if (handicap <= 8) return random() < 0.03 ? 1 : 0;
    return 0;
  }

  function getRealisticBestGross(coursePar, handicap) {
    const safeHandicap = Math.max(-2, Math.round(handicap));
    if (safeHandicap <= 2) return coursePar - 5;
    if (safeHandicap <= 8) return coursePar - 2;
    if (safeHandicap <= 12) return coursePar;
    if (safeHandicap <= 24) return coursePar + 7;
    return coursePar + 16;
  }

  function getOutcomeWeights(handicap, holeConfig, story, volatility) {
    const safeHandicap = Math.max(-2, Math.round(handicap));
    const weights = safeHandicap <= 5
      ? { eagle: 0.0025, birdie: 0.055, par: 0.46, bogey: 0.33, double: 0.125, triple: 0.0275 }
      : safeHandicap <= 12
        ? { eagle: 0.001, birdie: 0.03, par: 0.35, bogey: 0.39, double: 0.18, triple: 0.049 }
        : safeHandicap <= 24
          ? { eagle: 0.0003, birdie: 0.012, par: 0.22, bogey: 0.42, double: 0.26, triple: 0.0877 }
          : { eagle: 0.0001, birdie: 0.004, par: 0.1, bogey: 0.32, double: 0.38, triple: 0.1959 };
    const strokeIndex = clamp(Number(holeConfig.strokeIndex) || 9, 1, 18);
    const ease = (strokeIndex - 1) / 17;
    const par = Number(holeConfig.par) || 4;
    const goodHoleBoost = 0.78 + (ease * 0.44) + (par >= 5 ? 0.16 : par <= 3 ? -0.06 : 0);
    const badHoleBoost = 1.22 - (ease * 0.36) + (par <= 3 ? 0.08 : 0);
    const storyBoost = story < 0 ? 1.22 : story > 0 ? 0.82 : 1;
    const storyPenalty = story > 0 ? 1.2 : story < 0 ? 0.86 : 1;
    const tailBoost = 0.9 + (clamp(volatility, 1, 5) * 0.06);

    return [
      { diff: -2, weight: weights.eagle * goodHoleBoost * storyBoost },
      { diff: -1, weight: weights.birdie * goodHoleBoost * storyBoost },
      { diff: 0, weight: weights.par * (0.92 + ease * 0.16) },
      { diff: 1, weight: weights.bogey },
      { diff: 2, weight: weights.double * badHoleBoost * storyPenalty * tailBoost },
      { diff: 3, weight: weights.triple * badHoleBoost * storyPenalty * tailBoost },
    ];
  }

  function countUnderParScores(scoreRows) {
    return scoreRows.reduce((counts, item) => {
      const diff = item.gross - item.par;
      if (diff <= -2) counts.eagles += 1;
      else if (diff === -1) counts.birdies += 1;
      return counts;
    }, { birdies: 0, eagles: 0 });
  }

  function canReduceSimScore(item, underParCounts, caps) {
    const diff = item.gross - item.par;
    if (diff <= -2) return false;
    if (diff === -1) return underParCounts.eagles < caps.eagles;
    if (diff === 0) return underParCounts.birdies < caps.birdies;
    return true;
  }

  function buildHandicapAwareScores(row, path, holes, handicap, volatility, random, targetGross) {
    const safeHandicap = Math.max(-2, Math.round(handicap));
    const caps = {
      birdies: getBirdieCap(safeHandicap, random),
      eagles: getEagleCap(safeHandicap, random)
    };
    const underParCounts = { birdies: 0, eagles: 0 };
    const scoreRows = path.map((hole, turnIndex) => {
      const holeConfig = holes.find(item => item.hole === hole) || { hole, par: 4, strokeIndex: hole };
      const story = getStoryShape(row.storyRole, turnIndex + 1);
      let diff = pickWeightedOutcome(getOutcomeWeights(safeHandicap, holeConfig, story, volatility), random);
      if (diff <= -2 && underParCounts.eagles >= caps.eagles) diff = underParCounts.birdies < caps.birdies ? -1 : 0;
      if (diff === -1 && underParCounts.birdies >= caps.birdies) diff = 0;
      if (diff <= -2) underParCounts.eagles += 1;
      else if (diff === -1) underParCounts.birdies += 1;
      return {
        turn: turnIndex + 1,
        hole,
        par: holeConfig.par,
        gross: Math.max(2, Math.min(10, holeConfig.par + diff))
      };
    });

    let difference = targetGross - scoreRows.reduce((sum, item) => sum + item.gross, 0);
    const adjustmentOrder = shuffle(Array.from({ length: scoreRows.length }, (_item, index) => index), random);
    let attempts = 0;
    const maxAdjustments = scoreRows.length + Math.max(2, volatility * 2);
    while (difference && attempts < scoreRows.length * 12 && attempts < maxAdjustments * 8) {
      const item = scoreRows[adjustmentOrder[attempts % adjustmentOrder.length]];
      const direction = difference > 0 ? 1 : -1;
      if (
        item.gross + direction >= 2 &&
        item.gross + direction <= 10 &&
        (direction > 0 || canReduceSimScore(item, countUnderParScores(scoreRows), caps))
      ) {
        item.gross += direction;
        difference -= direction;
      }
      attempts += 1;
    }
    return scoreRows;
  }

  function makeScorecardUnique(scores, usedScorecards, random) {
    const signature = () => scores.map(item => item.gross).join("-");
    let current = signature();
    for (let attempt = 0; usedScorecards.has(current) && attempt < scores.length * scores.length; attempt += 1) {
      const increaseIndex = randomInt(random, 0, scores.length - 1);
      let decreaseIndex = randomInt(random, 0, scores.length - 1);
      if (increaseIndex === decreaseIndex) decreaseIndex = (decreaseIndex + 1) % scores.length;
      if (
        scores[increaseIndex].gross >= 10 ||
        scores[decreaseIndex].gross <= 2 ||
        scores[decreaseIndex].gross - scores[decreaseIndex].par <= 0
      ) continue;
      scores[increaseIndex].gross += 1;
      scores[decreaseIndex].gross -= 1;
      current = signature();
    }
    usedScorecards.add(current);
    return scores;
  }

  function buildScenario(config) {
    const seed = createScenarioSeed();
    const random = createSeededRandom(seed);
    const roster = buildRoster(config.playerCount, random);
    const holes = state().course.holes || [];
    const coursePar = holes.reduce((sum, hole) => sum + (Number(hole.par) || 4), 0) || 72;
    const usedScorecards = new Set();
    const existingFlights = state().flightConfig?.flights || [];
    const players = roster.map((row, index) => {
      const simulatedHandicap = getSimulatedHandicap(index, random);
      let division = "";
      let isS36 = false;
      let simulate = true;

      if (existingFlights.length > 0) {
        const flight = existingFlights[index % existingFlights.length];
        division = flight.name;
        isS36 = flight.scoringMode === "system36" || flight.isSystem36;
        if (config.scope === "only_s36") simulate = isS36;
        else if (config.scope === "exclude_s36") simulate = !isS36;
      } else {
        division = getDivisionForPlayer(row, index, config.scope, simulatedHandicap);
        isS36 = /^S36\b/i.test(division);
        simulate = isDivisionInScope(division, config.scope);
      }

      const path = window.LB.scoring.buildPlaySequence(row.startHole);
      const formRange = Math.max(2, config.volatility * 2);
      const storyForm = row.storyRole === "silent_contender" ? -2 : row.storyRole === "early_leader_collapse" ? 3 : 0;
      const expectedGross = coursePar + simulatedHandicap;
      const bestGross = getRealisticBestGross(coursePar, simulatedHandicap);
      const targetGross = Math.max(bestGross, Math.min(180, expectedGross + storyForm + randomInt(random, -formRange, formRange)));
      const scores = makeScorecardUnique(
        buildHandicapAwareScores(row, path, holes, simulatedHandicap, config.volatility, random, targetGross),
        usedScorecards,
        random
      );
      return { ...row, division, simulatedHandicap, isS36, path, scores, simulate };
    });
    return {
      id: `sim-${seed}`,
      seed,
      createdAt: nowIso(),
      config,
      players
    };
  }

  function ensureBackup() {
    const active = state().simulator?.active;
    if (!active && !localStorage.getItem(BACKUP_KEY)) {
      localStorage.setItem(BACKUP_KEY, JSON.stringify(state()));
    }
  }

  function buildPlayersForState(scenario) {
    return scenario.players.map((row, index) => {
      const isS36 = typeof row.isS36 === "boolean" ? row.isS36 : /^S36\b/i.test(row.division);
      const handicap = isS36 ? "" : row.simulatedHandicap;
      return {
        id: row.id,
        name: row.name,
        handicap,
        courseHandicap: handicap,
        handicapIndex: isS36 ? "" : (row.simulatedHandicap - 1.8).toFixed(1),
        handicapSource: isS36 ? "simulator_system36" : "simulator_whs",
        courseHandicapLocked: !isS36,
        gender: "male",
        division: row.division,
        flight: row.division,
        divisionSource: "simulator",
        flightGroup: `${row.startHole}${row.teeSlot}`,
        group: `${row.startHole}${row.teeSlot}`,
        startHole: String(row.startHole),
        caddyNumber: `S${String(index + 1).padStart(2, "0")}`,
        awardEligible: true,
        operationNote: row.story ? `Simulator ${row.division}: ${row.story}` : `Simulator ${row.division}`,
        vgaId: row.vgaId,
        golferId: row.vgaId,
        tourSystemUserId: "",
        status: "active",
        createdAt: nowIso()
      };
    });
  }

  function buildMatches(scenario, players, ts36UserCount) {
    const random = createSeededRandom(`${scenario.seed}-matches`);
    const s36PlayerIds = new Set(scenario.players.filter(p => p.isS36).map(p => p.id));
    const s36Players = players.filter(player => s36PlayerIds.has(player.id));
    const count = Math.min(ts36UserCount, s36Players.length);
    const linkedPlayers = shuffle(s36Players, random).slice(0, count);
    const eventIndexes = shuffle(Array.from({ length: count }, (_item, index) => index), random);
    const wrongIndexes = new Set(eventIndexes.slice(0, Math.min(2, Math.floor(count / 5))));
    const duplicateIndex = eventIndexes.find(index => !wrongIndexes.has(index) && index > 0);
    return linkedPlayers.map((player, index) => {
      const alternatives = s36Players.filter(item => item.id !== player.id);
      const wrongPlayer = alternatives[randomInt(random, 0, Math.max(0, alternatives.length - 1))] || player;
      const duplicateName = index === duplicateIndex ? linkedPlayers[(index + 1) % linkedPlayers.length]?.name : player.name;
      const wasWrong = wrongIndexes.has(index);
      return {
        id: `sim-match-${index + 1}`,
        tourSystemUserId: `sim-ts36-user-${String(index + 1).padStart(2, "0")}`,
        displayName: duplicateName,
        email: `sim-user-${index + 1}@local.test`,
        rawVgaId: player.vgaId,
        normalizedVgaId: player.vgaId,
        suggestedPlayerId: wasWrong ? wrongPlayer.id : player.id,
        linkedPlayerId: player.id,
        status: "confirmed",
        reviewNote: wasWrong ? "sim_go_relinked_wrong_pick" : (index === duplicateIndex ? "sim_duplicate_name_reviewed" : "sim_auto_linked"),
        joinedAt: scenario.createdAt,
        metadata: {
          simulator: true,
          initiallySuggestedPlayerId: wasWrong ? wrongPlayer.id : player.id,
          correctedByGo: wasWrong
        }
      };
    });
  }

  async function cleanupSimulatorLiveSnapshots() {
    try {
      await window.LB.storage.cleanupSimulatorSnapshots?.();
    } catch (err) {
      console.warn("[simulator] cleanup live snapshots failed", err);
    }
  }

  async function createTournament() {
    pause();
    await cleanupSimulatorLiveSnapshots();
    ensureBackup();
    const appState = state();
    const config = {
      ...getConfigFromUi(),
      allowFlightJump: !!appState.flightConfig?.allowFlightJump
    };
    const scenario = buildScenario(config);
    const players = buildPlayersForState(scenario);
    const simulatorTournamentName = `SIM Blind Competition ${players.length}`;
    const simulatorCourseName = appState.tournament.courseName || "Demo Golf Course";
    const scores = {};
    players.forEach(player => {
      scores[player.id] = {};
    });

    appState.tournament = {
      ...appState.tournament,
      id: scenario.id,
      name: simulatorTournamentName,
      operatorName: "LB Simulator",
      courseName: simulatorCourseName,
      startHole: 1,
      scoringFormat: "system36",
      status: "simulator",
      shareSlug: window.LB.storage.generateShareSlug({
        courseName: simulatorCourseName,
        tournamentName: simulatorTournamentName,
        operatorName: "LB Simulator"
      }),
      publicRead: true,
      operatorTournamentId: "",
      operatorPrivateCode: "0000",
      createdAt: scenario.createdAt,
      updatedAt: scenario.createdAt
    };
    if (!appState.flightConfig || !Array.isArray(appState.flightConfig.flights) || appState.flightConfig.flights.length === 0) {
      appState.flightConfig = getFlightConfig(config.scope, config.allowFlightJump);
    }
    appState.players = players;
    appState.scores = scores;
    appState.ts36Matches = buildMatches(scenario, players, config.ts36UserCount);
    appState.matchReview = { selectedTs36Id: "", selectedPlayerId: "" };
    appState.alerts = [];
    appState.imports = [];
    appState.operator = {
      ...appState.operator,
      linkedTournament: null,
      privateCode: "0000",
      lastScoreSyncAt: "",
      lastParticipantSyncAt: "",
      rosterPublishedAt: "",
      rosterPublishedCount: 0,
      publishedRosterSnapshot: []
    };
    appState.cloud = { enabled: false, lastSyncAt: "", lastError: "" };
    appState.simulator = {
      active: true,
      running: false,
      autoStarted: false,
      id: scenario.id,
      currentTurn: 0,
      totalTurns: 18,
      phase: "ready",
      pendingTurn: null,
      pendingScores: [],
      config,
      scenario,
      telemetry: {
        scoreSubmitTicks: 0,
        confirmTicks: 0,
        ts36ScoreWrites: 0,
        operatorDraftScores: 0,
        officialScoreConfirms: 0,
        conflictFixes: 0,
        snapshotPublishes: 0,
        rosterPublishEvents: 1,
        matchReviewEvents: appState.ts36Matches.length,
        cumulativeSnapshotBytes: 0,
        lastSnapshotBytes: 0,
        logsCreated: 0
      },
      logs: [],
      lastPublishedAt: ""
    };

    addLog(`Tạo tournament giả lập ${players.length} golfer, ${appState.ts36Matches.length} TS36 user, seed ${scenario.seed}, phạm vi ${config.scope}, nhảy bảng S36 ${config.allowFlightJump ? "bật" : "tắt"}.`, "setup");
    if (config.ts36UserCount > appState.ts36Matches.length) {
      addLog(`Yêu cầu ${config.ts36UserCount} TS36 user nhưng chỉ có ${appState.ts36Matches.length} golfer thuộc bảng S36 hợp lệ để link.`, "setup");
    }
    appState.ts36Matches.forEach(match => {
      if (match.metadata?.correctedByGo) {
        const wrong = players.find(player => player.id === match.metadata.initiallySuggestedPlayerId);
        const right = players.find(player => player.id === match.linkedPlayerId);
        addLog(`TS36 ${match.tourSystemUserId} chọn nhầm ${wrong?.name || "golfer khác"}; GO liên kết lại đúng ${right?.name}.`, "link");
      } else if (match.reviewNote === "sim_duplicate_name_reviewed") {
        addLog(`TS36 ${match.tourSystemUserId} có trùng tên hiển thị; GO xác nhận bằng VGA_ID ${match.rawVgaId}.`, "link");
      } else {
        addLog(`TS36 ${match.tourSystemUserId} link golfer VGA_ID ${match.rawVgaId}.`, "link");
      }
    });
    addLog(`Bắt đầu giải đấu shotgun: ${Math.ceil(players.length / 4)} nhóm xuất phát ở các hố khác nhau.`, "start");

    window.LB.storage.saveState();
    window.LB.app?.render?.();
    renderSimulator();
  }

  function getSimPlayerPlan(playerId) {
    return state().simulator?.scenario?.players?.find(player => player.id === playerId) || null;
  }

  function getMatchForPlayer(playerId) {
    return (state().ts36Matches || []).find(match => match.linkedPlayerId === playerId) || null;
  }

  function applyTurn() {
    const sim = state().simulator;
    if (!sim?.active) {
      void createTournament();
      return;
    }
    if (sim.pendingTurn) {
      confirmPendingTurn();
      return;
    }
    collectTurnSubmissions();
  }

  function collectTurnSubmissions() {
    const sim = state().simulator;
    if (!sim?.active) return;
    if (sim.currentTurn >= sim.totalTurns) {
      pause();
      addLog("Giả lập đã hoàn tất 18 lượt. Final leaderboard được giữ nguyên.", "finish");
      saveAndRender();
      return;
    }

    const nextTurn = sim.currentTurn + 1;
    sim.pendingTurn = nextTurn;
    sim.pendingScores = [];
    sim.phase = "pending_review";
    addLog(`Turn ${nextTurn}.1: TS36 user/GO gửi điểm nháp, leaderboard official chưa publish.`, "turn");

    state().players.forEach(player => {
      const plan = getSimPlayerPlan(player.id);
      if (!plan?.simulate) return;
      const score = plan.scores[nextTurn - 1];
      if (!score) return;
      const match = getMatchForPlayer(player.id);
      const record = state().scores[player.id]?.[score.hole] || {};
      const userHasError = match && (
        (hashText(`${sim.scenario.seed}-scorecard-${player.vgaId}-${nextTurn}`) % 17 === 0) ||
        (plan.storyRole === "early_leader_collapse" && nextTurn === 18)
      );
      const userGross = userHasError ? Math.min(10, score.gross + 1) : score.gross;
      if (!state().scores[player.id]) state().scores[player.id] = {};
      state().scores[player.id][score.hole] = {
        ...record,
        userGross: match ? userGross : "",
        userSubmittedAt: match ? nowIso() : "",
        operatorGross: match ? "" : score.gross,
        operatorUpdatedAt: match ? "" : nowIso(),
        confirmedGross: "",
        confirmedAt: "",
        conflictStatus: match ? "pending" : "operator_pending",
        simulatorTurn: nextTurn
      };
      sim.pendingScores.push({
        playerId: player.id,
        hole: score.hole,
        gross: score.gross,
        userGross: match ? userGross : "",
        userHasError,
        matchId: match?.id || "",
        source: match ? "ts36" : "operator"
      });
      if (match) {
        addLog(`TS36 user ${match.tourSystemUserId} gửi ${userGross} gậy cho ${player.name} tại hố ${score.hole}; đang chờ GO review.`, "score");
      } else {
        addLog(`Không có TS36 user cho ${player.name}; GO nhập nháp ${score.gross} gậy tại hố ${score.hole}.`, "score");
      }
    });

    sim.telemetry = sim.telemetry || {};
    const ts36Submitted = sim.pendingScores.filter(item => item.source === "ts36").length;
    const operatorDrafted = sim.pendingScores.length - ts36Submitted;
    sim.telemetry.scoreSubmitTicks = (sim.telemetry.scoreSubmitTicks || 0) + 1;
    sim.telemetry.ts36ScoreWrites = (sim.telemetry.ts36ScoreWrites || 0) + ts36Submitted;
    sim.telemetry.operatorDraftScores = (sim.telemetry.operatorDraftScores || 0) + operatorDrafted;

    if (!sim.pendingScores.length) {
      sim.currentTurn = nextTurn;
      sim.pendingTurn = null;
      sim.phase = "published";
      addLog(`Turn ${nextTurn}: không có golfer thuộc phạm vi giả lập, bỏ qua publish mới.`, "publish");
      if (nextTurn === sim.totalTurns) {
        pause();
        sim.phase = "finished";
        addLog("Kết thúc turn 18. Final leaderboard simulator đang được giữ nguyên để kiểm tra.", "finish");
      }
    }
    saveAndRender();
  }

  function confirmPendingTurn() {
    const sim = state().simulator;
    if (!sim?.active) return;
    const nextTurn = sim.pendingTurn;
    if (!nextTurn) {
      collectTurnSubmissions();
      return;
    }
    addLog(`Turn ${nextTurn}.2: GO kiểm tra scorecard, sửa lệch nếu có và publish điểm đã confirm.`, "confirm");

    sim.telemetry = sim.telemetry || {};
    const pendingRows = sim.pendingScores || [];
    const conflictRows = pendingRows.filter(item => item.userHasError).length;
    sim.telemetry.confirmTicks = (sim.telemetry.confirmTicks || 0) + 1;
    sim.telemetry.officialScoreConfirms = (sim.telemetry.officialScoreConfirms || 0) + pendingRows.length;
    sim.telemetry.conflictFixes = (sim.telemetry.conflictFixes || 0) + conflictRows;

    pendingRows.forEach(item => {
      const player = (state().players || []).find(row => row.id === item.playerId);
      if (!player) return;
      if (!state().scores[player.id]) state().scores[player.id] = {};
      const record = state().scores[player.id][item.hole] || {};
      state().scores[player.id][item.hole] = {
        ...record,
        operatorGross: item.gross,
        operatorUpdatedAt: nowIso(),
        confirmedGross: item.gross,
        confirmedAt: nowIso(),
        conflictStatus: item.userHasError ? "resolved" : "ok",
        simulatorTurn: nextTurn
      };
      if (item.userHasError) {
        addLog(`GO phát hiện lệch scorecard ${player.name} H${item.hole}: TS36 ${item.userGross}, sửa và confirm ${item.gross}.`, "confirm");
        state().alerts.unshift({
          id: `sim-alert-${Date.now().toString(36)}-${player.id}-${item.hole}`,
          type: "sim_score_conflict",
          playerId: player.id,
          hole: item.hole,
          message: `${player.name} H${item.hole}: simulator sửa TS36 ${item.userGross} -> ${item.gross}.`,
          createdAt: nowIso()
        });
      } else {
        addLog(`GO confirm ${player.name} H${item.hole}: ${item.gross} gậy.`, "confirm");
      }
    });

    sim.currentTurn = nextTurn;
    sim.pendingTurn = null;
    sim.pendingScores = [];
    sim.phase = "published";
    publishLocalSnapshot();
    if (nextTurn === sim.totalTurns) {
      pause();
      sim.phase = "finished";
      addLog("Kết thúc turn 18. Final leaderboard simulator đang được giữ nguyên để kiểm tra.", "finish");
    }
    saveAndRender();
  }

  function publishLocalSnapshot() {
    const sim = state().simulator;
    if (!sim?.active) return;
    const snapshot = window.LB.scoring.buildPublicSnapshot(state());
    const debugRefreshMs = cleanInt(sim.config?.liveSeconds, 1, 120, 5) * 1000;
    const publishTimestamp = nowIso();
    snapshot.tournament = {
      ...(snapshot.tournament || {}),
      updatedAt: publishTimestamp
    };
    snapshot.simulator = {
      id: sim.id,
      turn: sim.currentTurn,
      localOnly: true,
      liveSeconds: sim.config?.liveSeconds || 5,
      debugRefreshMs
    };
    snapshot.sync = {
      ...(snapshot.sync || {}),
      publicRefreshMs: debugRefreshMs,
      publicPollMs: debugRefreshMs,
      simulatorRefreshMs: debugRefreshMs
    };
    const snapshotBytes = estimateJsonBytes(snapshot);
    window.LB.storage.saveSnapshot(snapshot);
    sim.telemetry = sim.telemetry || {};
    sim.telemetry.snapshotPublishes = (sim.telemetry.snapshotPublishes || 0) + 1;
    sim.telemetry.lastSnapshotBytes = snapshotBytes;
    sim.telemetry.cumulativeSnapshotBytes = (sim.telemetry.cumulativeSnapshotBytes || 0) + snapshotBytes;
    sim.lastPublishedAt = nowIso();
    addLog(`Auto publish local snapshot turn ${sim.currentTurn}: chỉ gồm điểm đã confirm, payload khoảng ${formatBytes(snapshotBytes)}.`, "publish");
  }

  function startAutoRun(resumed = false) {
    const sim = state().simulator;
    if (!sim?.active || sim.currentTurn >= sim.totalTurns) return;
    if (runTimer) window.clearInterval(runTimer);
    sim.running = true;
    sim.autoStarted = true;
    addLog(resumed ? "Tiếp tục auto-run simulator." : "Bật auto-run simulator.", "run");
    saveAndRender();
    const seconds = cleanInt(sim.config?.liveSeconds, 1, 120, 3);
    runTimer = window.setInterval(() => {
      applyTurn();
      if (!state().simulator?.active || state().simulator.currentTurn >= state().simulator.totalTurns) pause();
    }, seconds * 1000);
  }

  async function run() {
    if (!state().simulator?.active) await createTournament();
    startAutoRun(false);
  }

  function pause() {
    if (runTimer) window.clearInterval(runTimer);
    runTimer = null;
    if (state().simulator) state().simulator.running = false;
    renderSimulator();
  }

  function togglePause() {
    const sim = state().simulator;
    if (!sim?.active || !sim.autoStarted || sim.currentTurn >= sim.totalTurns) return;
    if (sim.running) {
      addLog("Tạm dừng simulator.", "run");
      pause();
      window.LB.storage.saveState();
      return;
    }
    startAutoRun(true);
  }

  function countScoreRecords() {
    const rows = Object.values(state().scores || {}).flatMap(playerScores => Object.values(playerScores || {}));
    return {
      total: rows.length,
      ts36Submitted: rows.filter(record => Number(record.userGross) > 0).length,
      confirmed: rows.filter(record => Number(record.confirmedGross) > 0).length,
      conflicts: rows.filter(record => record.conflictStatus === "conflict").length,
      pending: rows.filter(record => record.conflictStatus === "pending" || record.conflictStatus === "operator_pending").length
    };
  }

  function estimateResourceReport() {
    const sim = state().simulator;
    if (!sim?.active) return null;
    const telemetry = sim.telemetry || {};
    const config = sim.config || {};
    const players = state().players || [];
    const matches = state().ts36Matches || [];
    const playerCount = players.length;
    const ts36UserCount = matches.length;
    const s36PlayerCount = players.filter(player => /^S36\b/i.test(player.division || "")).length;
    const whsPlayerCount = players.filter(player => /^Nam\b/i.test(player.division || "")).length;
    const viewerCount = cleanInt(config.viewerCount, 0, 10000, Math.max(playerCount, Math.round(playerCount * 1.8)));
    const viewerSegments = normalizeViewerSegments(viewerCount, config.viewerSegments);
    const viewerTotal = Object.values(viewerSegments).reduce((sum, value) => sum + value, 0);
    const tickCount = (sim.currentTurn * 2) + (sim.pendingTurn ? 1 : 0);
    const simulatedSeconds = tickCount * (config.liveSeconds || 5);
    const fullRunSeconds = sim.totalTurns * 2 * (config.liveSeconds || 5);
    const productionHours = cleanFloat(config.productionHours, 1, 12, 6);
    const productionSeconds = Math.round(productionHours * 3600);
    const productionScoreSeconds = cleanInt(
      document.getElementById("operator-score-poll-seconds")?.value ??
        Math.round((state().operator?.scorePollMs || getEnvMs("OPERATOR_SCORE_POLL_MS", 10000)) / 1000),
      3,
      300,
      10
    );
    const productionLiveSeconds = cleanInt(
      document.getElementById("operator-auto-live-seconds")?.value ??
        Math.round((state().operator?.snapshotAutoPublishMs || getEnvMs("OPERATOR_SNAPSHOT_AUTO_PUBLISH_MS", 300000)) / 1000),
      5,
      300,
      300
    );
    const publicCacheSeconds = getEnvSeconds("PUBLIC_LEADERBOARD_REVALIDATE_SECONDS", Math.min(60, productionLiveSeconds), 1, 300);
    const scorePollMs = productionScoreSeconds * 1000;
    const participantPollMs = getEnvMs("OPERATOR_PARTICIPANT_POLL_MS", 60000);
    const publicPollMs = productionLiveSeconds * 1000;
    const scorePollCycles = Math.ceil((productionSeconds * 1000) / scorePollMs);
    const participantPollCycles = Math.ceil((productionSeconds * 1000) / participantPollMs);
    const publicPollCycles = Math.ceil((productionSeconds * 1000) / publicPollMs);
    const simulatedPlayerIds = new Set(
      (sim.scenario?.players || []).filter(player => player.simulate).map(player => player.id)
    );
    const linkedSimulatedPlayers = matches.filter(match => simulatedPlayerIds.has(match.linkedPlayerId)).length;
    const officialScoreConfirms = simulatedPlayerIds.size * sim.totalTurns;
    const ts36ScoreWrites = linkedSimulatedPlayers * sim.totalTurns;
    const operatorDraftScores = Math.max(0, officialScoreConfirms - ts36ScoreWrites);
    const observedConflictRate = telemetry.ts36ScoreWrites
      ? (telemetry.conflictFixes || 0) / telemetry.ts36ScoreWrites
      : (1 / 17);
    const conflictFixes = Math.ceil(ts36ScoreWrites * Math.max(0.01, Math.min(0.2, observedConflictRate)));
    const snapshotPublishes = officialScoreConfirms ? Math.min(publicPollCycles, officialScoreConfirms) : 0;
    const rosterPublishes = telemetry.rosterPublishEvents || 1;
    const matchReviewEvents = telemetry.matchReviewEvents || ts36UserCount;
    const logsCreated = matchReviewEvents + officialScoreConfirms + ts36ScoreWrites + operatorDraftScores + snapshotPublishes + conflictFixes + 12;
    const alerts = conflictFixes;
    const currentSnapshot = window.LB.scoring.buildPublicSnapshot(state());
    const snapshotBytes = telemetry.lastSnapshotBytes || estimateJsonBytes(currentSnapshot);
    const apiSnapshotBytes = Math.ceil((snapshotBytes + NEXT_PUBLIC_API_OVERHEAD_BYTES) * NEXT_PUBLIC_API_RANKING_MULTIPLIER);
    const cumulativeSnapshotBytes = snapshotBytes * snapshotPublishes;
    const rosterBytes = playerCount * 560;
    const flightConfigBytes = estimateJsonBytes(state().flightConfig || {});
    const tournamentMetadataBytes = estimateJsonBytes({ tournament: state().tournament, course: state().course, flightConfig: state().flightConfig });
    const averageScoreRowsReturned = Math.ceil(ts36ScoreWrites / 2);
    const intermittentCycles = Math.ceil(publicPollCycles * 0.25);
    const directFullReads = viewerSegments.directFull * publicPollCycles;
    const directBurstReads = viewerSegments.directBurst * intermittentCycles;
    const indirectFullReads = viewerSegments.indirectFull * publicPollCycles;
    const indirectBurstReads = viewerSegments.indirectBurst * intermittentCycles;
    const directPublicReadRequests = directFullReads + directBurstReads;
    const indirectPublicReadRequests = indirectFullReads + indirectBurstReads;
    const publicReadRequests = directPublicReadRequests + indirectPublicReadRequests;
    const ts36OpponentReadRequests = ts36UserCount * publicPollCycles;
    const finalResultsViewLoads = viewerTotal;
    const finalResultsEffectBytes = finalResultsViewLoads * FINAL_RESULTS_EFFECT_BYTES;
    const awardAssetBytes = finalResultsViewLoads * AWARD_ASSET_COUNT * AWARD_ASSET_BYTES;
    const directSupabaseFallback = /^(1|true|yes)$/i.test(String(window.ENV?.PUBLIC_SNAPSHOT_DIRECT_SUPABASE_FALLBACK || ""));

    const dbStorage = {
      tournament: 4096,
      userLinks: ts36UserCount * 920,
      participants: playerCount * 1180,
      flightMetadata: flightConfigBytes,
      bridgeRoster: rosterBytes,
      scoreStaging: ts36ScoreWrites * 680,
      officialScores: officialScoreConfirms * 560,
      publicSnapshot: snapshotBytes,
      metadata: tournamentMetadataBytes,
      logs: logsCreated * 460,
      alerts: alerts * 620
    };
    const dbTotal = Object.values(dbStorage).reduce((sum, value) => sum + value, 0);

    const supabaseIngress = {
      rosterSnapshot: rosterBytes * rosterPublishes,
      ts36ScoreWrites: ts36ScoreWrites * 620,
      matchReview: matchReviewEvents * 760,
      officialConfirm: officialScoreConfirms * 520,
      publicSnapshot: cumulativeSnapshotBytes
    };
    const supabaseEgress = {
      scorePolls: scorePollCycles * averageScoreRowsReturned * 680,
      participantPolls: participantPollCycles * playerCount * 720,
      directPublicFallback: directSupabaseFallback ? (publicReadRequests + ts36OpponentReadRequests) * apiSnapshotBytes : 0
    };
    const supabaseIngressTotal = Object.values(supabaseIngress).reduce((sum, value) => sum + value, 0);
    const supabaseEgressTotal = Object.values(supabaseEgress).reduce((sum, value) => sum + value, 0);

    const vercelApiReads = publicReadRequests + ts36OpponentReadRequests;
    const vercelRevalidates = snapshotPublishes + rosterPublishes;
    const directPageLoads = viewerSegments.directFull + (viewerSegments.directBurst * 2);
    const publicPageBytes = directPageLoads * NEXT_SHARE_PAGE_SHELL_BYTES;
    const operatorPageBytes = 900 * 1024;
    const ts36PageBytes = ts36UserCount * 360 * 1024;
    const cachedSnapshotEgress = vercelApiReads * apiSnapshotBytes;
    const vercelTotalEgress = publicPageBytes + operatorPageBytes + ts36PageBytes + cachedSnapshotEgress + finalResultsEffectBytes + awardAssetBytes;

    const supabaseRequestTotal = (
      rosterPublishes +
      matchReviewEvents +
      ts36ScoreWrites +
      snapshotPublishes +
      scorePollCycles +
      participantPollCycles
    );
    const vercelRequestTotal = vercelApiReads + vercelRevalidates + directPageLoads + finalResultsViewLoads + 1;
    const edgeFunctionInvocations = ts36UserCount;

    return {
      id: sim.id,
      generatedAt: nowIso(),
      summaryCards: [
        { label: "Phiên production", value: formatDuration(productionSeconds), hint: `Simulator ${formatDuration(fullRunSeconds)} · sync ${productionScoreSeconds}s · live ${productionLiveSeconds}s` },
        { label: "Golfer / TS36", value: `${formatNumber(playerCount)} / ${formatNumber(ts36UserCount)}`, hint: `${formatNumber(s36PlayerCount)} S36, ${formatNumber(whsPlayerCount)} WHS` },
        { label: "Viewer live", value: formatNumber(viewerTotal), hint: `${formatNumber(viewerSegments.directFull + viewerSegments.directBurst)} trực tiếp, ${formatNumber(viewerSegments.indirectFull + viewerSegments.indirectBurst)} gián tiếp` },
        { label: "API request ước tính", value: formatNumber(supabaseRequestTotal + vercelRequestTotal + edgeFunctionInvocations), hint: `${formatNumber(supabaseRequestTotal)} Supabase, ${formatNumber(vercelRequestTotal)} Vercel/API · không cộng row/action` },
        { label: "DB at rest", value: formatBytes(dbTotal), hint: `Snapshot hiện tại ${formatBytes(snapshotBytes)}` }
      ],
      sections: [
        {
          title: "TS36 -> Supabase / Edge",
          rows: [
            ["Score write từ TS36", `${formatNumber(ts36ScoreWrites)} request · ${formatBytes(supabaseIngress.ts36ScoreWrites)}`],
            ["Unlock/sync Edge Function", `${formatNumber(edgeFunctionInvocations)} invocation`],
            ["User link / GO relink", `${formatNumber(matchReviewEvents)} RPC/upsert · ${formatBytes(supabaseIngress.matchReview)}`],
            ["Đọc đối thủ qua Vercel cache", `${formatNumber(ts36OpponentReadRequests)} request · ${formatBytes(ts36OpponentReadRequests * apiSnapshotBytes)} · mỗi ${productionLiveSeconds}s`]
          ]
        },
        {
          title: "Leaderboard Pro -> Supabase",
          rows: [
            ["Poll điểm TS36", `${formatNumber(scorePollCycles)} RPC · ${formatBytes(supabaseEgress.scorePolls)} egress · mỗi ${productionScoreSeconds}s`],
            ["Poll roster/participant", `${formatNumber(participantPollCycles)} RPC · ${formatBytes(supabaseEgress.participantPolls)} egress`],
            ["Confirm official score", `${formatNumber(officialScoreConfirms)} row/action · ${formatBytes(supabaseIngress.officialConfirm)}`],
            ["Publish snapshot/bridge", `${formatNumber(snapshotPublishes)} upsert tối đa · ${formatBytes(supabaseIngress.publicSnapshot)} · chỉ khi có điểm confirm`]
          ]
        },
        {
          title: "Vercel / CDN / Public",
          rows: [
            ["Viewer trực tiếp xuyên suốt", `${formatNumber(viewerSegments.directFull)} người · ${formatNumber(directFullReads)} read · ${formatBytes(directFullReads * apiSnapshotBytes)}`],
            ["Viewer trực tiếp gián đoạn", `${formatNumber(viewerSegments.directBurst)} người · ${formatNumber(directBurstReads)} read · ${formatBytes(directBurstReads * apiSnapshotBytes)}`],
            ["Viewer gián tiếp xuyên suốt", `${formatNumber(viewerSegments.indirectFull)} người · ${formatNumber(indirectFullReads)} read · ${formatBytes(indirectFullReads * apiSnapshotBytes)}`],
            ["Viewer gián tiếp gián đoạn", `${formatNumber(viewerSegments.indirectBurst)} người · ${formatNumber(indirectBurstReads)} read · ${formatBytes(indirectBurstReads * apiSnapshotBytes)}`],
            ["Revalidate calls", `${formatNumber(vercelRevalidates)} request`],
            ["Initial page loads", `${formatNumber(directPageLoads + ts36UserCount + 1)} lượt · ${formatBytes(publicPageBytes + operatorPageBytes + ts36PageBytes)}`],
            ["Final results view", `${formatNumber(finalResultsViewLoads)} lượt · ${formatBytes(finalResultsEffectBytes)}`],
            ["Final results effects/assets", `${formatNumber(AWARD_ASSET_COUNT)} asset/lượt · ${formatBytes(awardAssetBytes)}`],
            ["Tổng egress Vercel/CDN", formatBytes(vercelTotalEgress)]
          ]
        },
        {
          title: "Database storage ước tính",
          rows: [
            ["Tournament + course metadata", formatBytes(dbStorage.tournament + dbStorage.metadata + dbStorage.flightMetadata)],
            ["User/link/bridge roster", formatBytes(dbStorage.userLinks + dbStorage.participants + dbStorage.bridgeRoster)],
            ["Score staging + official", formatBytes(dbStorage.scoreStaging + dbStorage.officialScores)],
            ["Live leaderboard snapshot row", formatBytes(dbStorage.publicSnapshot)],
            ["Log/audit/alert", formatBytes(dbStorage.logs + dbStorage.alerts)]
          ]
        }
      ],
      raw: {
        estimateMode: "production_extrapolation",
        simulatedSeconds,
        fullRunSeconds,
        productionHours,
        productionSeconds,
        productionScoreSeconds,
        productionLiveSeconds,
        publicCacheSeconds,
        playerCount,
        ts36UserCount,
        s36PlayerCount,
        whsPlayerCount,
        viewerCount: viewerTotal,
        viewerSegments,
        directPublicReadRequests,
        indirectPublicReadRequests,
        scorePollCycles,
        participantPollCycles,
        publicPollCycles,
        ts36ScoreWrites,
        operatorDraftScores,
        officialScoreConfirms,
        conflictFixes,
        snapshotPublishes,
        rosterPublishes,
        publicReadRequests,
        ts36OpponentReadRequests,
        finalResultsViewLoads,
        finalResultsEffectBytes,
        awardAssetBytes,
        edgeFunctionInvocations,
        supabaseRequestTotal,
        vercelRequestTotal,
        dbStorageBytes: dbStorage,
        dbTotalBytes: dbTotal,
        supabaseIngressBytes: supabaseIngress,
        supabaseEgressBytes: supabaseEgress,
        supabaseIngressTotalBytes: supabaseIngressTotal,
        supabaseEgressTotalBytes: supabaseEgressTotal,
        vercelTotalEgressBytes: vercelTotalEgress,
        snapshotBytes,
        apiSnapshotBytes,
        cumulativeSnapshotBytes,
        logsCreated,
        observedSimulator: {
          tickCount,
          currentTurn: sim.currentTurn,
          ts36ScoreWrites: telemetry.ts36ScoreWrites || 0,
          operatorDraftScores: telemetry.operatorDraftScores || 0,
          officialScoreConfirms: telemetry.officialScoreConfirms || 0,
          conflictFixes: telemetry.conflictFixes || 0,
          snapshotPublishes: telemetry.snapshotPublishes || 0,
          logsCreated: telemetry.logsCreated || 0
        }
      },
      note: `Đây là ngoại suy production cho giải kéo dài ${productionHours} giờ, không dùng ${formatDuration(fullRunSeconds)} chạy nén của simulator để tính chi phí. Tổng score lấy đủ 18 hố; LB poll Supabase mỗi ${productionScoreSeconds}s; viewer và TS36 đọc snapshot qua route cache Vercel mỗi ${productionLiveSeconds}s, TTL API public ${publicCacheSeconds}s. Trang live React/Next.js hiện tính thêm SSR/RSC initial page load, JSON API đã có ranking/metadata, cache hit/miss, revalidate khi publish, award assets từ Supabase Storage, và một lượt mỗi viewer mở kết quả chung cuộc kèm hiệu ứng reveal cuối giải. Snapshot chỉ auto publish khi có điểm đã confirm, với mức trần một publish mỗi chu kỳ; vì vậy đây là ước tính bảo thủ. Nếu bật direct Supabase fallback cho public thì phần public read sẽ chuyển thành Supabase egress.`
    };
  }

  function exportEventLog() {
    const sim = state().simulator;
    if (!sim?.active) return;
    addLog(`Xuất event log TXT cho ${sim.id}.`, "history");
    saveAndRender();
    const lines = [
      "Leaderboard Pro simulator event log",
      `Scenario: ${sim.id}`,
      `Tournament: ${state().tournament.name || ""}`,
      `Exported: ${nowIso()}`,
      `Progress: ${sim.currentTurn}/${sim.totalTurns}`,
      "",
      ...(sim.logs || []).map(item => {
        const turn = String(item.turn || 0).padStart(2, "0");
        return `[${item.at}] [T${turn}] [${getLogLabel(item.type)}] ${item.message}`;
      })
    ];
    const fileSafeId = String(sim.id || "simulation").replace(/[^a-z0-9_-]+/gi, "-");
    const blob = new Blob([`\uFEFF${lines.join("\r\n")}`], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${fileSafeId}-event-log.txt`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 0);
  }

  async function cleanup() {
    pause();
    const simulatorSlug = state().tournament?.shareSlug || "";
    await cleanupSimulatorLiveSnapshots();
    const raw = localStorage.getItem(BACKUP_KEY);
    if (raw) {
      try {
        window.LB.state = JSON.parse(raw);
      } catch (_err) {
        delete state().simulator;
      }
    } else {
      delete state().simulator;
    }
    if (simulatorSlug) window.LB.storage.removeSnapshot?.(simulatorSlug, { simulatorOnly: true });
    localStorage.removeItem(BACKUP_KEY);
    window.LB.storage.saveState();
    window.LB.app?.render?.();
    renderSimulator();
  }

  function saveAndRender() {
    window.LB.storage.saveState();
    window.LB.app?.render?.();
    renderSimulator();
  }

  function getPhaseLabel(sim) {
    if (!sim?.active) return "Idle";
    if (sim.phase === "pending_review") return "Pending";
    if (sim.phase === "published") return "Published";
    if (sim.phase === "finished") return "Final";
    if (sim.autoStarted && !sim.running) return "Paused";
    return sim.running ? "Auto" : "Ready";
  }

  function exportReport(report, id = "simulation-report") {
    if (!report) return;
    const fileSafeId = String(id || report.id || "simulation-report").replace(/[^a-z0-9_-]+/gi, "-").replace(/^-+|-+$/g, "") || "simulation-report";
    const payload = JSON.stringify(report, null, 2);
    const blob = new Blob([payload], { type: "application/json;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${fileSafeId}-resource-report.json`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 0);
  }

  function renderResourceReport(report) {
    const root = document.getElementById("simulator-resource-report");
    const stateBadge = document.getElementById("sim-resource-state");
    if (!root) return;
    if (!report) {
      if (stateBadge) stateBadge.textContent = "Chưa có dữ liệu";
      root.innerHTML = `<div class="empty-state">Tạo tournament ảo để xem thống kê request, bandwidth và database.</div>`;
      return;
    }
    if (stateBadge) stateBadge.textContent = "Ngoại suy production";
    root.innerHTML = `
      <div class="simulator-report-actions">
        <button type="button" class="secondary-button compact" data-simulator-action="export-report" data-report-id="${escapeHtml(report.id || "")}">Xuất JSON</button>
      </div>
      <div class="simulator-report-summary">
        ${report.summaryCards.map(card => `
          <div class="simulator-report-card">
            <small>${escapeHtml(card.label)}</small>
            <strong>${escapeHtml(card.value)}</strong>
            <span>${escapeHtml(card.hint)}</span>
          </div>
        `).join("")}
      </div>
      <div class="simulator-report-columns">
        ${report.sections.map(section => `
          <article class="simulator-report-table">
            <h3>${escapeHtml(section.title)}</h3>
            ${section.rows.map(([label, value]) => `
              <div class="simulator-report-row">
                <span>${escapeHtml(label)}</span>
                <b>${escapeHtml(value)}</b>
              </div>
            `).join("")}
          </article>
        `).join("")}
      </div>
      <div class="simulator-report-note">${escapeHtml(report.note)}</div>
    `;
  }

  function getLogLabel(type = "info") {
    const labels = {
      setup: "SETUP",
      start: "START",
      link: "LINK",
      turn: "TURN",
      score: "SCORE",
      confirm: "CONFIRM",
      publish: "LIVE",
      run: "RUN",
      finish: "FINAL",
      history: "SAVE"
    };
    return labels[type] || "INFO";
  }

  function getLogExtraClass(item = {}) {
    const message = String(item.message || "").toLowerCase();
    const risk = /(lệch|nhầm|trùng|conflict|sửa)/i.test(message);
    const highlight = risk || ["publish", "finish", "history", "link"].includes(item.type);
    return `${risk ? " is-risk" : ""}${highlight ? " is-highlight" : ""}`;
  }

  function renderSimulator() {
    const sim = state().simulator;
    const active = !!sim?.active;
    const logs = sim?.logs || [];
    const players = state().players || [];
    const matches = state().ts36Matches || [];
    const estimatedSeconds = active ? sim.totalTurns * 2 * sim.config.liveSeconds : 0;
    setText("sim-turn", active ? `${sim.currentTurn} / ${sim.totalTurns}` : "0 / 18");
    setText("sim-phase", getPhaseLabel(sim));
    setText("sim-golfer-count", active ? String(players.length) : "0");
    setText("sim-user-count", active ? String(matches.length) : "0");
    setText("sim-log-count", String(logs.length));
    setText("simulator-state-badge", active ? (sim.running ? "Đang chạy" : (sim.autoStarted ? "Tạm dừng" : "Đang giữ state ảo")) : "Local-only");
    setText("simulator-status", active
      ? `Scenario ${sim.id}. Nhịp simulator ${sim.config.liveSeconds}s, auto-run khoảng ${estimatedSeconds}s. Báo cáo ngoại suy ${sim.config.productionHours || 6}h theo cadence trong tab Cấu hình. Cleanup sẽ restore tournament thật từ backup local.`
      : "Chưa tạo kịch bản.");
    renderResourceReport(active ? estimateResourceReport() : null);

    const isRunning = !!sim?.running;
    const autoStarted = !!sim?.autoStarted;
    const finished = active && sim.currentTurn >= sim.totalTurns;
    const runButton = document.querySelector('[data-simulator-action="run"]');
    const pauseButton = document.getElementById("simulator-pause-button");
    const stepButton = document.querySelector('[data-simulator-action="step"]');
    if (runButton) runButton.disabled = !!(active && (isRunning || finished));
    if (stepButton) stepButton.disabled = !!(active && isRunning);
    if (pauseButton) {
      pauseButton.disabled = !active || !autoStarted || finished;
      pauseButton.textContent = finished ? "Đã xong" : (isRunning ? "Tạm dừng" : (autoStarted ? "Tiếp tục" : "Tạm dừng"));
    }

    const roster = document.getElementById("simulator-roster");
    if (roster) {
      const grouped = new Map();
      (sim?.scenario?.players || []).forEach(player => {
        if (!grouped.has(player.group)) grouped.set(player.group, []);
        grouped.get(player.group).push(player);
      });
      roster.innerHTML = active
        ? Array.from(grouped.entries()).map(([group, rows]) => `
            <div class="simulator-roster-group">
              <strong>Nhóm ${escapeHtml(group)}</strong>
              <span>${rows.map(row => `${row.vgaId} ${row.name}`).join(" · ")}</span>
            </div>
          `).join("")
        : `<div class="empty-state">Chưa có roster giả lập.</div>`;
    }

    const logRoot = document.getElementById("simulator-log");
    if (logRoot) {
      logRoot.innerHTML = logs.length
        ? logs.slice(-160).reverse().map(item => `
            <article class="simulator-log-item is-${escapeHtml(item.type)}${getLogExtraClass(item)}">
              <small><b class="simulator-log-badge">${escapeHtml(getLogLabel(item.type))}</b><span>T${escapeHtml(item.turn)} · ${escapeHtml(new Date(item.at).toLocaleTimeString("vi-VN"))}</span></small>
              <span>${escapeHtml(item.message)}</span>
            </article>
          `).join("")
        : `<div class="empty-state">Chưa có event log.</div>`;
    }

  }

  function setText(id, value) {
    const el = document.getElementById(id);
    if (el) el.textContent = value;
  }

  function syncProductionEstimateFromUi() {
    const sim = state().simulator;
    if (!sim?.active) return;
    sim.config.productionHours = cleanFloat(document.getElementById("sim-production-hours")?.value, 1, 12, 6);
    window.LB.storage.saveState();
    renderResourceReport(estimateResourceReport());
  }

  function syncViewerEstimateFromUi() {
    const sim = state().simulator;
    if (!sim?.active) return;
    const viewerInput = document.getElementById("sim-viewer-count")?.value;
    const fallbackViewerCount = Math.max(sim.config?.playerCount || 0, Math.round((sim.config?.playerCount || 0) * 1.8));
    const viewerCount = cleanInt(viewerInput, 0, 10000, fallbackViewerCount);
    const viewerConfig = buildViewerConfig(viewerCount);
    sim.config.viewerCount = viewerCount;
    sim.config.viewerSegments = viewerConfig.viewerSegments;
    sim.config.manualViewerSegments = viewerConfig.manualViewerSegments;
    window.LB.storage.saveState();
    renderResourceReport(estimateResourceReport());
  }

  function initializeProductionEstimateInputs() {
    const sim = state().simulator;
    const config = sim?.config || {};
    const productionHours = config.productionHours || 6;
    const hoursInput = document.getElementById("sim-production-hours");
    if (hoursInput) hoursInput.value = String(productionHours);
    const viewerInput = document.getElementById("sim-viewer-count");
    if (viewerInput) viewerInput.value = config.viewerCount ?? "";
    const segments = config.manualViewerSegments ? normalizeViewerSegments(config.viewerCount || 0, config.viewerSegments) : null;
    const segmentInputMap = {
      "sim-viewer-direct-full": segments?.directFull,
      "sim-viewer-direct-burst": segments?.directBurst,
      "sim-viewer-indirect-full": segments?.indirectFull,
      "sim-viewer-indirect-burst": segments?.indirectBurst
    };
    Object.entries(segmentInputMap).forEach(([id, value]) => {
      const input = document.getElementById(id);
      if (input) input.value = value ?? "";
    });
  }

  function handleSimulatorClick(event) {
    const target = event.target.closest("[data-simulator-action]");
    if (!target) return;
    const action = target.dataset.simulatorAction;
    if (action === "create") void createTournament();
    if (action === "step") applyTurn();
    if (action === "run") void run();
    if (action === "pause") togglePause();
    if (action === "save-history") exportEventLog();
    if (action === "export-report") {
      const reportId = target.dataset.reportId || state().simulator?.id || "simulation";
      exportReport(estimateResourceReport(), reportId);
    }
    if (action === "cleanup") {
      if (confirm("Trả lại trạng thái thật trước khi chạy simulator? Tournament ảo hiện tại sẽ bị xóa khỏi state đang mở.")) void cleanup();
    }
  }

  function init() {
    localStorage.removeItem(LEGACY_HISTORY_KEY);
    if (state().simulator?.active) state().simulator.running = false;
    const simulatorForm = document.getElementById("simulator-form");
    simulatorForm?.addEventListener("submit", event => event.preventDefault());
    simulatorForm?.addEventListener("input", event => {
      if (event.target.closest("#sim-production-hours")) {
        syncProductionEstimateFromUi();
      }
      if (event.target.closest("#sim-viewer-count, #sim-viewer-direct-full, #sim-viewer-direct-burst, #sim-viewer-indirect-full, #sim-viewer-indirect-burst")) {
        syncViewerEstimateFromUi();
      }
    });
    document.body.addEventListener("input", event => {
      if (!event.target.closest("#operator-score-poll-seconds, #operator-auto-live-seconds")) return;
      window.setTimeout(() => {
        if (state().simulator?.active) renderResourceReport(estimateResourceReport());
      }, 0);
    });
    document.body.addEventListener("click", handleSimulatorClick);
    document.body.addEventListener("click", event => {
      if (event.target.closest('[data-action="show-view"][data-view="simulator"]')) {
        window.setTimeout(() => {
          initializeProductionEstimateInputs();
          renderSimulator();
        }, 0);
      }
    });
    window.addEventListener("beforeunload", () => {
      if (!state().simulator?.active) return;
      // Reloading must preserve the active simulator. Only the explicit Cleanup
      // action is allowed to restore the pre-simulator backup.
      state().simulator.running = false;
      window.LB.storage.saveState();
    });
    initializeProductionEstimateInputs();
    renderSimulator();
  }

  window.LB.simulator = {
    createTournament,
    applyTurn,
    run,
    pause,
    exportEventLog,
    cleanup,
    render: renderSimulator
  };

  document.addEventListener("DOMContentLoaded", init);
})();
