window.LB = window.LB || {};
window.LB.appFinal = (function() {
  const state = () => window.LB.state;

function getFinalResultsState() {
    const current = state().finalResults || {};
    state().finalResults = {
      status: current.status === "published" ? "published" : "draft",
      publishedAt: current.publishedAt || "",
      rankingScope: current.rankingScope === "gender" ? "gender" : "division",
      netCutLimit: normalizeFinalNetCutLimit(current.netCutLimit),
      excludedPlayerIds: Array.isArray(current.excludedPlayerIds) ? current.excludedPlayerIds : [],
      technicalGenderMode: current.technicalGenderMode === "separate" ? "separate" : "combined",
      technicalAwardCounts: {
        longestDrive: window.LB.appFinal.normalizeFinalTechnicalCount(current.technicalAwardCounts?.longestDrive),
        nearestToPin: window.LB.appFinal.normalizeFinalTechnicalCount(current.technicalAwardCounts?.nearestToPin),
        nearToTheLine: window.LB.appFinal.normalizeFinalTechnicalCount(current.technicalAwardCounts?.nearToTheLine),
        longestPutt: window.LB.appFinal.normalizeFinalTechnicalCount(current.technicalAwardCounts?.longestPutt)
      },
      longestDrive: Array.isArray(current.longestDrive) ? current.longestDrive : [],
      nearestToPin: Array.isArray(current.nearestToPin) ? current.nearestToPin : [],
      nearToTheLine: Array.isArray(current.nearToTheLine) ? current.nearToTheLine : [],
      longestPutt: Array.isArray(current.longestPutt) ? current.longestPutt : [],
      holeInOneCount: window.LB.appFinal.normalizeHoleInOneCount(current.holeInOneCount),
      holeInOneAwards: Array.isArray(current.holeInOneAwards) ? current.holeInOneAwards : [],
      specialAwards: Array.isArray(current.specialAwards) ? current.specialAwards : [],
      publishedSnapshot: current.publishedSnapshot || null
    };
    return state().finalResults;
  }

function markFinalResultsDraft() {
    const finalResults = window.LB.appFinal.getFinalResultsState();
    finalResults.status = "draft";
    finalResults.publishedAt = "";
  }

function invalidatePublishedFinalResults() {
    if (window.LB.appFinal.getFinalResultsState().status === "published") window.LB.appFinal.markFinalResultsDraft();
  }

function getFinalAwardRows() {
    return window.LB.scoring.buildLeaderboard(state());
  }

function getFinalCompletion(rows = window.LB.appFinal.getFinalAwardRows()) {
    const expectedHoles = state().course?.holes?.length || 18;
    const finalResults = window.LB.appFinal.getFinalResultsState();
    const excluded = new Set(finalResults.excludedPlayerIds);
    const total = rows.length;
    const completed = rows.filter(row => row.holesPlayed >= expectedHoles).length;
    const unresolvedRows = rows.filter(row => !excluded.has(row.playerId) && row.holesPlayed < expectedHoles);
    const eligibleCompleted = rows.filter(row => !excluded.has(row.playerId) && row.holesPlayed >= expectedHoles).length;
    return {
      expectedHoles,
      completed,
      total,
      isComplete: total > 0 && completed === total,
      excluded: excluded.size,
      unresolved: unresolvedRows.length,
      unresolvedRows,
      eligibleCompleted,
      isReady: unresolvedRows.length === 0 && eligibleCompleted > 0
    };
  }

function hasMixedFinalGenderScoringModes(rows = []) {
    const modesByGender = new Map();
    rows.forEach(row => {
      const gender = window.LB.appPlayer.normalizeGender(row.gender || "") || "unknown";
      if (!modesByGender.has(gender)) modesByGender.set(gender, new Set());
      modesByGender.get(gender).add(row.scoringMode || "handicap");
    });
    return Array.from(modesByGender.values()).some(modes => modes.size > 1);
  }

function getFinalGroupMeta(row, scope) {
    if (scope === "gender") {
      const gender = window.LB.appPlayer.normalizeGender(row.gender || "") || "unknown";
      return {
        key: `gender:${gender}`,
        label: gender === "male" ? "Nam" : (gender === "female" ? "Nữ" : "Chưa xác định"),
        scope: "gender"
      };
    }
    const division = window.LB.appPlayer.getPlayerDivision(row) || "Chưa có bảng";
    return { key: `division:${division}`, label: window.LB.appPlayer.formatDivisionLabel(division), scope: "division" };
  }

function formatFinalNetCutLabel(value) {
    const limit = normalizeFinalNetCutLimit(value);
    return limit === null ? "Không cắt âm" : `Cắt âm ${limit}`;
  }

function compareFinalNumber(left, right) {
    const leftNumber = Number(left);
    const rightNumber = Number(right);
    const leftMissing = left === null || left === undefined || !Number.isFinite(leftNumber);
    const rightMissing = right === null || right === undefined || !Number.isFinite(rightNumber);
    if (leftMissing && rightMissing) return 0;
    if (leftMissing) return 1;
    if (rightMissing) return -1;
    return leftNumber - rightNumber;
  }

function getFinalRawNetMetric(row = {}) {
    const metric = row.scoringMode === "system36" ? Number(row.system36Net) : Number(row.net);
    return Number.isFinite(metric) ? metric : null;
  }

function getFinalParPlayed(row = {}) {
    const gross = Number(row.gross);
    const toPar = Number(row.toPar);
    if (!Number.isFinite(gross) || !Number.isFinite(toPar)) return null;
    return gross - toPar;
  }

function applyFinalNetCut(row = {}, netCutLimit = null) {
    const limit = normalizeFinalNetCutLimit(netCutLimit);
    const rawNet = window.LB.appFinal.getFinalRawNetMetric(row);
    const parPlayed = window.LB.appFinal.getFinalParPlayed(row);
    const rawNetToPar = rawNet !== null && parPlayed !== null ? rawNet - parPlayed : null;
    const canCut = limit !== null
      && rawNet !== null
      && parPlayed !== null
      && rawNetToPar !== null
      && row.holesPlayed >= (state().course?.holes?.length || 18);
    const shouldCut = canCut && rawNetToPar < limit;
    const finalNet = shouldCut ? parPlayed + limit : rawNet;
    return {
      ...row,
      finalNet,
      finalNetToPar: shouldCut ? limit : rawNetToPar,
      finalRawNet: rawNet,
      finalRawNetToPar: rawNetToPar,
      finalNetCutLimit: limit,
      finalNetCutApplied: !!shouldCut
    };
  }

function compareFinalPlacementRows(left, right) {
    const finalMetricComparison = window.LB.appFinal.compareFinalNumber(left.finalNet, right.finalNet);
    if (finalMetricComparison !== 0) return finalMetricComparison;
    if (!left.finalNetCutApplied && !right.finalNetCutApplied) {
      return window.LB.scoring.compareLeaderboardRows(left, right, true);
    }

    if (left.scoringMode !== "system36" && right.scoringMode !== "system36" && left.scoringMode !== "stroke_gross" && right.scoringMode !== "stroke_gross") {
      const netCountback = window.LB.scoring.compareLeaderboardCountback(left, right, "holeNetScores");
      if (netCountback !== 0) return netCountback;
    }

    const grossComparison = window.LB.appFinal.compareFinalNumber(left.gross, right.gross);
    if (grossComparison !== 0) return grossComparison;

    const countbackComparison = window.LB.scoring.compareLeaderboardCountback(left, right, "holeScores");
    if (countbackComparison !== 0) return countbackComparison;

    return window.LB.scoring.compareLeaderboardRows(left, right, true);
  }

function buildFinalAwardComputation() {
    const finalResults = window.LB.appFinal.getFinalResultsState();
    const netCutLimit = normalizeFinalNetCutLimit(finalResults.netCutLimit);
    const allRows = window.LB.appFinal.getFinalAwardRows();
    const excluded = new Set(finalResults.excludedPlayerIds);
    const completeRows = allRows.filter(row => row.holesPlayed >= (state().course?.holes?.length || 18));
    const eligibleRows = completeRows.filter(row => !excluded.has(row.playerId));
    const rankingScope = finalResults.rankingScope === "gender" && !window.LB.appFinal.hasMixedFinalGenderScoringModes(eligibleRows)
      ? "gender"
      : "division";
    const cfg = state().flightConfig || {};
    const tournamentFormat = cfg.tournamentFormat || "mixed";
    const bestGrossAward = cfg.bestGrossAward || "yes";
    let eligibleForGross = [];

    if (tournamentFormat === "pro_gross") {
      eligibleForGross = eligibleRows;
    } else if (tournamentFormat === "net_only") {
      if (bestGrossAward === "yes") {
        eligibleForGross = eligibleRows;
      }
    } else if (tournamentFormat === "mixed") {
      if (bestGrossAward === "yes") {
        eligibleForGross = eligibleRows.filter(row => {
          const flightConfig = window.LB.appPlayer.getFlightConfigByName(row.division);
          return flightConfig?.scoringMode !== "stroke_gross";
        });
      } else {
        // Nếu không có Best Gross cho Net, Best Gross sẽ thuộc về bảng Pro Gross
        eligibleForGross = eligibleRows.filter(row => {
          const flightConfig = window.LB.appPlayer.getFlightConfigByName(row.division);
          return flightConfig?.scoringMode === "stroke_gross";
        });
      }
    }

    const bestGross = eligibleForGross.length > 0
      ? [...eligibleForGross].sort(window.LB.scoring.compareBestGrossRows)[0] || null
      : null;
    const placementRows = eligibleRows
      .filter(row => row.playerId !== bestGross?.playerId)
      .map(row => window.LB.appFinal.applyFinalNetCut(row, netCutLimit));
    const netCutAppliedRows = placementRows.filter(row => row.finalNetCutApplied);
    const groups = new Map();

    placementRows.forEach(row => {
      const meta = window.LB.appFinal.getFinalGroupMeta(row, rankingScope);
      if (!groups.has(meta.key)) groups.set(meta.key, { ...meta, rows: [] });
      groups.get(meta.key).rows.push(row);
    });

    const configuredDivisions = window.LB.appPlayer.getConfiguredDivisionNames();
    const podiums = Array.from(groups.values())
      .map(group => ({ ...group, rows: [...group.rows].sort(window.LB.appFinal.compareFinalPlacementRows) }))
      .sort((left, right) => {
        if (rankingScope === "gender") {
          const order = { male: 0, female: 1, unknown: 2 };
          return (order[left.key.split(":")[1]] ?? 9) - (order[right.key.split(":")[1]] ?? 9);
        }
        const leftName = left.key.slice("division:".length);
        const rightName = right.key.slice("division:".length);
        const leftIndex = configuredDivisions.indexOf(leftName);
        const rightIndex = configuredDivisions.indexOf(rightName);
        if (leftIndex >= 0 || rightIndex >= 0) {
          if (leftIndex < 0) return 1;
          if (rightIndex < 0) return -1;
          if (leftIndex !== rightIndex) return leftIndex - rightIndex;
        }
        return left.label.localeCompare(right.label, "vi", { numeric: true });
      });

    return { allRows, eligibleRows, rankingScope, bestGross, podiums, netCutLimit, netCutAppliedRows };
  }

function normalizeFinalTechnicalCount(value) {
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) return 1;
    return Math.min(5, Math.max(0, Math.trunc(parsed)));
  }

function normalizeHoleInOneCount(value) {
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) return 0;
    return Math.min(4, Math.max(0, Math.trunc(parsed)));
  }

function normalizePrizeList(prizes, options = {}) {
    const items = Array.isArray(prizes)
      ? prizes.map(item => String(item || "").trim())
      : [];
    const filtered = options.keepEmpty ? items : items.filter(Boolean);
    return options.ensureOne && !filtered.length ? [""] : filtered;
  }

function syncFinalHoleInOneRows(finalResults) {
    const existing = Array.isArray(finalResults.holeInOneAwards) ? finalResults.holeInOneAwards : [];
    const count = window.LB.appFinal.normalizeHoleInOneCount(finalResults.holeInOneCount);
    finalResults.holeInOneCount = count;
    finalResults.holeInOneAwards = Array.from({ length: count }, (_, index) => {
      const slot = index + 1;
      const award = existing.find(item => Number(item.slot) === slot) || existing[index] || {};
      return {
        slot,
        playerId: award.playerId || "",
        hole: award.hole || "",
        prizes: window.LB.appFinal.normalizePrizeList(award.prizes, { keepEmpty: true, ensureOne: true })
      };
    });
    return finalResults.holeInOneAwards;
  }

function getFinalTechnicalGroups(mode, field = "longestDrive") {
    if (field !== "longestDrive") return [{ key: "combined", label: "Toàn giải" }];
    return mode === "separate"
      ? [
          { key: "male", label: "Nam" },
          { key: "female", label: "Nữ" }
        ]
      : [{ key: "combined", label: "Toàn giải" }];
  }

function syncFinalTechnicalRows(finalResults, field) {
    const groups = window.LB.appFinal.getFinalTechnicalGroups(finalResults.technicalGenderMode, field);
    const existing = Array.isArray(finalResults[field]) ? finalResults[field] : [];
    const count = window.LB.appFinal.normalizeFinalTechnicalCount(finalResults.technicalAwardCounts?.[field]);
    finalResults[field] = groups.flatMap(group => {
      const existingForGroup = existing.filter(item => item.group === group.key);
      return Array.from({ length: count }, (_, index) => {
        const slot = index + 1;
        const award = existing.find(item => item.group === group.key && Number(item.slot) === slot) || existingForGroup[index] || {};
        return {
          group: group.key,
          slot,
          playerId: award.playerId || "",
          hole: award.hole || "",
          distance: award.distance || ""
        };
      });
    });
    return groups;
  }

function getFinalPlayersForGroup(rows, group) {
    if (group === "combined") return rows;
    return rows.filter(row => window.LB.appPlayer.normalizeGender(row.gender || "") === group);
  }

function getFinalHoleInOneHoles(row = {}) {
    const scores = row.holeScores || {};
    return Object.entries(scores)
      .filter(([, score]) => Number(score) === 1)
      .map(([hole]) => String(hole).trim())
      .filter(Boolean)
      .sort((left, right) => (Number(left) || 99) - (Number(right) || 99));
  }

function getFinalHoleInOneCandidates(rows = []) {
    return rows.filter(row => window.LB.appFinal.getFinalHoleInOneHoles(row).length > 0);
  }

function renderFinalPlayerOptions(rows, selectedId = "", placeholder = "Chọn golfer") {
    return [
      `<option value="">${window.LB.appUtils.escapeHtml(placeholder)}</option>`,
      ...rows.map(row => `<option value="${window.LB.appUtils.escapeHtml(row.playerId)}" ${row.playerId === selectedId ? "selected" : ""}>${window.LB.appUtils.escapeHtml(row.name)} · ${window.LB.appUtils.escapeHtml(window.LB.appPlayer.formatDivisionLabel(window.LB.appPlayer.getPlayerDivision(row)))}</option>`)
    ].join("");
  }

function renderFinalHoleInOnePlayerOptions(rows, selectedId = "") {
    return [
      `<option value="">${rows.length ? "Chọn golfer HIO" : "Chưa có golfer gross 1"}</option>`,
      ...rows.map(row => {
        const holes = window.LB.appFinal.getFinalHoleInOneHoles(row);
        const holeLabel = holes.length === 1 ? `Hố ${holes[0]}` : `Hố ${holes.join(", ")}`;
        return `<option value="${window.LB.appUtils.escapeHtml(row.playerId)}" ${row.playerId === selectedId ? "selected" : ""}>${window.LB.appUtils.escapeHtml(row.name)} · ${window.LB.appUtils.escapeHtml(holeLabel)} · ${window.LB.appUtils.escapeHtml(window.LB.appPlayer.formatDivisionLabel(window.LB.appPlayer.getPlayerDivision(row)))}</option>`;
      })
    ].join("");
  }

function formatFinalRowScore(row) {
    if (!row) return "—";
    const metric = row.scoringMode === "system36" ? row.system36Net : row.net;
    const finalNet = Number(row.finalNet);
    const displayedMetric = row.finalNetCutApplied && Number.isFinite(finalNet) ? finalNet : metric;
    const cutNote = row.finalNetCutApplied
      ? ` · cắt ${window.LB.scoring.formatDiff(row.finalRawNetToPar)}→${window.LB.scoring.formatDiff(row.finalNetToPar)}`
      : "";
    return `Gross ${row.gross} · ${row.scoringMode === "system36" ? "S36 Net" : "Net"} ${Number.isFinite(displayedMetric) ? displayedMetric : "-"}${cutNote}`;
  }

function printFinalResults(orientation) {
    const computation = window.LB.appFinal.buildFinalAwardComputation();
    const finalResults = window.LB.appFinal.getFinalResultsState();
    const tourName = state().tournament?.name || "GIẢI GOLF CHUNG CUỘC";

    const getPlayerInfo = (playerId) => {
      const p = computation.allRows.find(r => r.playerId === playerId);
      if (!p) return null;
      const vga = p.vgaId || p.golferId || p.playerId || "";
      return { name: p.name, vga, scoreText: window.LB.appFinal.formatFinalRowScore(p) };
    };

    const bestGrossPlayer = computation.bestGross ? getPlayerInfo(computation.bestGross.playerId) : null;

    const renderPodiumBlock = (group) => {
      const p1 = group.rows[0] ? getPlayerInfo(group.rows[0].playerId) : null;
      const p2 = group.rows[1] ? getPlayerInfo(group.rows[1].playerId) : null;
      const p3 = group.rows[2] ? getPlayerInfo(group.rows[2].playerId) : null;

      return `
        <div class="mc-block">
          <div class="mc-block-title">🥇 BẢNG ĐẤU: ${window.LB.appUtils.escapeHtml(group.label)}</div>
          <div class="mc-row">
            <div class="mc-rank gold">🏆 Giải Nhất:</div>
            <div class="mc-details">
              <span class="mc-name">${p1 ? window.LB.appUtils.escapeHtml(p1.name) : "—"}</span>
              ${p1 && p1.vga ? `<span class="mc-vga">VGA ${window.LB.appUtils.escapeHtml(p1.vga)}</span>` : ""}
              ${p1 ? `<span class="mc-score">&nbsp;—&nbsp; ${window.LB.appUtils.escapeHtml(p1.scoreText)}</span>` : ""}
            </div>
          </div>
          <div class="mc-row">
            <div class="mc-rank silver">🥈 Giải Nhì:</div>
            <div class="mc-details">
              <span class="mc-name">${p2 ? window.LB.appUtils.escapeHtml(p2.name) : "—"}</span>
              ${p2 && p2.vga ? `<span class="mc-vga">VGA ${window.LB.appUtils.escapeHtml(p2.vga)}</span>` : ""}
              ${p2 ? `<span class="mc-score">&nbsp;—&nbsp; ${window.LB.appUtils.escapeHtml(p2.scoreText)}</span>` : ""}
            </div>
          </div>
          <div class="mc-row">
            <div class="mc-rank bronze">🥉 Giải Ba:</div>
            <div class="mc-details">
              <span class="mc-name">${p3 ? window.LB.appUtils.escapeHtml(p3.name) : "—"}</span>
              ${p3 && p3.vga ? `<span class="mc-vga">VGA ${window.LB.appUtils.escapeHtml(p3.vga)}</span>` : ""}
              ${p3 ? `<span class="mc-score">&nbsp;—&nbsp; ${window.LB.appUtils.escapeHtml(p3.scoreText)}</span>` : ""}
            </div>
          </div>
        </div>
      `;
    };

    // Technical awards
    const technicalFields = [
      { key: "longestDrive", label: "Longest Drive" },
      { key: "nearestToPin", label: "Nearest to Pin" },
      { key: "nearToTheLine", label: "Near to the Line" },
      { key: "longestPutt", label: "Longest Putt" }
    ];
    let techHtml = "";
    let techCount = 0;
    technicalFields.forEach(field => {
      const awards = finalResults[field.key] || [];
      const groups = window.LB.appFinal.getFinalTechnicalGroups(finalResults.technicalGenderMode, field.key);
      groups.forEach(group => {
        const groupAwards = awards.filter(item => item.group === group.key);
        groupAwards.forEach((award, idx) => {
          if (!award.playerId) return;
          const p = getPlayerInfo(award.playerId);
          if (!p) return;
          techCount++;
          const details = [
            award.hole ? `Hố ${award.hole}` : "",
            award.distance ? `${award.distance}m` : ""
          ].filter(Boolean).join(" · ");
          const labelSuffix = groupAwards.length > 1 ? ` #${idx + 1}` : "";
          const groupLabel = group.label !== "Toàn giải" ? ` (${group.label})` : "";
          techHtml += `
            <div class="mc-row">
              <div class="mc-rank tech">🎯 ${field.label}${groupLabel}${labelSuffix}:</div>
              <div class="mc-details">
                <span class="mc-name">${window.LB.appUtils.escapeHtml(p.name)}</span>
                ${p.vga ? `<span class="mc-vga">VGA ${window.LB.appUtils.escapeHtml(p.vga)}</span>` : ""}
                ${details ? `<span class="mc-score">&nbsp;—&nbsp; ${window.LB.appUtils.escapeHtml(details)}</span>` : ""}
              </div>
            </div>
          `;
        });
      });
    });

    // Special awards
    let specialHtml = "";
    let specialCount = 0;
    (finalResults.specialAwards || []).forEach(award => {
      if (!award.playerId || !award.name) return;
      const p = getPlayerInfo(award.playerId);
      if (!p) return;
      specialCount++;
      techHtml += `
        <div class="mc-row">
          <div class="mc-rank special">🌟 ${window.LB.appUtils.escapeHtml(award.name)}:</div>
          <div class="mc-details">
            <span class="mc-name">${window.LB.appUtils.escapeHtml(p.name)}</span>
            ${p.vga ? `<span class="mc-vga">VGA ${window.LB.appUtils.escapeHtml(p.vga)}</span>` : ""}
            ${award.note ? `<span class="mc-score">&nbsp;—&nbsp; ${window.LB.appUtils.escapeHtml(award.note)}</span>` : ""}
          </div>
        </div>
      `;
    });

    // Hole In One awards
    let hioHtml = "";
    let hioCount = 0;
    (finalResults.holeInOneAwards || []).forEach((award, idx) => {
      if (!award.playerId) return;
      const p = getPlayerInfo(award.playerId);
      if (!p) return;
      techCount++;
      const prizes = window.LB.appFinal.normalizePrizeList(award.prizes).join(", ");
      techHtml += `
        <div class="mc-row">
          <div class="mc-rank hio">⛳ HIO #${idx + 1}:</div>
          <div class="mc-details">
            <span class="mc-name">${window.LB.appUtils.escapeHtml(p.name)}</span>
            ${p.vga ? `<span class="mc-vga">VGA ${window.LB.appUtils.escapeHtml(p.vga)}</span>` : ""}
            <span class="mc-score">&nbsp;—&nbsp; Hố ${window.LB.appUtils.escapeHtml(award.hole || "")} ${prizes ? `- Phần thưởng: ${window.LB.appUtils.escapeHtml(prizes)}` : ""}</span>
          </div>
        </div>
      `;
    });

    // Build blocks list to balance columns greedily
    const blocks = [];

    // Model exact element pixel heights at zoom = 1.0 (base font 11pt = 15px, line-height 1.4 = 21px)
    if (bestGrossPlayer) {
      blocks.push({
        html: `
          <div class="mc-block champion">
            <div class="mc-block-title champion-title">🏆 GIẢI VÔ ĐỊCH - BEST GROSS</div>
            <div class="mc-row">
              <div class="mc-details">
                Xin chúc mừng Golfer:
                <span class="mc-name highlight">${window.LB.appUtils.escapeHtml(bestGrossPlayer.name)}</span>
                ${bestGrossPlayer.vga ? `<span class="mc-vga">VGA ${window.LB.appUtils.escapeHtml(bestGrossPlayer.vga)}</span>` : ""}
                <div style="margin-top: 4px;">Điểm số: <span class="mc-score bold">${window.LB.appUtils.escapeHtml(bestGrossPlayer.scoreText)}</span></div>
              </div>
            </div>
          </div>
        `,
        height: 90
      });
    }

    computation.podiums.forEach(group => {
      blocks.push({
        html: renderPodiumBlock(group),
        height: 130 // Title border/margins (~37px) + 3 rows * 27px (81px) + block margin (12px)
      });
    });

    if (techHtml) {
      blocks.push({
        html: `
          <div class="mc-block">
            <div class="mc-block-title">🎯 GIẢI KỸ THUẬT & GIẢI ĐẶC BIỆT</div>
            <div class="mc-tech-list">
              ${techHtml}
            </div>
          </div>
        `,
        height: 50 + techCount * 27 // Title border/margins (~37px) + N rows * 27px + block margin (12px)
      });
    }

    // Balance columns greedily based on estimated heights
    let leftColHtml = "";
    let rightColHtml = "";
    let leftHeight = 0;
    let rightHeight = 0;

    blocks.forEach(block => {
      if (leftHeight <= rightHeight) {
        leftColHtml += block.html;
        leftHeight += block.height;
      } else {
        rightColHtml += block.html;
        rightHeight += block.height;
      }
    });

    const isLandscape = orientation === "landscape";
    const maxColHeight = Math.max(leftHeight, rightHeight);

    // Page overhead: Header (~80px)
    const pageOverhead = 80;
    const totalContentHeight = maxColHeight + pageOverhead;

    // Available heights considering margins & browser print footers/headers space
    const availableHeight = isLandscape ? 560 : 860;

    // Zoom factor calculation
    const zoom = Math.min(1.0, Math.max(0.40, availableHeight / totalContentHeight));

    const printWindow = window.open("", "_blank");
    if (!printWindow) {
      alert("Vui lòng cho phép trình duyệt mở popup để in kết quả.");
      return;
    }

    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>Kịch bản MC - Trao giải ${window.LB.appUtils.escapeHtml(tourName)}</title>
        <meta charset="utf-8">
        <style>
          @import url('https://fonts.googleapis.com/css2?family=Montserrat:wght@400;600;700;800&display=swap');

          * { box-sizing: border-box; }
          html, body { height: 100%; margin: 0; padding: 0; }

          @page {
            size: A4 ${orientation};
            margin: ${isLandscape ? "8mm 10mm" : "12mm 15mm"};
          }

          body {
            font-family: 'Montserrat', sans-serif;
            color: #111;
            background-color: #fff;
            -webkit-print-color-adjust: exact;
            print-color-adjust: exact;
            font-size: 11pt;
            line-height: 1.4;
          }

          .container {
            display: flex;
            flex-direction: column;
            height: 100%;
            zoom: ${zoom};
          }

          /* Header Style */
          .header {
            text-align: center;
            border-bottom: 2px solid #1b4d3e;
            padding-bottom: 8px;
            margin-bottom: 12px;
          }
          .header h1 {
            margin: 0 0 2px 0;
            font-size: 18pt;
            font-weight: 800;
            color: #1b4d3e;
            text-transform: uppercase;
          }
          .header p {
            margin: 0;
            font-size: 10pt;
            font-weight: 700;
            color: #d4af37;
            text-transform: uppercase;
            letter-spacing: 1.5px;
          }

          /* 2-Column Balanced Layout */
          .main-content {
            flex-grow: 1;
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 24px;
            align-items: start;
          }

          .mc-block {
            margin-bottom: 12px;
            break-inside: avoid;
          }

          .mc-block-title {
            font-size: 1.1em;
            font-weight: 800;
            color: #1b4d3e;
            text-transform: uppercase;
            border-bottom: 2px solid #d4af37;
            padding-bottom: 4px;
            margin-bottom: 8px;
          }

          .mc-block.champion {
            background-color: #f4f8f6;
            padding: 8px 12px;
            border-left: 5px solid #d4af37;
            border-radius: 4px;
          }
          .mc-block.champion .champion-title {
            border-bottom: none;
            padding-bottom: 0;
            margin-bottom: 6px;
            color: #d4af37;
          }

          .mc-row {
            display: flex;
            align-items: flex-start;
            margin-bottom: 6px;
          }

          .mc-rank {
            font-weight: 700;
            min-width: 105px;
            flex-shrink: 0;
            margin-right: 8px;
          }
          .mc-rank.gold { color: #b8860b; }
          .mc-rank.silver { color: #5a5a5a; }
          .mc-rank.bronze { color: #a0522d; }
          .mc-rank.tech, .mc-rank.special, .mc-rank.hio {
            min-width: auto;
            width: 140px;
            color: #1b4d3e;
          }

          .mc-details {
            flex-grow: 1;
            word-break: break-word;
          }

          .mc-name {
            font-weight: 700;
            font-size: 1.05em;
            color: #000;
          }
          .mc-name.highlight {
            font-size: 1.2em;
            color: #1b4d3e;
          }

          .mc-vga {
            display: inline-block;
            background-color: #eee;
            color: #333;
            padding: 1px 6px;
            border-radius: 4px;
            font-size: 0.85em;
            font-weight: 600;
            margin: 0 4px;
            vertical-align: middle;
          }

          .mc-score {
            font-weight: 600;
            color: #444;
          }
          .mc-score.bold {
            font-weight: 800;
            color: #1b4d3e;
            font-size: 1.05em;
          }

          @media print {
            .no-print-btn { display: none; }
          }
          .no-print-btn {
            position: fixed; bottom: 20px; right: 20px;
            background-color: #1b4d3e; color: white; border: none;
            padding: 10px 20px; font-family: inherit; font-size: 11pt;
            font-weight: bold; border-radius: 5px; cursor: pointer;
            box-shadow: 0 4px 6px rgba(0,0,0,0.15); transition: 0.2s;
          }
          .no-print-btn:hover { background-color: #113329; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>${window.LB.appUtils.escapeHtml(tourName)}</h1>
            <p>Kịch bản MC - Kết quả trao giải chung cuộc</p>
          </div>

          <div class="main-content">
            <div class="left-col">
              ${leftColHtml}
            </div>
            <div class="right-col">
              ${rightColHtml}
            </div>
          </div>
        </div>

        <button class="no-print-btn" onclick="window.print()">In ngay</button>
        <script>window.onload = function() { setTimeout(window.print, 400); }</script>
      </body>
      </html>
    `);
    printWindow.document.close();
  }

function buildPublishedFinalResults() {
    const finalResults = window.LB.appFinal.getFinalResultsState();
    if (finalResults.status !== "published") return finalResults.publishedSnapshot || null;
    const computation = window.LB.appFinal.buildFinalAwardComputation();
    const validPlayerIds = new Set(computation.eligibleRows.map(row => row.playerId));
    const allPlayerIds = new Set(computation.allRows.map(row => row.playerId));
    const hioPlayerIds = new Set(window.LB.appFinal.getFinalHoleInOneCandidates(computation.allRows).map(row => row.playerId));
    const sanitizeTechnical = field => (finalResults[field] || [])
      .filter(award => award.playerId && validPlayerIds.has(award.playerId))
      .map(award => ({
        group: award.group,
        slot: Number(award.slot) || 1,
        playerId: award.playerId,
        hole: String(award.hole || "").trim(),
        distance: String(award.distance || "").trim()
      }));
    const sanitizeHoleInOneAwards = () => window.LB.appFinal.syncFinalHoleInOneRows(finalResults)
      .map(award => ({
        slot: Number(award.slot) || 1,
        playerId: award.playerId,
        hole: String(award.hole || "").trim(),
        prizes: window.LB.appFinal.normalizePrizeList(award.prizes)
      }))
      .filter(award => award.playerId && allPlayerIds.has(award.playerId) && hioPlayerIds.has(award.playerId) && award.hole && award.prizes.length > 0);
    const holeInOneAwards = sanitizeHoleInOneAwards();
    const publishedSnapshot = {
      status: "published",
      publishedAt: finalResults.publishedAt,
      rankingScope: computation.rankingScope,
      netCutLimit: computation.netCutLimit,
      netCutAppliedPlayerIds: computation.netCutAppliedRows.map(row => row.playerId),
      bestGrossPlayerId: computation.bestGross?.playerId || "",
      podiums: computation.podiums.map(group => ({
        key: group.key,
        label: group.label,
        scope: group.scope,
        rank1PlayerId: group.rows[0]?.playerId || "",
        rank2PlayerId: group.rows[1]?.playerId || "",
        rank3PlayerId: group.rows[2]?.playerId || ""
      })),
      technicalGenderMode: finalResults.technicalGenderMode,
      technicalAwardCounts: {
        longestDrive: window.LB.appFinal.normalizeFinalTechnicalCount(finalResults.technicalAwardCounts?.longestDrive),
        nearestToPin: window.LB.appFinal.normalizeFinalTechnicalCount(finalResults.technicalAwardCounts?.nearestToPin),
        nearToTheLine: window.LB.appFinal.normalizeFinalTechnicalCount(finalResults.technicalAwardCounts?.nearToTheLine),
        longestPutt: window.LB.appFinal.normalizeFinalTechnicalCount(finalResults.technicalAwardCounts?.longestPutt)
      },
      longestDrive: sanitizeTechnical("longestDrive"),
      nearestToPin: sanitizeTechnical("nearestToPin"),
      nearToTheLine: sanitizeTechnical("nearToTheLine"),
      longestPutt: sanitizeTechnical("longestPutt"),
      holeInOneCount: window.LB.appFinal.normalizeHoleInOneCount(finalResults.holeInOneCount),
      holeInOneAwards,
      specialAwards: finalResults.specialAwards
        .filter(award => award.name?.trim() && award.playerId && validPlayerIds.has(award.playerId))
        .map(award => ({
          id: award.id,
          name: award.name.trim(),
          playerId: award.playerId,
          note: String(award.note || "").trim()
        }))
    };
    finalResults.publishedSnapshot = publishedSnapshot;
    return publishedSnapshot;
  }

  return { getFinalResultsState, markFinalResultsDraft, invalidatePublishedFinalResults, getFinalAwardRows, getFinalCompletion, hasMixedFinalGenderScoringModes, getFinalGroupMeta, formatFinalNetCutLabel, compareFinalNumber, getFinalRawNetMetric, getFinalParPlayed, applyFinalNetCut, compareFinalPlacementRows, buildFinalAwardComputation, normalizeFinalTechnicalCount, normalizeHoleInOneCount, normalizePrizeList, syncFinalHoleInOneRows, getFinalTechnicalGroups, syncFinalTechnicalRows, getFinalPlayersForGroup, getFinalHoleInOneHoles, getFinalHoleInOneCandidates, renderFinalPlayerOptions, renderFinalHoleInOnePlayerOptions, formatFinalRowScore, printFinalResults, buildPublishedFinalResults };
})();
