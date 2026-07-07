(function () {
  function parsePayload(raw) {
    return typeof raw === "string" ? JSON.parse(raw) : (raw || {});
  }

  function normalizeNumber(value, fallback = "") {
    if (value === null || value === undefined || value === "") return fallback;
    const parsed = Number(String(value).replace(",", "."));
    if (!Number.isFinite(parsed)) return fallback;
    return Number.isInteger(parsed) ? parsed : parsed;
  }

  function cleanText(value = "") {
    return String(value ?? "").replace(/\s+/g, " ").trim();
  }

  function stripAccents(value = "") {
    return cleanText(value).normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  }

  function keyText(value = "") {
    return stripAccents(value).toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  }

  function looksLikeDivision(value = "") {
    const raw = cleanText(value);
    const key = keyText(raw);
    return /^(bang|bang dau|division|table|b)\s*[a-d0-9]+$/i.test(key)
      || /^(bang|bang dau|division|table)?\s*(nam|nu|male|female|men|women)\s*[a-d0-9]+$/i.test(key)
      || /^[a-d]$/i.test(raw)
      || /^(Nam|Nữ|Nu|Male|Female)\s*[A-D0-9]+$/i.test(raw)
      || /^b[a-d0-9]+$/i.test(raw);
  }

  function normalizeDivisionName(value = "") {
    const raw = cleanText(value);
    if (!raw) return "";
    const key = keyText(raw);
    if (/^bang\b/.test(key)) return raw.replace(/^bang/i, "Bảng");
    if (/^[a-d]$/i.test(raw)) return `Bảng ${raw.toUpperCase()}`;
    if (/^b([a-d0-9]+)$/i.test(raw)) return `Bảng ${raw.slice(1).toUpperCase()}`;
    if (/^(nu|female|women|woman|ladies|lady)$/.test(key)) return "Bảng Nữ";
    if (/^(nam|male|men)$/.test(key)) return "Bảng Nam";
    return raw;
  }

  function divisionKey(value = "") {
    const key = keyText(value);
    return key.replace(/^(?:bang dau|bang|division|table)\s+/, "");
  }

  function inferDivisionGender(value = "") {
    const key = keyText(value);
    if (/(?:^|\s)(?:nu|female|women|woman|lady|ladies|f)(?:\s|$)/.test(key)) return "female";
    if (/(?:^|\s)(?:nam|male|men|man|gentlemen|m)(?:\s|$)/.test(key)) return "male";
    return "";
  }

  function divisionLabel(value = "") {
    const key = divisionKey(value)
      .replace(/\b(?:nam|nu|male|female|men|women|man|woman|gentlemen|lady|ladies)\b/g, " ")
      .replace(/\s+/g, " ")
      .trim();
    const match = key.match(/(?:^|\s)([a-z]|\d+)(?:\s|$)/);
    return match?.[1] || "";
  }

  function divisionOrdinal(value = "") {
    const label = divisionLabel(value);
    if (/^\d+$/.test(label)) {
      const number = Number(label);
      return number >= 1 ? number - 1 : -1;
    }
    return /^[a-z]$/.test(label) ? label.charCodeAt(0) - 97 : -1;
  }

  function configuredDivisions() {
    const flights = window.LB.state?.flightConfig?.flights;
    return Array.isArray(flights) ? flights.filter(flight => cleanText(flight?.name)) : [];
  }

  function configuredDivisionGender(flight = {}) {
    return normalizeGender(flight.gender || flight.divisionGender || "") || inferDivisionGender(flight.name || flight.division || "");
  }

  function normalizeDivisionScoringMode(value = "") {
    const key = keyText(value);
    if (["system36", "s36", "tour system36", "toursystem36"].includes(key)) return "system36";
    if (["handicap", "whs", "stroke net", "gross net", "net"].includes(key)) return "handicap";
    return "";
  }

  function configuredDivisionScoringMode(flight = {}) {
    const explicit = normalizeDivisionScoringMode(flight.scoringMode || flight.scoring_mode || flight.mode || "");
    if (explicit) return explicit;
    if (flight.isSystem36 === true || flight.isSystem36Division === true || flight.system36 === true || flight.s36 === true) return "system36";
    if (flight.isSystem36 === false || flight.isSystem36Division === false || flight.system36 === false || flight.s36 === false) return "handicap";
    return "";
  }

  function configuredDivisionPool(gender = "", value = "", scoringMode = "") {
    const divisions = configuredDivisions();
    const targetGender = normalizeGender(gender) || inferDivisionGender(value);
    let pool = divisions;
    if (targetGender) {
      const matched = divisions.filter(flight => configuredDivisionGender(flight) === targetGender);
      const neutral = divisions.filter(flight => !configuredDivisionGender(flight));
      pool = matched.length ? matched : (neutral.length ? neutral : divisions);
    }
    const targetMode = normalizeDivisionScoringMode(scoringMode);
    if (targetMode) {
      const matched = pool.filter(flight => configuredDivisionScoringMode(flight) === targetMode);
      if (matched.length) pool = matched;
    }
    return pool;
  }

  function matchConfiguredDivision(value = "", divisions = configuredDivisions()) {
    const target = divisionKey(value);
    if (!target) return "";
    const matched = divisions.find(flight => divisionKey(flight.name) === target);
    return matched?.name || "";
  }

  function matchConfiguredDivisionsByHandicap(divisions = [], handicap = "") {
    if (!hasNumeric(handicap)) return [];
    const hcp = Number(handicap);
    return divisions.filter(flight => {
      const min = Number(flight.min ?? flight.handicapMin ?? flight.system36Min);
      const max = Number(flight.max ?? flight.handicapMax ?? flight.system36Max);
      return Number.isFinite(min) && Number.isFinite(max) && hcp >= min && hcp <= max;
    });
  }

  function resolveConfiguredDivision(value = "", gender = "", handicap = "", scoringMode = "") {
    const raw = cleanText(value);
    const divisions = configuredDivisions();
    if (!divisions.length) {
      return { name: normalizeDivisionName(raw), reason: raw ? "unconfigured" : "empty", ambiguous: false };
    }
    const pool = configuredDivisionPool(gender, raw, scoringMode);
    const configured = matchConfiguredDivision(raw, pool);
    if (configured) return { name: configured, reason: "exact", ambiguous: false };

    const label = divisionLabel(raw);
    if (label) {
      const sameLabel = pool.find(flight => divisionLabel(flight.name) === label);
      if (sameLabel) return { name: sameLabel.name, reason: "label", ambiguous: false };
      const ordinal = divisionOrdinal(raw);
      if (ordinal >= 0 && ordinal < pool.length) {
        return { name: pool[ordinal].name, reason: "ordinal", ambiguous: false };
      }
    }

    const handicapMatches = matchConfiguredDivisionsByHandicap(pool, handicap);
    if (handicapMatches.length === 1) {
      return { name: handicapMatches[0].name, reason: "course_handicap", ambiguous: false };
    }
    if (handicapMatches.length > 1) {
      return { name: handicapMatches[0].name, reason: "course_handicap", ambiguous: true };
    }
    if (pool.length === 1) return { name: pool[0].name, reason: "single_context", ambiguous: false };
    if (!raw) {
      return { name: "", reason: "missing_course_handicap", ambiguous: true };
    }
    return {
      name: raw ? (pool[0]?.name || divisions[0].name) : "",
      reason: raw ? "configured_fallback" : "empty",
      ambiguous: !!raw && pool.length > 1
    };
  }

  function resolveConfiguredDivisionName(value = "", gender = "", handicap = "", scoringMode = "") {
    return resolveConfiguredDivision(value, gender, handicap, scoringMode).name;
  }

  function normalizeVgaId(value = "") {
    return cleanText(value).toUpperCase().replace(/[^A-Z0-9]/g, "");
  }

  function normalizeGender(value = "") {
    const key = keyText(value);
    if (!key) return "";
    if (/^(nam|male|men|m|boy|gentlemen)$/.test(key)) return "male";
    if (/^(nu|nữ|female|women|woman|f|lady|ladies)$/.test(key)) return "female";
    return "";
  }

  function isDecimalHandicap(value = "") {
    const text = cleanText(value);
    if (!text) return false;
    if (!/[,.]\d+/.test(text)) return false;
    const parsed = Number(text.replace(",", "."));
    return Number.isFinite(parsed) && Math.abs(parsed - Math.round(parsed)) > 0.001;
  }

  function isAwardExcluded(value = "") {
    const key = keyText(value);
    return /\b(?:ko|khong|khg|k)\s*tinh\s*giai\b/.test(key) || /\bkhong\s*du\s*giai\b/.test(key);
  }

  function parseBooleanFlag(value, fallback = false) {
    if (value === undefined || value === null || value === "") return fallback;
    const key = keyText(value);
    if (/^(true|yes|1|co|locked|khoa)$/.test(key)) return true;
    if (/^(false|no|0|khong|unlocked|mo)$/.test(key)) return false;
    return !!value;
  }

  function hasNumeric(value) {
    return value !== "" && value !== null && value !== undefined && Number.isFinite(Number(value));
  }

  function getCourseParTotal() {
    return (window.LB.state.course.holes || []).reduce((total, hole) => total + (Number(hole.par) || 0), 0) || 72;
  }

  function calculateCourseHandicap(handicapIndex, gender = "") {
    const index = Number(handicapIndex);
    if (!Number.isFinite(index)) return "";
    const ratings = window.LB.state.tournament.handicapRatings || {};
    const rating = ratings[normalizeGender(gender) === "female" ? "female" : "male"] || {};
    const slope = Number(rating.slopeRating);
    const courseRating = Number(rating.courseRating);
    if (!Number.isFinite(slope) || slope <= 0 || !Number.isFinite(courseRating)) return Math.round(index);
    return Math.round((index * slope / 113) + (courseRating - getCourseParTotal()));
  }

  function applyHandicapMode(rows = []) {
    const numericRows = rows.filter(row => row.handicap !== "" && Number.isFinite(Number(row.handicap)) && !hasNumeric(row.handicapIndex) && !hasNumeric(row.courseHandicap));
    const decimalRows = numericRows.filter(row => row._handicapHasDecimal);
    const usesHandicapIndex = numericRows.length > 0 && decimalRows.length > 0;
    rows.forEach(row => {
      if (hasNumeric(row.courseHandicap)) {
        row.courseHandicap = Math.round(Number(row.courseHandicap));
        row.handicap = row.courseHandicap;
        row.courseHandicapLocked = true;
        row.handicapSource = hasNumeric(row.handicapIndex) ? "course_handicap_with_index" : "course_handicap";
        return;
      }
      if (hasNumeric(row.handicapIndex)) {
        row.courseHandicap = calculateCourseHandicap(row.handicapIndex, row.gender);
        row.handicap = row.courseHandicap;
        row.courseHandicapLocked = false;
        row.handicapSource = "whs_index";
        return;
      }
      if (row.handicap === "" || !Number.isFinite(Number(row.handicap))) {
        row.handicapIndex = "";
        row.courseHandicap = "";
        row.courseHandicapLocked = false;
        return;
      }
      if (usesHandicapIndex) {
        row.handicapIndex = row.handicap;
        row.courseHandicap = calculateCourseHandicap(row.handicapIndex, row.gender);
        row.handicap = row.courseHandicap;
        row.courseHandicapLocked = false;
      } else {
        row.handicapIndex = "";
        row.courseHandicap = Math.round(Number(row.handicap));
        row.handicap = row.courseHandicap;
        row.courseHandicapLocked = true;
      }
      row.handicapSource = usesHandicapIndex ? "whs_index" : "course_handicap";
    });
    return rows;
  }

  function readFirst(row, keys) {
    for (const key of keys) {
      const value = row?.[key];
      if (value !== undefined && value !== null && cleanText(value) !== "") return value;
    }
    return "";
  }

  function readImportedDivision(row = {}) {
    const explicit = readFirst(row, [
      "division", "divisionName", "division_name", "table", "tableName", "bang", "bang_dau", "registeredDivisionName"
    ]);
    if (explicit) return cleanText(explicit);
    const legacyFlight = readFirst(row, ["registeredFlightName", "flightName", "flight"]);
    return looksLikeDivision(legacyFlight) ? cleanText(legacyFlight) : "";
  }

  function readImportedScoringMode(row = {}) {
    const explicit = normalizeDivisionScoringMode(readFirst(row, [
      "scoringMode", "scoring_mode", "divisionScoringMode", "division_scoring_mode", "mode"
    ]));
    if (explicit) return explicit;
    const marker = readFirst(row, [
      "isSystem36Division", "is_system36_division", "isSystem36", "is_system36", "system36", "s36"
    ]);
    if (marker === "") return "";
    return parseBooleanFlag(marker, false) ? "system36" : "handicap";
  }

  function resolveDivision(row = {}) {
    const gender = normalizeGender(row.gender || row.sex || row.gioi_tinh || row.gioiTinh || row.gender_name || row.genderName);
    const handicap = readFirst(row, [
      "courseHandicap", "course_handicap", "playingHandicap", "playing_handicap",
      "handicap", "hcp", "hdc", "handicapIndex", "handicap_index"
    ]);
    const importedDivision = readImportedDivision(row);
    return importedDivision
      ? resolveConfiguredDivisionName(importedDivision, gender, handicap, readImportedScoringMode(row))
      : "";
  }

  function resolveFlightGroup(row = {}) {
    const explicit = readFirst(row, [
      "flightGroup", "flight_group", "flightGroupName", "registeredFlightGroupName",
      "group", "groupName", "group_name", "teeTime", "tee_time", "cart"
    ]);
    if (explicit) return cleanText(explicit);
    const legacyFlight = readFirst(row, ["flight"]);
    if (!legacyFlight) return "";
    const hasDivisionContext = !!readFirst(row, [
      "division", "divisionName", "division_name", "table", "tableName", "bang", "bang_dau", "registeredDivisionName"
    ]);
    return hasDivisionContext || !looksLikeDivision(legacyFlight) ? cleanText(legacyFlight) : "";
  }

  function resolveStartHole(row = {}) {
    return cleanText(readFirst(row, [
      "startHole", "start_hole", "startingHole", "starting_hole",
      "hole_start", "holeStart", "teeHole", "tee_hole", "tee", "start", "shotgunHole", "shotgun_hole"
    ])).toUpperCase().replace(/\s+/g, "");
  }

  function extractFlightGroupWithSuffix(value = "") {
    const raw = cleanText(value).toUpperCase().replace(/\s+/g, "");
    const match = raw.match(/(?:^|[^0-9])(1[0-8]|[1-9])[-_]?([AB])(?:[^A-Z0-9]|$)|^(1[0-8]|[1-9])[-_]?([AB])$/i);
    if (!match) return "";
    const hole = Number(match[1] || match[3]);
    const suffix = String(match[2] || match[4] || "").toUpperCase();
    return hole >= 1 && hole <= 18 && suffix ? `${hole}${suffix}` : "";
  }

  function extractStartHoleNumber(value = "") {
    const raw = cleanText(value).toUpperCase();
    const match = raw.match(/(?:^|[^0-9])(1[0-8]|[1-9])(?:[^0-9]|$)|^(1[0-8]|[1-9])$/);
    const hole = match ? Number(match[1] || match[2]) : 0;
    return hole >= 1 && hole <= 18 ? String(hole) : "";
  }

  function normalizeFlightGroupLabel(flightGroup = "", startHole = "") {
    const explicit = extractFlightGroupWithSuffix(flightGroup) || extractFlightGroupWithSuffix(startHole);
    if (explicit) return explicit;
    const hole = extractStartHoleNumber(flightGroup) || extractStartHoleNumber(startHole);
    return hole ? `${hole}A` : "";
  }

  function getStartHoleFromFlightGroup(flightGroup = "", fallback = "") {
    const group = extractFlightGroupWithSuffix(flightGroup);
    if (group) return group.replace(/[AB]$/i, "");
    return extractStartHoleNumber(fallback) || extractStartHoleNumber(flightGroup);
  }

  function resolveFlightAssignment(row = {}) {
    const rawGroup = resolveFlightGroup(row);
    const rawStartHole = resolveStartHole(row);
    const flightGroup = normalizeFlightGroupLabel(rawGroup, rawStartHole);
    return {
      flightGroup,
      startHole: getStartHoleFromFlightGroup(flightGroup, rawStartHole || rawGroup)
    };
  }

  function readOperationalNote(row = {}) {
    return cleanText(readFirst(row, ["operationNote", "operation_note", "note", "notes", "ghi_chu", "ghiChu", "remark", "remarks"]));
  }

  function readCaddyNumber(row = {}) {
    return cleanText(readFirst(row, ["caddyNumber", "caddy_number", "caddieNumber", "caddie_number", "caddy", "caddie", "cd", "so_caddy", "số caddy"]));
  }

  function readWarnings(row = {}, note = "") {
    const raw = Array.isArray(row.warnings) ? row.warnings : [];
    const warnings = raw.map(cleanText).filter(Boolean);
    if (note && !warnings.includes(note)) warnings.push(note);
    if (row.reviewRequired && !warnings.some(warning => /review|required|xác nhận|kiem tra|kiểm tra/i.test(warning))) {
      warnings.push("Có ô điểm độ tin cậy thấp; GO cần đối chiếu ảnh gốc trước khi xác nhận.");
    }
    return warnings;
  }

  function readAwardEligible(row = {}, note = "") {
    const explicit = readFirst(row, ["awardEligible", "award_eligible", "eligible", "countForAward", "count_for_award", "tinh_giai"]);
    if (explicit !== "") {
      const key = keyText(explicit);
      if (/^(false|no|0|ko|khong|khong tinh giai)$/.test(key)) return false;
      if (/^(true|yes|1|co|tinh giai)$/.test(key)) return true;
    }
    return !isAwardExcluded(note);
  }

  function readHandicapFields(row = {}) {
    const handicapRaw = readFirst(row, ["handicap", "hcp", "hdc"]);
    const handicapIndexRaw = readFirst(row, ["handicapIndex", "handicap_index", "hcpIndex", "hcp_index", "hdcIndex", "hdc_index"]);
    const courseHandicapRaw = readFirst(row, ["courseHandicap", "course_handicap", "playingHandicap", "playing_handicap", "hcpSan", "hcp_san", "hdcSam", "hdc_sam"]);
    const handicapIndex = normalizeNumber(handicapIndexRaw, "");
    const courseHandicap = normalizeNumber(courseHandicapRaw, "");
    const handicap = courseHandicap !== "" ? courseHandicap : (normalizeNumber(handicapRaw, handicapIndex));
    const courseHandicapLocked = parseBooleanFlag(readFirst(row, ["courseHandicapLocked", "course_handicap_locked"]), courseHandicap !== "");
    const handicapSource = cleanText(readFirst(row, ["handicapSource", "handicap_source"]));
    return {
      handicap,
      handicapIndex,
      courseHandicap,
      courseHandicapLocked,
      handicapSource,
      _handicapHasDecimal: isDecimalHandicap(handicapRaw || handicapIndexRaw)
    };
  }

  function normalizeScorecards(raw) {
    const root = parsePayload(raw);
    if (Array.isArray(root.opponents)) {
      return applyHandicapMode(root.opponents.map((row, index) => {
        const note = readOperationalNote(row);
        const division = resolveDivision(row);
        const assignment = resolveFlightAssignment(row);
        return ({
        id: `ocr-${Date.now().toString(36)}-${index}`,
        sourceImageIndex: row.sourceImageIndex || row.source_image_index || index + 1,
        name: cleanText(row.name || row.player || row.golfer || `Golfer ${index + 1}`),
        vgaId: normalizeVgaId(row.playerExternalId || row.id_vga || row.idVga || ""),
        ...readHandicapFields(row),
        gender: normalizeGender(row.gender || row.sex || row.gioi_tinh || row.gioiTinh),
        importedDivision: readImportedDivision(row),
        importedScoringMode: readImportedScoringMode(row),
        division,
        flightGroup: assignment.flightGroup,
        flight: division,
        startHole: assignment.startHole,
        group: assignment.flightGroup,
        caddyNumber: readCaddyNumber(row),
        operationNote: note,
        awardEligible: readAwardEligible(row, note),
        grossScores: normalizeCells(row.cells || []),
        scoreReviewCells: normalizeReviewCells(row.cells || []),
        ocrReviewRequired: !!row.reviewRequired,
        warnings: readWarnings(row, note)
      }); }));
    }

    function parseIntSafe(val) {
      if (val === null || val === undefined) return null;
      const str = String(val).trim().toLowerCase();
      if (str === "x") return null;
      const num = parseInt(str.replace(/[^\d.-]/g, ""), 10);
      return Number.isFinite(num) ? num : null;
    }

    function countGrossOverParMatches(grossScores, overParScores, pars, startIndex, endIndex) {
      let matches = 0;
      for (let index = startIndex; index < endIndex; index += 1) {
        const gross = parseIntSafe(grossScores[index]);
        const overPar = parseIntSafe(overParScores[index]);
        const par = pars[index] ?? null;
        if (gross !== null && overPar !== null && par !== null && gross === par + overPar) matches += 1;
      }
      return matches;
    }
    
    function shiftSegmentRight(scores, startIndex, endIndex, shift) {
      const shifted = scores.slice();
      for (let index = endIndex - 1; index >= startIndex; index -= 1) {
        const sourceIndex = index - shift;
        shifted[index] = sourceIndex >= startIndex ? scores[sourceIndex] : "x";
      }
      return shifted;
    }
    
    function realignCompactScoresToStartHole(grossScores, overParScores, startHole, warnings) {
      if (startHole === null || startHole <= 1 || startHole > 18) {
        return { grossScores, overParScores, reviewHoles: [] };
      }
      const occupied = grossScores.map((score, index) => (
        parseIntSafe(score) !== null || parseIntSafe(overParScores[index]) !== null ? index : -1
      )).filter(index => index >= 0);
      if (!occupied.length || occupied.length >= 18 || occupied.some((index, offset) => index !== offset)) {
        return { grossScores, overParScores, reviewHoles: [] };
      }
    
      const alignedGross = Array.from({ length: 18 }, () => "x");
      const alignedOverPar = Array.from({ length: 18 }, () => "x");
      const reviewHoles = [];
      occupied.forEach((sourceIndex, offset) => {
        const targetIndex = (startHole - 1 + offset) % 18;
        alignedGross[targetIndex] = grossScores[sourceIndex];
        alignedOverPar[targetIndex] = overParScores[sourceIndex];
        reviewHoles.push(targetIndex + 1);
      });
      warnings.push(`Phát hiện xuất phát đồng loạt (Shotgun) tại hố ${startHole}; tự động căn chỉnh và để trống các hố trước đó.`);
      return { grossScores: alignedGross, overParScores: alignedOverPar, reviewHoles };
    }
    
    function repairSkippedHoleGaps(grossScores, overParScores, pars, warnings) {
      let repairedGross = grossScores.slice();
      let repairedOverPar = overParScores.slice();
      [[0, 9], [9, 18]].forEach(([startIndex, endIndex]) => {
        const currentMatches = countGrossOverParMatches(repairedGross, repairedOverPar, pars, startIndex, endIndex);
        const segmentGross = repairedGross.slice(startIndex, endIndex);
        const segmentOverPar = repairedOverPar.slice(startIndex, endIndex);
        const segmentLength = endIndex - startIndex;
        const numericCount = segmentGross.filter(s => parseIntSafe(s) !== null).length;
        if (numericCount >= segmentLength || currentMatches >= Math.max(3, numericCount - 1)) return;
        let bestGapIndex = -1;
        let bestMatches = currentMatches;
        for (let gapOffset = 0; gapOffset < segmentLength; gapOffset += 1) {
          const trialGross = [...segmentGross.slice(0, gapOffset), "x", ...segmentGross.slice(gapOffset, segmentLength - 1)];
          const trialOverPar = [...segmentOverPar.slice(0, gapOffset), "x", ...segmentOverPar.slice(gapOffset, segmentLength - 1)];
          const trialMatches = countGrossOverParMatches(trialGross, trialOverPar, pars, startIndex, endIndex);
          if (trialMatches > bestMatches) {
            bestMatches = trialMatches;
            bestGapIndex = gapOffset;
          }
        }
        if (bestGapIndex >= 0 && bestMatches >= currentMatches + 3 && bestMatches >= 3) {
          const insertedGross = [...segmentGross.slice(0, bestGapIndex), "x", ...segmentGross.slice(bestGapIndex, segmentLength - 1)];
          const insertedOverPar = [...segmentOverPar.slice(0, bestGapIndex), "x", ...segmentOverPar.slice(bestGapIndex, segmentLength - 1)];
          for (let i = 0; i < segmentLength; i += 1) {
            repairedGross[startIndex + i] = insertedGross[i];
            repairedOverPar[startIndex + i] = insertedOverPar[i];
          }
          warnings.push(`Phát hiện ô điểm bị bỏ qua tại hố ${startIndex + bestGapIndex + 1}; tự chèn ô trống và căn lại cột.`);
        }
      });
      return { grossScores: repairedGross, overParScores: repairedOverPar };
    }
    
    function fixGrossOverParColumnAlignment(grossScores, overParScores, pars, warnings) {
      let alignedGross = grossScores.slice();
      let alignedOverPar = overParScores.slice();
      [[0, 9], [9, 18]].forEach(([startIndex, endIndex]) => {
        const currentMatches = countGrossOverParMatches(alignedGross, alignedOverPar, pars, startIndex, endIndex);
        const firstGross = parseIntSafe(alignedGross[startIndex]);
        const firstOverPar = parseIntSafe(alignedOverPar[startIndex]);
        const firstCellLooksValid = (firstGross !== null && firstGross >= 1 && firstGross <= 15)
          || (firstOverPar !== null && firstOverPar >= -5 && firstOverPar <= 8);
        let bestShift = 0;
        let bestMatches = currentMatches;
        [1, 2, 3].forEach(shift => {
          const shiftedGross = shiftSegmentRight(alignedGross, startIndex, endIndex, shift);
          const shiftedOverPar = shiftSegmentRight(alignedOverPar, startIndex, endIndex, shift);
          const shiftedMatches = countGrossOverParMatches(shiftedGross, shiftedOverPar, pars, startIndex, endIndex);
          if (shiftedMatches > bestMatches) {
            bestShift = shift;
            bestMatches = shiftedMatches;
          }
        });
        if (bestShift > 0 && bestMatches >= currentMatches + 3 && bestMatches >= 3) {
          if (firstCellLooksValid) return;
          alignedGross = shiftSegmentRight(alignedGross, startIndex, endIndex, bestShift);
          alignedOverPar = shiftSegmentRight(alignedOverPar, startIndex, endIndex, bestShift);
          warnings.push(`Phát hiện lệch cột ở đường ${startIndex === 0 ? "đi" : "về"}; tự động căn lề.`);
        }
      });
      return { grossScores: alignedGross, overParScores: alignedOverPar };
    }

    const rows = Array.isArray(root) ? root : (root.scorecards || root.players || []);
    
    const pars = [];
    const globalState = window.LB?.state || {};
    for (let i = 1; i <= 18; i++) {
      const h = window.LB?.scoring?.getHoleConfig?.(globalState, i) || { par: 4 };
      pars.push(h.par);
    }
    
    return applyHandicapMode(rows.map((row, index) => {
      const note = readOperationalNote(row);
      const division = resolveDivision(row);
      const assignment = resolveFlightAssignment(row);
      
      let warnings = readWarnings(row, note);
      
      let grossArr = Array.isArray(row.gross_scores) ? row.gross_scores : (Array.isArray(row.scores) ? row.scores : Array.from({length: 18}, () => "x"));
      let overParArr = Array.isArray(row.over_par_scores) ? row.over_par_scores : (Array.isArray(row.net_scores) ? row.net_scores : Array.from({length: 18}, () => "x"));
      
      grossArr = grossArr.slice(0, 18);
      while (grossArr.length < 18) grossArr.push("x");
      overParArr = overParArr.slice(0, 18);
      while (overParArr.length < 18) overParArr.push("x");

      const explicitStartHole = parseIntSafe(row.start_hole || row.startHole || row.starting_hole || assignment.startHole);

      const startAligned = realignCompactScoresToStartHole(grossArr, overParArr, explicitStartHole, warnings);
      const gapRepaired = repairSkippedHoleGaps(startAligned.grossScores, startAligned.overParScores, pars, warnings);
      const aligned = fixGrossOverParColumnAlignment(gapRepaired.grossScores, gapRepaired.overParScores, pars, warnings);
      
      row.gross_scores = aligned.grossScores;
      row.warnings = warnings;

      return ({
      id: `ocr-${Date.now().toString(36)}-${index}`,
      sourceImageIndex: row.source_image_index || row.sourceImageIndex || index + 1,
      name: cleanText(row.name || row.player_name || row.golfer || `Golfer ${index + 1}`),
      vgaId: normalizeVgaId(row.id_vga || row.vga_id || row.vgaId || row.member_id || ""),
      ...readHandicapFields(row),
      gender: normalizeGender(row.gender || row.sex || row.gioi_tinh || row.gioiTinh),
      importedDivision: readImportedDivision(row),
      importedScoringMode: readImportedScoringMode(row),
      division,
      flightGroup: assignment.flightGroup,
      flight: division,
      startHole: assignment.startHole,
      group: assignment.flightGroup,
      caddyNumber: readCaddyNumber(row),
      operationNote: note,
      awardEligible: readAwardEligible(row, note),
      grossScores: normalizeScores(row.gross_scores_by_hole || row.gross_scores || row.scores || row.gross || {}),
      warnings: readWarnings(row, note)
    }); }).filter(row => Object.keys(row.grossScores).length > 0));
  }

  function normalizeParticipants(raw) {
    const root = parsePayload(raw);
    const rows = Array.isArray(root) ? root : (root.participants || root.golfers || root.players || []);
    return applyHandicapMode(rows.map((row, index) => {
      const note = readOperationalNote(row);
      const division = resolveDivision(row);
      const assignment = resolveFlightAssignment(row);
      return ({
      id: `participant-${Date.now().toString(36)}-${index}`,
      name: cleanText(row.name || row.player_name || row.golfer || row.full_name || `Golfer ${index + 1}`),
      vgaId: normalizeVgaId(row.vga_id || row.vgaId || row.vga || row.member_id || ""),
      ...readHandicapFields(row),
      gender: normalizeGender(row.gender || row.sex || row.gioi_tinh || row.gioiTinh || row.gender_name || row.genderName),
      importedDivision: readImportedDivision(row),
      importedScoringMode: readImportedScoringMode(row),
      division,
      flightGroup: assignment.flightGroup,
      flight: division,
      startHole: assignment.startHole,
      group: assignment.flightGroup,
      caddyNumber: readCaddyNumber(row),
      operationNote: note,
      awardEligible: readAwardEligible(row, note),
      warnings: readWarnings(row, note)
    }); })).filter(row => row.name);
  }

  function normalizeScores(input) {
    if (Array.isArray(input)) {
      return input.reduce((result, value, index) => {
        const gross = parseInt(value, 10);
        if (Number.isFinite(gross) && gross > 0) result[index + 1] = gross;
        return result;
      }, {});
    }

    return Object.entries(input || {}).reduce((result, [key, value]) => {
      const hole = parseInt(key, 10);
      const gross = parseInt(value, 10);
      if (hole >= 1 && hole <= 18 && Number.isFinite(gross) && gross > 0) result[hole] = gross;
      return result;
    }, {});
  }

  function normalizeCells(cells) {
    return (Array.isArray(cells) ? cells : []).reduce((result, cell) => {
      const hole = parseInt(cell?.hole, 10);
      const gross = parseInt(cell?.gross, 10);
      if (hole >= 1 && hole <= 18 && Number.isFinite(gross) && gross > 0) result[hole] = gross;
      return result;
    }, {});
  }

  function normalizeReviewCells(cells) {
    return (Array.isArray(cells) ? cells : []).reduce((result, cell) => {
      const hole = parseInt(cell?.hole, 10);
      if (hole < 1 || hole > 18) return result;
      const gross = parseInt(cell?.gross, 10);
      const confidenceValue = Number(cell?.confidence);
      result[hole] = {
        gross: Number.isFinite(gross) && gross > 0 ? gross : null,
        confidence: Number.isFinite(confidenceValue)
          ? Math.max(0, Math.min(1, confidenceValue > 1 ? confidenceValue / 100 : confidenceValue))
          : 0.84,
        warning: cleanText(cell?.warning),
        raw: cleanText(cell?.raw)
      };
      return result;
    }, {});
  }

  const GEMINI_SCORECARD_TARGET_BYTES = 900 * 1024;
  const GEMINI_SCORECARD_MAX_BYTES = 1200 * 1024;
  const GEMINI_SCORECARD_DETAIL_TARGET_BYTES = 220 * 1024;
  const GEMINI_SCORECARD_MAX_DETAIL_IMAGES = 4;
  const GEMINI_SCORECARD_MODEL_OPTIONS = ["gemini-3.5-flash", "gemini-2.5-flash-lite", "gemini-3.1-flash-lite", "gemini-2.5-flash"];

  function normalizeGeminiScorecardModel(value) {
    const model = cleanText(value).replace(/^models\//i, "");
    return GEMINI_SCORECARD_MODEL_OPTIONS.includes(model) ? model : "gemini-3.5-flash";
  }

  function deriveGeminiScorecardEndpoint(env = window.ENV || {}) {
    const configured = cleanText(env.GEMINI_SCORECARD_ENDPOINT || env.SCORECARD_OCR_ENDPOINT);
    if (configured) return configured;
    if (String(env.LB_RUNTIME_MODE || "").toLowerCase() === "cloud") return "/api/gemini-scorecard-ocr";
    const localEndpoint = cleanText(env.LOCAL_OCR_ENDPOINT) || "http://localhost:8866/ocr";
    try {
      const url = new URL(localEndpoint, window.location.href);
      const path = url.pathname.replace(/\/ocr\/?$/i, "");
      url.pathname = `${path.replace(/\/$/, "")}/gemini-scorecard-ocr`;
      url.search = "";
      url.hash = "";
      return url.toString();
    } catch (err) {
      return "http://localhost:8866/gemini-scorecard-ocr";
    }
  }

  function normalizeGeminiScorecardError(payload = {}, response = null) {
    const raw = cleanText(payload.message || payload.error || payload.details || "");
    const status = Number(response?.status || payload.status || payload.statusCode || 0);
    if (
      status === 503
      || /^gemini_http_503$/i.test(raw)
      || /^google_server_overloaded$/i.test(raw)
      || /(?:overload|overloaded|unavailable|503|temporarily|server is busy|model is overloaded)/i.test(raw)
    ) {
      return "Server google đang tạm thời quá tải. Thử lại sau";
    }
    if (/leaderboard_scorecard_paid_order_required|leaderboard_scorecard_package_required/i.test(raw)) {
      return "OCR scorecard bằng Gemini server chỉ mở cho tournament đã có order paid Mode 1 trở lên.";
    }
    if (/leaderboard_scorecard_private_code_required|login_required/i.test(raw)) {
      return "Hãy mở đúng tournament bằng private code trước khi dùng OCR scorecard online.";
    }
    if (status === 402 || /operator_scorecard_ocr_quota_exceeded|quota_exceeded|limit/i.test(raw)) {
      return "Tournament này đã đạt giới hạn OCR scorecard của gói hiện tại.";
    }
    return raw || `Gemini scorecard OCR lỗi ${status || "unknown"}`;
  }

  function isSupportedGeminiScorecardImage(file) {
    if (!file) return false;
    const mime = String(file.type || "").toLowerCase();
    return ["image/png", "image/jpeg"].includes(mime) || /\.(png|jpe?g)$/i.test(file.name || "");
  }

  function loadImageFile(file) {
    return new Promise((resolve, reject) => {
      const image = new Image();
      const url = URL.createObjectURL(file);
      image.onload = () => {
        URL.revokeObjectURL(url);
        resolve(image);
      };
      image.onerror = () => {
        URL.revokeObjectURL(url);
        reject(new Error("Không đọc được file ảnh scorecard."));
      };
      image.src = url;
    });
  }

  function detectScorecardCropBox(ctx, width, height) {
    try {
      const imageData = ctx.getImageData(0, 0, width, height);
      const data = imageData.data;
      const step = Math.max(3, Math.round(Math.max(width, height) / 420));
      const columns = Math.ceil(width / step);
      const rows = Math.ceil(height / step);
      const candidates = new Uint8Array(columns * rows);
      for (let row = 0; row < rows; row += 1) {
        for (let column = 0; column < columns; column += 1) {
          const x = Math.min(width - 1, column * step);
          const y = Math.min(height - 1, row * step);
          const offset = (y * width + x) * 4;
          const r = data[offset];
          const g = data[offset + 1];
          const b = data[offset + 2];
          const brightness = (r + g + b) / 3;
          const saturation = Math.max(r, g, b) - Math.min(r, g, b);
          if (brightness > 150 && saturation < 82) candidates[row * columns + column] = 1;
        }
      }

      const visited = new Uint8Array(candidates.length);
      let best = null;
      const fullArea = width * height;
      for (let start = 0; start < candidates.length; start += 1) {
        if (!candidates[start] || visited[start]) continue;
        const queue = [start];
        visited[start] = 1;
        let cursor = 0;
        let count = 0;
        let minColumn = columns;
        let minRow = rows;
        let maxColumn = 0;
        let maxRow = 0;
        while (cursor < queue.length) {
          const current = queue[cursor++];
          const row = Math.floor(current / columns);
          const column = current % columns;
          count += 1;
          minColumn = Math.min(minColumn, column);
          minRow = Math.min(minRow, row);
          maxColumn = Math.max(maxColumn, column);
          maxRow = Math.max(maxRow, row);
          const neighbors = [];
          if (column > 0) neighbors.push(current - 1);
          if (column + 1 < columns) neighbors.push(current + 1);
          if (row > 0) neighbors.push(current - columns);
          if (row + 1 < rows) neighbors.push(current + columns);
          for (const neighbor of neighbors) {
            if (neighbor < 0 || neighbor >= candidates.length) continue;
            if (!candidates[neighbor] || visited[neighbor]) continue;
            visited[neighbor] = 1;
            queue.push(neighbor);
          }
        }

        const cropWidth = Math.min(width, (maxColumn - minColumn + 1) * step);
        const cropHeight = Math.min(height, (maxRow - minRow + 1) * step);
        const cropArea = cropWidth * cropHeight;
        const fillRatio = count / Math.max(1, (maxColumn - minColumn + 1) * (maxRow - minRow + 1));
        const aspectRatio = cropWidth / Math.max(1, cropHeight);
        if (cropWidth < width * 0.35 || cropHeight < height * 0.25) continue;
        if (cropArea < fullArea * 0.15 || cropArea > fullArea * 0.90) continue;
        if (fillRatio < 0.42 || aspectRatio < 0.42 || aspectRatio > 3.6) continue;
        const score = cropArea * fillRatio;
        if (!best || score > best.score) {
          best = {
            score,
            x: minColumn * step,
            y: minRow * step,
            width: cropWidth,
            height: cropHeight
          };
        }
      }

      if (!best) return null;
      const pad = Math.round(Math.max(width, height) * 0.025);
      const x = Math.max(0, best.x - pad);
      const y = Math.max(0, best.y - pad);
      const maxX = Math.min(width, best.x + best.width + pad);
      const maxY = Math.min(height, best.y + best.height + pad);
      return { x, y, width: maxX - x, height: maxY - y };
    } catch (err) {
      console.warn("[LB OCR] Gemini crop detection skipped:", err);
      return null;
    }
  }

  function canvasDataUrlByteLength(dataUrl) {
    const commaIndex = dataUrl.indexOf(",");
    const base64Length = commaIndex >= 0 ? dataUrl.length - commaIndex - 1 : dataUrl.length;
    return Math.round(base64Length * 0.75);
  }

  function formatGeminiScorecardBytes(bytes) {
    const value = Number(bytes) || 0;
    if (value >= 1024 * 1024) return `${(value / (1024 * 1024)).toFixed(1)}MB`;
    return `${Math.max(1, Math.round(value / 1024))}KB`;
  }

  function encodeCanvas(canvas, mimeType, quality) {
    return mimeType === "image/jpeg" ? canvas.toDataURL(mimeType, quality) : canvas.toDataURL(mimeType);
  }

  function resizeCanvas(sourceCanvas, scale) {
    const nextCanvas = document.createElement("canvas");
    nextCanvas.width = Math.max(1, Math.round(sourceCanvas.width * scale));
    nextCanvas.height = Math.max(1, Math.round(sourceCanvas.height * scale));
    const nextCtx = nextCanvas.getContext("2d");
    nextCtx.fillStyle = "#ffffff";
    nextCtx.fillRect(0, 0, nextCanvas.width, nextCanvas.height);
    nextCtx.imageSmoothingEnabled = true;
    nextCtx.imageSmoothingQuality = "high";
    nextCtx.drawImage(sourceCanvas, 0, 0, nextCanvas.width, nextCanvas.height);
    return nextCanvas;
  }

  function compressCanvasForGemini(sourceCanvas, targetBytes = GEMINI_SCORECARD_TARGET_BYTES) {
    let workingCanvas = sourceCanvas;
    let best = null;
    const jpegQualities = [0.9, 0.86, 0.8, 0.74, 0.68, 0.62, 0.56, 0.5, 0.46];

    for (let resizeAttempt = 0; resizeAttempt < 10; resizeAttempt += 1) {
      for (const quality of jpegQualities) {
        const imageDataUrl = encodeCanvas(workingCanvas, "image/jpeg", quality);
        const processedBytes = canvasDataUrlByteLength(imageDataUrl);
        const result = {
          imageDataUrl,
          processedBytes,
          processedWidth: workingCanvas.width,
          processedHeight: workingCanvas.height,
          processedMimeType: "image/jpeg"
        };
        if (!best || processedBytes < best.processedBytes) best = result;
        if (processedBytes <= targetBytes) return result;
      }

      if (Math.max(workingCanvas.width, workingCanvas.height) <= 640) break;
      workingCanvas = resizeCanvas(workingCanvas, 0.86);
    }

    return best;
  }

  function booleanRuns(mask) {
    const runs = [];
    let start = -1;
    for (let index = 0; index < mask.length; index += 1) {
      if (mask[index] && start < 0) {
        start = index;
      } else if (!mask[index] && start >= 0) {
        runs.push({ start, end: index - 1 });
        start = -1;
      }
    }
    if (start >= 0) runs.push({ start, end: mask.length - 1 });
    return runs;
  }

  function mergeRuns(runs, maxGap) {
    const merged = [];
    for (const run of runs) {
      const last = merged[merged.length - 1];
      if (!last || run.start - last.end > maxGap) {
        merged.push({ ...run });
      } else {
        last.end = Math.max(last.end, run.end);
      }
    }
    return merged;
  }

  function detectGeminiScorecardRoiBoxes(sourceCanvas) {
    if (!sourceCanvas || sourceCanvas.height < sourceCanvas.width * 1.25) return [];
    const width = sourceCanvas.width;
    const height = sourceCanvas.height;
    if (width < 500 || height < 900) return [];
    try {
      const ctx = sourceCanvas.getContext("2d", { willReadFrequently: true });
      const { data } = ctx.getImageData(0, 0, width, height);
      const yellow = new Uint8Array(width * height);
      const rowCounts = new Uint16Array(height);
      for (let y = 0; y < height; y += 1) {
        let rowCount = 0;
        for (let x = 0; x < width; x += 1) {
          const offset = (y * width + x) * 4;
          const r = data[offset];
          const g = data[offset + 1];
          const b = data[offset + 2];
          const warmYellow = r > 145
            && g > 120
            && b < 125
            && ((r + g) / 2) - b > 50
            && Math.abs(r - g) < 100;
          if (warmYellow) {
            yellow[y * width + x] = 1;
            rowCount += 1;
          }
        }
        rowCounts[y] = rowCount;
      }

      const rowThreshold = Math.max(18, Math.round(width * 0.035));
      const rowMask = Array.from(rowCounts, count => count > rowThreshold);
      const rawBands = booleanRuns(rowMask);
      const bands = [];
      for (const run of mergeRuns(rawBands, Math.max(8, Math.round(height / 160)))) {
        const bandHeight = run.end - run.start + 1;
        if (bandHeight < Math.max(8, Math.round(height / 220))) continue;
        const colCounts = new Uint16Array(width);
        for (let y = run.start; y <= run.end; y += 1) {
          const rowOffset = y * width;
          for (let x = 0; x < width; x += 1) {
            if (yellow[rowOffset + x]) colCounts[x] += 1;
          }
        }
        const colThreshold = Math.max(2, Math.round(bandHeight * 0.08));
        const xs = [];
        for (let x = 0; x < width; x += 1) {
          if (colCounts[x] > colThreshold) xs.push(x);
        }
        if (!xs.length) continue;
        const x1 = xs[0];
        const x2 = xs[xs.length - 1];
        const bandWidth = x2 - x1 + 1;
        if (bandWidth < width * 0.09) continue;
        bands.push({
          x1,
          x2,
          y1: run.start,
          y2: run.end,
          cy: (run.start + run.end) / 2,
          area: bandWidth * bandHeight
        });
      }

      const dedupedBands = [];
      for (const band of bands.sort((a, b) => a.cy - b.cy)) {
        const last = dedupedBands[dedupedBands.length - 1];
        if (last && Math.abs(band.cy - last.cy) < height * 0.06) {
          if (band.area > last.area) dedupedBands[dedupedBands.length - 1] = band;
        } else {
          dedupedBands.push(band);
        }
      }
      if (dedupedBands.length < 2) return [];

      const gaps = [];
      for (let index = 0; index < dedupedBands.length - 1; index += 1) {
        gaps.push(dedupedBands[index + 1].cy - dedupedBands[index].cy);
      }
      const boxes = [];
      for (let index = 0; index < dedupedBands.length; index += 1) {
        const band = dedupedBands[index];
        const prevGap = index > 0 ? band.cy - dedupedBands[index - 1].cy : (gaps[0] || height * 0.45);
        const nextGap = index + 1 < dedupedBands.length ? dedupedBands[index + 1].cy - band.cy : (gaps[gaps.length - 1] || height * 0.45);
        const y = Math.max(0, Math.round(band.cy - prevGap * 0.65));
        const bottom = Math.min(height, Math.round(band.cy + nextGap * (index + 1 < dedupedBands.length ? 0.75 : 0.85)));
        const bandWidth = band.x2 - band.x1 + 1;
        const right = Math.min(width, Math.round(band.x2 + Math.max(width * 0.08, bandWidth * 0.36)));
        if (bottom - y < 300 || right < width * 0.45) continue;
        boxes.push({
          x: 0,
          y,
          width: right,
          height: bottom - y,
          label: `scorecard-roi-${boxes.length + 1}`
        });
      }
      return boxes.length >= 2 ? boxes.slice(0, GEMINI_SCORECARD_MAX_DETAIL_IMAGES) : [];
    } catch (err) {
      console.warn("[LB OCR] Gemini scorecard ROI detection skipped:", err);
      return [];
    }
  }

  function buildGeminiScorecardDetailImages(sourceCanvas) {
    if (!sourceCanvas) return [];
    const portrait = sourceCanvas.height >= sourceCanvas.width * 1.35;
    const landscape = sourceCanvas.width >= sourceCanvas.height * 1.35;
    if (!portrait && !landscape) return [];
    const env = window.ENV || {};
    const roiFlag = cleanText(env.OCR_GEMINI_ROI_CROPS || env.GEMINI_SCORECARD_ROI_CROPS).toLowerCase();
    const roiBoxes = ["1", "true", "yes", "on"].includes(roiFlag)
      ? detectGeminiScorecardRoiBoxes(sourceCanvas)
      : [];
    const cropWidth = portrait ? sourceCanvas.width : Math.round(sourceCanvas.width * 0.55);
    const cropHeight = portrait ? Math.round(sourceCanvas.height / 3) : sourceCanvas.height;
    if (!roiBoxes.length && (cropWidth < 360 || cropHeight < 300)) return [];
    const cropBoxes = roiBoxes.length
      ? roiBoxes
      : portrait
      ? [0, 1, 2].map(index => ({
        x: 0,
        y: Math.round(sourceCanvas.height * index / 3),
        width: cropWidth,
        height: Math.round(sourceCanvas.height * (index + 1) / 3) - Math.round(sourceCanvas.height * index / 3),
        label: `portrait-third-${index + 1}`
      }))
      : [0, Math.max(0, sourceCanvas.width - cropWidth)].map(x => ({
        x,
        y: 0,
        width: cropWidth,
        height: cropHeight,
        label: x ? "landscape-right" : "landscape-left"
      }));
    const detailImages = [];
    for (const cropBox of cropBoxes.slice(0, GEMINI_SCORECARD_MAX_DETAIL_IMAGES)) {
      const detailCanvas = document.createElement("canvas");
      detailCanvas.width = cropBox.width;
      detailCanvas.height = cropBox.height;
      const detailCtx = detailCanvas.getContext("2d");
      detailCtx.fillStyle = "#ffffff";
      detailCtx.fillRect(0, 0, detailCanvas.width, detailCanvas.height);
      detailCtx.drawImage(
        sourceCanvas,
        cropBox.x,
        cropBox.y,
        cropBox.width,
        cropBox.height,
        0,
        0,
        detailCanvas.width,
        detailCanvas.height
      );
      const compressed = compressCanvasForGemini(detailCanvas, GEMINI_SCORECARD_DETAIL_TARGET_BYTES);
      if (!compressed?.imageDataUrl || compressed.processedBytes > GEMINI_SCORECARD_MAX_BYTES) continue;
      detailImages.push({
        imageDataUrl: compressed.imageDataUrl,
        processedWidth: compressed.processedWidth,
        processedHeight: compressed.processedHeight,
        processedBytes: compressed.processedBytes,
        cropLabel: cropBox.label || `detail-${detailImages.length + 1}`,
        cropBox: {
          x: cropBox.x,
          y: cropBox.y,
          width: cropBox.width,
          height: cropBox.height
        }
      });
    }
    return detailImages;
  }

  function shouldAttachGeminiScorecardDetailImages(sourceCanvas) {
    const value = cleanText(window.ENV?.OCR_GEMINI_DETAIL_CROPS).toLowerCase();
    if (value === "0" || value === "false" || value === "off") return false;
    if (value === "1" || value === "true" || value === "on") return true;
    return !!sourceCanvas && sourceCanvas.height >= sourceCanvas.width * 1.35;
  }

  function rotateCanvas(sourceCanvas, degrees) {
    const radians = (degrees * Math.PI) / 180;
    const swap = degrees === 90 || degrees === -90 || degrees === 270;
    const rotatedCanvas = document.createElement("canvas");
    rotatedCanvas.width = swap ? sourceCanvas.height : sourceCanvas.width;
    rotatedCanvas.height = swap ? sourceCanvas.width : sourceCanvas.height;
    const rotatedCtx = rotatedCanvas.getContext("2d");
    rotatedCtx.fillStyle = "#ffffff";
    rotatedCtx.fillRect(0, 0, rotatedCanvas.width, rotatedCanvas.height);
    rotatedCtx.translate(rotatedCanvas.width / 2, rotatedCanvas.height / 2);
    rotatedCtx.rotate(radians);
    rotatedCtx.drawImage(sourceCanvas, -sourceCanvas.width / 2, -sourceCanvas.height / 2);
    return rotatedCanvas;
  }

  function scoreCropBoxLandscape(cropBox) {
    if (!cropBox) return -1;
    return cropBox.width / Math.max(1, cropBox.height);
  }

  function autoRotateScorecardCanvas(canvas) {
    // Only attempt rotation when image is strongly portrait
    if (canvas.height < canvas.width * 1.3) return canvas;
    const originalCtx = canvas.getContext("2d", { willReadFrequently: true });
    const originalCrop = detectScorecardCropBox(originalCtx, canvas.width, canvas.height);
    const originalRatio = scoreCropBoxLandscape(originalCrop);
    // If original already has a landscape crop box, no rotation needed
    if (originalRatio > 1.2) return canvas;

    const cw = rotateCanvas(canvas, 90);
    const cwCtx = cw.getContext("2d", { willReadFrequently: true });
    const cwCrop = detectScorecardCropBox(cwCtx, cw.width, cw.height);
    const cwRatio = scoreCropBoxLandscape(cwCrop);

    const ccw = rotateCanvas(canvas, -90);
    const ccwCtx = ccw.getContext("2d", { willReadFrequently: true });
    const ccwCrop = detectScorecardCropBox(ccwCtx, ccw.width, ccw.height);
    const ccwRatio = scoreCropBoxLandscape(ccwCrop);

    // Pick rotation with best landscape crop; require it to beat original significantly
    const bestRotatedRatio = Math.max(cwRatio, ccwRatio);
    if (bestRotatedRatio <= originalRatio || bestRotatedRatio < 1.0) {
      // No rotation produced a better landscape crop — default to CW (most common phone hold)
      return cw;
    }
    return cwRatio >= ccwRatio ? cw : ccw;
  }

  async function preprocessGeminiScorecardImage(file) {
    if (!isSupportedGeminiScorecardImage(file)) {
      throw new Error("Gemini scorecard chỉ hỗ trợ ảnh PNG/JPG/JPEG. PDF hãy dùng PaddleOCR local.");
    }
    const image = await loadImageFile(file);
    const maxSide = Number(window.ENV?.OCR_MAX_IMAGE_SIDE) || 1800;
    const originalWidth = image.naturalWidth || image.width;
    const originalHeight = image.naturalHeight || image.height;
    const scale = Math.min(1, maxSide / Math.max(originalWidth, originalHeight));
    const width = Math.max(1, Math.round(originalWidth * scale));
    const height = Math.max(1, Math.round(originalHeight * scale));

    let canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, width, height);
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    ctx.filter = "contrast(1.16) brightness(1.04) saturate(0.88)";
    ctx.drawImage(image, 0, 0, width, height);

    // Auto-rotate portrait scorecards
    canvas = autoRotateScorecardCanvas(canvas);

    const cropCtx = canvas.getContext("2d", { willReadFrequently: true });
    const cropBox = detectScorecardCropBox(cropCtx, canvas.width, canvas.height);
    const outputCanvas = cropBox ? document.createElement("canvas") : canvas;
    if (cropBox) {
      outputCanvas.width = cropBox.width;
      outputCanvas.height = cropBox.height;
      const outputCtx = outputCanvas.getContext("2d");
      outputCtx.fillStyle = "#ffffff";
      outputCtx.fillRect(0, 0, cropBox.width, cropBox.height);
      outputCtx.drawImage(
        canvas,
        cropBox.x,
        cropBox.y,
        cropBox.width,
        cropBox.height,
        0,
        0,
        cropBox.width,
        cropBox.height
      );
    }

    const compressed = compressCanvasForGemini(outputCanvas);
    if (!compressed?.imageDataUrl) throw new Error("Không nén được ảnh scorecard để gửi Gemini.");
    if (compressed.processedBytes > GEMINI_SCORECARD_MAX_BYTES) {
      throw new Error(`Ảnh scorecard sau tiền xử lý vẫn vượt ${formatGeminiScorecardBytes(GEMINI_SCORECARD_MAX_BYTES)}. Vui lòng crop/chụp lại rõ hơn trước khi OCR.`);
    }

    return {
      imageDataUrl: compressed.imageDataUrl,
      fileName: file.name || "scorecard.jpg",
      processedWidth: compressed.processedWidth,
      processedHeight: compressed.processedHeight,
      originalWidth,
      originalHeight,
      originalBytes: file.size || 0,
      processedBytes: compressed.processedBytes,
      processedMimeType: compressed.processedMimeType,
      cropApplied: !!cropBox,
      detailImages: shouldAttachGeminiScorecardDetailImages(outputCanvas)
        ? buildGeminiScorecardDetailImages(outputCanvas)
        : []
    };
  }

  async function preprocessEditorCanvas(canvas, file) {
    const compressed = compressCanvasForGemini(canvas);
    if (!compressed?.imageDataUrl) throw new Error("Không nén được ảnh scorecard để gửi Gemini.");
    if (compressed.processedBytes > GEMINI_SCORECARD_MAX_BYTES) {
      throw new Error(`Ảnh scorecard sau tiền xử lý vẫn vượt ${formatGeminiScorecardBytes(GEMINI_SCORECARD_MAX_BYTES)}. Vui lòng crop/chụp lại rõ hơn trước khi OCR.`);
    }

    return {
      imageDataUrl: compressed.imageDataUrl,
      fileName: file.name || "scorecard.jpg",
      processedWidth: compressed.processedWidth,
      processedHeight: compressed.processedHeight,
      originalWidth: canvas.width,
      originalHeight: canvas.height,
      originalBytes: file.size || 0,
      processedBytes: compressed.processedBytes,
      processedMimeType: compressed.processedMimeType,
      cropApplied: true,
      detailImages: shouldAttachGeminiScorecardDetailImages(canvas)
        ? buildGeminiScorecardDetailImages(canvas)
        : []
    };
  }

  function buildDirectGeminiPrompt(context, images, importType = "scorecard") {
    const maxOpponents = context.maxOpponents || 4;
    return [
      "You are an expert Golf Scorecard and Livescore OCR specialist. Analyze each image carefully and return only valid JSON. No markdown.",
      `Requested import type: ${importType}.`,
      'Output object: {"scorecards":[...]} only.',
      'Return strict JSON: quote every string marker such as "x"; use null for unknown text fields; never emit bare x, NaN, or comments.',
      "Even though the response must be JSON only, do not skip reasoning: put a concise column/start-hole audit inside start_hole_reasoning immediately before start_hole for each scorecard.",
      "Create one scorecard object for every visible golfer scorecard, not just one object per photo.",
      "A single photo may contain 2, 3, 4, or more physical scorecards arranged top-to-bottom, overlapping, or in rows. Detect repeated Player's Name headers, repeated score grids, and repeated front/back panels.",
      "For tall multi-scorecard photos, supplemental detail crops may follow the main image. They are zoomed regions of the same source image: use them to verify digits, but never output duplicate scorecards.",
      "For folded Dalat Palace / NAM A BANK scorecards, the left panel is holes 1-9 and the right panel is holes 10-18 for the same golfer. Pair the two panels on the same horizontal card before moving to the next card below.",
      "Ignore course-rules sheets, QR codes, yardage rows, tee-color rows, printed PAR rows, stroke-index rows, signatures, and Out/In/Total summary columns as hole scores.",
      "Each scorecard object must include source_image_index, name, id_vga, handicap, gender, division, flight_group, start_hole_reasoning, start_hole, 9_front, 9_back, total, gross_scores, over_par_scores, cell_confidences, cell_warnings, uncertain_holes, and warnings.",
      "Infer gender only when unambiguous from title/name, for example Mr=male, Miss/Ms/Mrs=female, Vietnamese middle name Văn=male or Thị=female. Leave gender blank when ambiguous.",
      "Before extracting scores, lock an 18-column grid to the printed hole-number headers: H1-H9, skip Out, H10-H18, skip In/Total. Summary columns are not holes.",
      'gross_scores must be an array of exactly 18 items for holes 1-18. Use "x" for empty, hidden, unplayed, or uncertain cells. Never copy printed par values into blank score cells. CRITICAL: when a cell is difficult to read, always output "x" in that position. Never omit or skip a hole cell — every scorecard must have exactly 18 entries.',
      'over_par_scores must be an array of exactly 18 items for holes 1-18. Use "x" when blank or uncertain. Never omit or skip a hole cell.',
      'ROW IDENTIFICATION IS CRITICAL. Every golf scorecard template has PRINTED rows: Hole numbers, PAR values (3/4/5), Stroke Index, and sometimes yardage. These printed rows use the same font/color as the form headers. The golfer\'s HANDWRITTEN score rows are SEPARATE cells filled with ink by the golfer. PAR values are part of the pre-printed template — do NOT transcribe them into gross_scores. A blank score cell may show the printed par value nearby (in an adjacent header row) — this must NOT be copied into the score array; use "x" instead.',
      'DETECTING BLANK CELLS: Look for actual ink/pencil marks made by the golfer inside each score cell. If a cell shows only pre-printed lines and numbers (from the scorecard template) with no handwriting, it is blank — output "x". If you are unsure whether a digit is handwritten or printed, output "x" with low confidence. Never guess a score from a printed label.',
      'Columns: Ignore the pre-printed summary columns labeled Out, In, and Total. Extract scores strictly based on the physical alignment under the pre-printed hole numbers 1 through 18. If a column has no handwritten ink directly beneath its hole number (e.g., holes 5 through 11 are completely blank), you must output "x" for those specific holes. Do not shift scores to the left to fill empty columns.',
      'Critical alignment example: if holes 5 through 11 are blank and a handwritten gross 14 / over-par 10 is physically under printed H12, put those values at hole 12 and keep holes 5-11 as "x". Never move H12/H13 values left into H10/H11 to close a gap.',
      "Handwritten gross scores are usually 3-9. Handwritten over-par/net rows often contain -1, 0, 1, 2, etc. If rows conflict, prefer the row that looks like gross golf scores and add a warning.",
      "When a scorecard has two handwritten rows and one row contains mostly 0/1/2/-1 values while the other row contains 3-9 values, gross_scores must come from the 3-9 row and over_par_scores must come from the small-number row.",
      "Circles, squares, and triangles around handwritten scores are visual markers, not digits. Read the number inside/next to the marker; a triangle often marks birdie/-1 in over_par_scores but gross_scores still stores the gross stroke number.",
      "cell_confidences must contain exactly 18 numbers from 0 to 1. Use <=0.60 when a circle/triangle/square obscures a digit or column mapping is uncertain; use 1 for a clearly empty cell.",
      "cell_warnings must contain exactly 18 strings and uncertain_holes must list every hole whose marked digit or column mapping needs human confirmation.",
      "Out, In, Total, and subtotal columns can appear before holes, between hole groups, or after holes. Map hole scores by the printed hole-number header and never shift hole values into a summary column.",
      "Do not transcribe Out, In, or Total values into the hole arrays. Use visible totals only to verify sums and add warnings when sums conflict.",
      '9_front is numeric only when all holes 1-9 are known; otherwise "x". 9_back is the same for holes 10-18. total is numeric only when all 18 gross cells are known.',
      'Start Hole Logic: Do not default to Hole 1. A golfer may start on any hole. Complete this audit inside start_hole_reasoning before choosing start_hole: (1) list scored_holes in printed-hole order, (2) identify the longest continuous empty gap on the circular 1-18 course, including wrap-around gaps, and (3) set start_hole to the first scored hole immediately after that gap. Example: scored holes 1-4 and 12-18 mean empty gap 5-11, so start_hole is 12. If all 18 holes are filled and no printed start hole is visible, use 1 with reasoning "full 18 holes". If the evidence is ambiguous, set start_hole to null and explain why.',
      `Return at most ${maxOpponents} scorecards.`,
      `Import constraints JSON: ${JSON.stringify({maxOpponents, allowFlightJump: context.allowFlightJump, fixedDivisionName: context.fixedDivisionName, divisions: context.divisions})}`,
      `Course holes JSON: ${JSON.stringify(context.holes || [])}`
    ].join("\n");
  }

  async function runGeminiScorecardOcr(files, options = {}) {
    const fileList = Array.from(files || []);
    if (!fileList.length) throw new Error("Chưa chọn file import.");
    const images = [];
    for (let i = 0; i < fileList.length; i++) {
      const file = fileList[i];
      const editorState = options.editorStates?.[i];
      let image;
      if (editorState && window.LB.ScorecardEditor) {
          const div = document.createElement('div');
          const editor = new window.LB.ScorecardEditor(div);
          await editor.loadFile(file);
          editor.setState(editorState);
          const outCanvas = editor.exportPayload();
          image = await preprocessEditorCanvas(outCanvas, file);
      } else {
          image = await preprocessGeminiScorecardImage(file);
      }
      image.sourceImageIndex = images.length + 1;
      images.push(image);
    }

    const endpoint = deriveGeminiScorecardEndpoint();
    const isCloudMode = endpoint.startsWith("/api/");
    const localApiKey = document.getElementById("settings-gemini-key")?.value || localStorage.getItem("lb_gemini_api_key");

    if (!isCloudMode && localApiKey) {
      const model = normalizeGeminiScorecardModel(document.getElementById("settings-gemini-model")?.value);
      const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(localApiKey)}`;
      
      const promptText = buildDirectGeminiPrompt(options.context || {}, images, "scorecard");
      const parts = [{ text: promptText }];
      
      images.forEach(img => {
        parts.push({
          inline_data: {
            mime_type: img.processedMimeType || "image/jpeg",
            data: img.imageDataUrl.split(",")[1]
          }
        });
        if (img.detailImages) {
          img.detailImages.forEach(detail => {
            parts.push({
              inline_data: {
                mime_type: detail.processedMimeType || "image/jpeg",
                data: detail.imageDataUrl.split(",")[1]
              }
            });
          });
        }
      });
      
      const contents = [{ role: "user", parts }];

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 15000);

      const response = await fetch(apiUrl, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ contents }),
        signal: controller.signal
      }).catch(err => {
        if (err.name === 'AbortError') {
          throw new Error(normalizeGeminiScorecardError({ status: 503 }));
        }
        throw err;
      }).finally(() => {
        clearTimeout(timeoutId);
      });
      
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        if (response.status === 503 || response.status === 504) {
          throw new Error(normalizeGeminiScorecardError({ status: 503 }));
        }
        throw new Error(data.error?.message || "Lỗi Google Gemini API");
      }
      try {
        const text = data.candidates?.[0]?.content?.parts?.[0]?.text || "";
        const jsonStr = text.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();
        
        let parsed;
        try {
          parsed = JSON.parse(jsonStr);
        } catch (error) {
          if (!(error instanceof SyntaxError)) throw error;
          let repaired = jsonStr;
          for (let index = 0; index < 4; index += 1) {
            const next = repaired.replace(/([\[,]\s*)x(\s*[\],])/gi, '$1"x"$2');
            if (next === repaired) break;
            repaired = next;
          }
          parsed = JSON.parse(repaired);
        }

        let scorecards = Array.isArray(parsed) 
          ? parsed 
          : (parsed.scorecards || parsed.scorecard || parsed.players || parsed.golfers || parsed.opponents);
          
        if (!scorecards || !Array.isArray(scorecards)) {
          if (parsed && (parsed.gross_scores || parsed.grossScores || parsed.name || parsed.cells)) {
            scorecards = [parsed];
          } else {
            scorecards = [];
          }
        }
          
        return {
          ok: true,
          scorecards: scorecards,
          raw: data
        };
      } catch (err) {
        throw new Error("Không thể đọc được kết quả từ Google API: " + err.message);
      }
    }

    const accessToken = await window.LB.runtimeAdapter?.getAccessToken?.();
    const headers = { "content-type": "application/json" };
    if (accessToken) headers.Authorization = `Bearer ${accessToken}`;
    
    if (!isCloudMode && !localApiKey) {
      try {
        const check = await fetch(endpoint, { method: "OPTIONS" }).catch(() => null);
        if (!check) {
          throw new Error("Không thể kết nối đến server Python local (OCR service offline) và trình duyệt cũng không tìm thấy API Key nội bộ. Vui lòng vào Cài đặt, nhập Gemini API Key và lưu lại để chạy trực tiếp trên trình duyệt.");
        }
      } catch (err) {
        throw new Error(err.message || "Lỗi kết nối OCR service.");
      }
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 15000);

    const response = await fetch(endpoint, {
      method: "POST",
      headers,
      body: JSON.stringify({
        importType: "scorecard",
        provider: "gemini_api",
        images,
        context: { ...(options.context || {}), isLeaderboard: true }
      }),
      signal: controller.signal
    }).catch(err => {
      if (err.name === 'AbortError') throw new Error(normalizeGeminiScorecardError({ status: 503 }));
      throw new Error(`Kết nối đến local server thất bại (${err.message}). Hãy nhập Gemini API key vào Cài đặt để chạy không cần server.`);
    }).finally(() => clearTimeout(timeoutId));
    
    const payload = await response.json().catch(() => ({}));
    if (!response.ok || payload.ok === false) {
      if (response.status === 503 || response.status === 504) throw new Error(normalizeGeminiScorecardError({ status: 503 }));
      throw new Error(normalizeGeminiScorecardError(payload, response));
    }
    return payload;
  }

  async function runOcr(files, provider, options = {}) {
    const env = window.ENV || {};
    if (!files?.length) throw new Error("Chưa chọn file import.");

    if (provider === "gemini_api") {
      return runGeminiScorecardOcr(files, options);
    }

    if (provider === "paddle_local") {
      if (!env.LOCAL_OCR_ENDPOINT) throw new Error("Chưa cấu hình LOCAL_OCR_ENDPOINT.");
      const body = new FormData();
      Array.from(files).forEach(file => body.append("images", file));
      body.append("task", options.task || "scorecards");
      if (options.context) body.append("context", JSON.stringify(options.context));
      const response = await fetch(env.LOCAL_OCR_ENDPOINT, { method: "POST", body });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.message || payload.error || `PaddleOCR endpoint lỗi ${response.status}`);
      return payload;
    }

    if (provider === "google_ai_studio") {
      if (!env.GOOGLE_AI_STUDIO_ENDPOINT) throw new Error("Chưa cấu hình GOOGLE_AI_STUDIO_ENDPOINT.");
      const body = new FormData();
      Array.from(files).forEach(file => body.append("images", file));
      body.append("task", options.task || "scorecards");
      if (options.context) body.append("context", JSON.stringify(options.context));
      const accessToken = await window.LB.runtimeAdapter?.getAccessToken?.();
      const response = await fetch(env.GOOGLE_AI_STUDIO_ENDPOINT, {
        method: "POST",
        headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : undefined,
        body
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        const errorCode = payload.message || payload.error || "";
        const friendlyErrors = {
          operator_auth_required: "Vui lòng đăng nhập lại Mode 3 trước khi import.",
          operator_auth_invalid: "Phiên đăng nhập Mode 3 không còn hợp lệ.",
          operator_session_revoked: "Phiên đăng nhập Mode 3 đã bị thu hồi. Vui lòng đăng nhập lại.",
          operator_assignment_not_found: "Tài khoản chưa được gán quyền điều hành giải này.",
          operator_tournament_not_active: "Giải Mode 3 không còn ở trạng thái hoạt động.",
          roster_file_required: "Chưa chọn file Excel hoặc CSV.",
          too_many_roster_files: "Chỉ được import tối đa 4 file mỗi lần.",
          roster_file_too_large: "Mỗi file import phải nhỏ hơn 8 MB.",
          roster_file_type_not_supported: "Mode 3 chỉ hỗ trợ XLSX, XLSM, CSV và TSV.",
          roster_name_column_not_found: "Không tìm thấy cột tên golfer trong file."
        };
        throw new Error(friendlyErrors[errorCode] || errorCode || `Dịch vụ import cloud lỗi ${response.status}`);
      }
      return payload;
    }

    throw new Error("Provider OCR chưa được hỗ trợ.");
  }

  function resolveFlightName(handicap, gender = "") {
    const cfg = window.LB.state.flightConfig || {};
    const hcp = Number(handicap);
    const genderMode = cfg.genderMode || "combined";
    const playerGender = gender || "";
    const flights = (Array.isArray(cfg.flights) ? cfg.flights : []).filter(flight => {
      if (genderMode !== "separate") return !flight.gender || flight.gender === "mixed";
      return flight.gender === playerGender || (!playerGender && flight.gender !== "mixed");
    });
    const matched = flights.find(flight => Number.isFinite(hcp) && hcp >= Number(flight.min) && hcp <= Number(flight.max));
    return matched?.name || flights[0]?.name || "";
  }

  function getPlayerDivision(player = {}) {
    return player.division || player.flight || "";
  }

  function hasConfiguredGenderDivisions(gender = "") {
    const cfg = window.LB.state.flightConfig || {};
    const normalizedGender = normalizeGender(gender);
    if ((cfg.genderMode || "combined") !== "separate" || !normalizedGender) return false;
    return (Array.isArray(cfg.flights) ? cfg.flights : []).some(flight => normalizeGender(flight.gender) === normalizedGender);
  }

  function resolveRosterDivision(row = {}, player = null) {
    const gender = row.gender || player?.gender || "";
    const handicap = row.courseHandicap !== "" && row.courseHandicap !== undefined
      ? row.courseHandicap
      : (row.handicap === "" || row.handicap === undefined
        ? (player?.courseHandicap ?? player?.handicap ?? "")
        : row.handicap);
    const rawExplicitDivision = row.importedDivision || row.division || row.flight || "";
    const resolution = resolveConfiguredDivision(
      rawExplicitDivision,
      gender,
      handicap,
      row.importedScoringMode || row.scoringMode || ""
    );
    row.divisionMappingReason = resolution.reason;
    row.divisionMappingAmbiguous = resolution.ambiguous;
    if (resolution.ambiguous) {
      const warning = "Không đủ dữ liệu để phân biệt nhánh S36/WHS; hãy kiểm tra bảng đấu đã suy luận theo Course Handicap.";
      row.warnings = Array.isArray(row.warnings) ? row.warnings : [];
      if (!row.warnings.includes(warning)) row.warnings.push(warning);
    }
    const explicitDivision = resolution.name;
    if (explicitDivision) return explicitDivision;
    if (!explicitDivision && hasConfiguredGenderDivisions(gender) && hasNumeric(handicap)) {
      return resolveFlightName(handicap, gender) || getPlayerDivision(player);
    }
    return explicitDivision || getPlayerDivision(player) || (hasNumeric(handicap) ? resolveFlightName(handicap, gender) : "");
  }

  function stampResolvedDivision(row = {}, division = "") {
    const importedDivision = cleanText(row.division || row.flight || "");
    if (importedDivision && division && divisionKey(importedDivision) !== divisionKey(division)) {
      row.importedDivision = row.importedDivision || importedDivision;
    }
    if (division) {
      row.division = division;
      row.flight = division;
    }
    return division;
  }

  function applyImportedReviewState(player = {}, row = {}, division = "") {
    const needsVgaReview = !normalizeVgaId(row.vgaId || "");
    const needsIndexReview = !hasNumeric(row.handicapIndex);
    const needsCourseHandicapReview = !hasNumeric(row.courseHandicap);
    player.divisionNeedsReview = !!row.divisionMappingAmbiguous || !division;
    player.divisionReviewReason = row.divisionMappingReason || "";
    player.vgaNeedsReview = needsVgaReview;
    player.handicapIndexNeedsReview = needsIndexReview;
    player.courseHandicapNeedsReview = needsCourseHandicapReview;
    player.profileReviewConfirmed = !(needsVgaReview || needsIndexReview || needsCourseHandicapReview);
    player.importReviewSource = "spreadsheet";
    return player;
  }

  function nextClubGolferId() {
    const state = window.LB.state;
    const used = new Set((state.players || []).map(player => cleanText(player.golferId || player.vgaId || "").toUpperCase()));
    const existingMax = (state.players || []).reduce((max, player) => {
      const match = cleanText(player.golferId || player.vgaId || "").toUpperCase().match(/^CLW(\d{4,})$/);
      return match ? Math.max(max, Number(match[1])) : max;
    }, 0);
    let next = Math.max(Number(state.identity?.clwNext || 1), existingMax + 1);
    let candidate = `CLW${String(next).padStart(4, "0")}`;
    while (used.has(candidate)) {
      next += 1;
      candidate = `CLW${String(next).padStart(4, "0")}`;
    }
    state.identity = { ...(state.identity || {}), clwNext: next + 1 };
    return candidate;
  }

  function ensurePlayerIdentity(player) {
    if (!player) return "";
    const normalizedVga = normalizeVgaId(player.vgaId || "");
    if (normalizedVga && !/^CLW\d{4,}$/i.test(normalizedVga)) {
      player.vgaId = normalizedVga;
      player.golferId = normalizedVga;
      return player.golferId;
    }
    const existingClubId = normalizeVgaId(player.golferId || player.vgaId || "");
    if (/^CLW\d{4,}$/i.test(existingClubId)) {
      player.vgaId = "";
      player.golferId = existingClubId;
      return player.golferId;
    }
    player.vgaId = "";
    player.golferId = nextClubGolferId();
    return player.golferId;
  }

  async function applyOcrRowsToState(rows, options = {}) {
    const state = window.LB.state;
    const added = [];

    for (const row of rows) {
      const rowGolferId = normalizeVgaId(row.vgaId || "");
      const flightGroup = normalizeFlightGroupLabel(row.flightGroup || row.group || "", row.startHole || "");
      const startHole = getStartHoleFromFlightGroup(flightGroup, row.startHole || row.flightGroup || row.group || "");
      const hadExplicitDivision = !!cleanText(row.division || row.flight || "");
      let player = state.players.find(item => {
        ensurePlayerIdentity(item);
        const sameVga = rowGolferId && [item.vgaId, item.golferId].some(value => normalizeVgaId(value) === rowGolferId);
        const sameName = item.name.trim().toLowerCase() === row.name.trim().toLowerCase();
        return sameVga || sameName;
      });

      if (!player && typeof options.onIdentityMismatch === 'function') {
        const tempDivision = stampResolvedDivision(row, resolveRosterDivision(row));
        const action = await options.onIdentityMismatch(row, tempDivision, state.players);
        if (action === "SKIP") continue;
        if (action !== "NEW") {
          player = state.players.find(p => p.id === action);
        }
      }

      if (!player) {
        const division = stampResolvedDivision(row, resolveRosterDivision(row));
        player = {
          id: `p-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
          name: row.name,
          handicap: hasNumeric(row.handicap) ? Number(row.handicap) : "",
          courseHandicap: hasNumeric(row.courseHandicap) ? Number(row.courseHandicap) : "",
          handicapIndex: row.handicapIndex ?? "",
          handicapSource: row.handicapSource || "",
          courseHandicapLocked: !!row.courseHandicapLocked,
          gender: row.gender || "",
          division,
          flight: division,
          divisionSource: hadExplicitDivision ? "import" : "auto",
          flightGroup,
          group: flightGroup,
          vgaId: rowGolferId || "",
          golferId: rowGolferId || "",
          startHole,
          caddyNumber: row.caddyNumber || "",
          awardEligible: row.awardEligible !== false,
          operationNote: row.operationNote || "",
          status: "active"
        };
        applyImportedReviewState(player, row, division);
        ensurePlayerIdentity(player);
        state.players.push(player);
        state.scores[player.id] = {};
        added.push(player.name);
      } else {
        const division = stampResolvedDivision(row, resolveRosterDivision(row, player));
        player.vgaId = rowGolferId || player.vgaId || "";
        ensurePlayerIdentity(player);
        player.startHole = startHole || player.startHole || "";
        player.handicap = row.handicap === "" ? player.handicap : row.handicap;
        player.courseHandicap = row.courseHandicap === "" ? (player.courseHandicap ?? player.handicap) : row.courseHandicap;
        player.handicapIndex = row.handicapIndex ?? player.handicapIndex ?? "";
        player.handicapSource = row.handicapSource || player.handicapSource || "";
        player.courseHandicapLocked = row.courseHandicapLocked !== undefined ? !!row.courseHandicapLocked : !!player.courseHandicapLocked;
        player.gender = row.gender || player.gender || "";
        player.division = division;
        player.flight = division;
        player.divisionSource = hadExplicitDivision ? "import" : (player.divisionSource || "auto");
        player.flightGroup = flightGroup || player.flightGroup || "";
        player.group = flightGroup || player.group || "";
        player.caddyNumber = row.caddyNumber || player.caddyNumber || "";
        player.awardEligible = row.awardEligible !== undefined ? row.awardEligible : player.awardEligible;
        player.operationNote = row.operationNote || player.operationNote || "";
        applyImportedReviewState(player, row, division);
      }

      Object.entries(row.grossScores).forEach(([hole, gross]) => {
        if (!state.scores[player.id]) state.scores[player.id] = {};
        const previous = state.scores[player.id][hole] || {};
        const incomingGross = Number(gross);
        const confirmedGross = Number(previous.confirmedGross);
        const hasConfirmed = Number.isFinite(confirmedGross) && confirmedGross > 0;
        const hasUserGross = previous.userGross && Number(previous.userGross) > 0;
        state.scores[player.id][hole] = {
          ...previous,
          operatorGross: gross,
          source: "ocr",
          ocrPending: !hasConfirmed || confirmedGross !== incomingGross,
          updatedAt: new Date().toISOString(),
          conflictStatus: hasUserGross && Number(previous.userGross) !== incomingGross ? "conflict" : "operator_pending"
        };
      });
    }

    return added;
  }

  function applyParticipantsToState(rows) {
    const state = window.LB.state;
    const result = { added: [], updated: [] };

    rows.forEach(row => {
      const normalizedName = row.name.trim().toLowerCase();
      const rowGolferId = normalizeVgaId(row.vgaId || "");
      const flightGroup = normalizeFlightGroupLabel(row.flightGroup || row.group || "", row.startHole || "");
      const startHole = getStartHoleFromFlightGroup(flightGroup, row.startHole || row.flightGroup || row.group || "");
      const hadExplicitDivision = !!cleanText(row.division || row.flight || "");
      const player = state.players.find(item => {
        ensurePlayerIdentity(item);
        const sameVga = rowGolferId && [item.vgaId, item.golferId].some(value => normalizeVgaId(value) === rowGolferId);
        const sameName = item.name.trim().toLowerCase() === normalizedName;
        return sameVga || sameName;
      });
      const handicap = hasNumeric(row.handicap) ? Number(row.handicap) : "";
      const division = stampResolvedDivision(row, resolveRosterDivision(row, player || { handicap, gender: row.gender }));

      if (player) {
        player.name = row.name || player.name;
        player.vgaId = rowGolferId || player.vgaId || "";
        ensurePlayerIdentity(player);
        if (hasNumeric(handicap)) player.handicap = handicap;
        if (hasNumeric(row.courseHandicap)) player.courseHandicap = Number(row.courseHandicap);
        player.handicapIndex = row.handicapIndex ?? "";
        player.handicapSource = row.handicapSource || "";
        player.courseHandicapLocked = !!row.courseHandicapLocked;
        player.gender = row.gender || player.gender || "";
        player.division = division;
        player.flight = division;
        player.divisionSource = hadExplicitDivision ? "import" : (player.divisionSource || "auto");
        player.startHole = startHole || player.startHole || "";
        player.flightGroup = flightGroup || player.flightGroup || "";
        player.group = flightGroup || player.group || "";
        player.caddyNumber = row.caddyNumber || player.caddyNumber || "";
        player.awardEligible = row.awardEligible !== undefined ? row.awardEligible : player.awardEligible;
        player.operationNote = row.operationNote || player.operationNote || "";
        applyImportedReviewState(player, row, division);
        result.updated.push(player.name);
        return;
      }

      const id = `p-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
      const playerRecord = {
        id,
        name: row.name,
        handicap,
        courseHandicap: hasNumeric(row.courseHandicap) ? Number(row.courseHandicap) : "",
        handicapIndex: row.handicapIndex ?? "",
        handicapSource: row.handicapSource || "",
        courseHandicapLocked: !!row.courseHandicapLocked,
        gender: row.gender || "",
        division,
        flight: division,
        divisionSource: hadExplicitDivision ? "import" : "auto",
        flightGroup,
        vgaId: rowGolferId || "",
        golferId: rowGolferId || "",
        startHole,
        group: flightGroup,
        caddyNumber: row.caddyNumber || "",
        awardEligible: row.awardEligible !== false,
        operationNote: row.operationNote || "",
        status: "active"
      };
      applyImportedReviewState(playerRecord, row, division);
      ensurePlayerIdentity(playerRecord);
      state.players.push(playerRecord);
      state.scores[id] = {};
      result.added.push(row.name);
    });

    return result;
  }

  window.LB.ocr = {
    normalizeScorecards,
    normalizeParticipants,
    normalizeVgaId,
    looksLikeDivision,
    getPlayerDivision,
    resolveConfiguredDivisionName,
    resolveRosterDivision,
    ensurePlayerIdentity,
    detectScorecardCropBox,
    runOcr,
    applyOcrRowsToState,
    applyParticipantsToState,
    applySingleOcr: async (index) => {
      const rows = window.LB.lastOcrScorecards || [];
      const row = rows[index];
      if (!row) return;
      await applyOcrRowsToState([row], { 
        onIdentityMismatch: (unmatchedRow, suggestMatches) => {
          if (window.promptOcrIdentityMatch) {
             return window.promptOcrIdentityMatch(unmatchedRow, suggestMatches);
          }
          return null;
        } 
      });
      alert("Đã áp dụng điểm vào hệ thống.");
      window.LB.persistAndRender?.();
    },
    copyOcrFallback: (index) => {
      const rows = window.LB.lastOcrScorecards || [];
      const row = rows[index];
      if (!row) return;
      
      let scoreString = Array.from({ length: 18 }, (_, i) => {
        const score = row.grossScores?.[i + 1] ?? row.grossScores?.[String(i + 1)];
        return score !== undefined && score !== null && score !== "" ? score : "x";
      }).join(" ");
      scoreString = scoreString.replace(/^(x\s+)+/, "").replace(/(\s+x)+$/, "");
      
      const onSuccess = () => {
        window.LB.pendingPasteScores = scoreString.split(/[\s,]+/).map(s => String(s).trim().toLowerCase());
        alert("Đã copy chuỗi điểm: " + scoreString + "\n\nBấm vào một ô dưới bảng để dán (Ctrl-V hoặc chạm trên mobile).");
      };

      let success = false;
      try {
        const input = document.querySelector(`.ocr-score-string-fallback[data-index="${index}"]`);
        if (input) {
          input.select();
          input.setSelectionRange(0, 99999); // For mobile devices
          success = document.execCommand("copy");
        }
      } catch(e) {}

      if (success) {
        onSuccess();
      } else if (navigator.clipboard && window.isSecureContext) {
        navigator.clipboard.writeText(scoreString).then(onSuccess).catch(err => alert("Copy thất bại: " + err));
      } else {
        alert("Không thể copy tự động. Vui lòng copy thủ công chuỗi điểm: " + scoreString);
      }
    },
    findGolferForOcr: (index) => {
      const rows = window.LB.lastOcrScorecards || [];
      const row = rows[index];
      if (!row) return;
      
      const searchInput = document.getElementById("spreadsheet-search-input") || document.getElementById("search-input");
      if (searchInput) {
        searchInput.value = row.vgaId || row.name || "";
        searchInput.dispatchEvent(new Event('input', { bubbles: true }));
        // searchInput.scrollIntoView({ behavior: 'smooth', block: 'center' });
        
        // Highlight logic if possible
        setTimeout(() => {
            const firstRow = document.querySelector(".spreadsheet-table tbody tr:not([hidden])");
            if (firstRow) firstRow.style.backgroundColor = "var(--bg-hover)";
        }, 100);
      } else {
        alert("Không tìm thấy thanh công cụ tìm kiếm.");
      }
    }
  };
})();
