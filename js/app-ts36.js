window.LB = window.LB || {};
window.LB.appTs36 = (function() {
  const state = () => window.LB.state;

function isLinkedToTourSystem() {
    return window.LB.appUtils.getCapabilities().linked;
  }

function markTourSystemMatchMissingSystem36(match) {
    if (!match) return;
    match.status = "review";
    match.reviewNote = "missing_system36_division";
    const existing = (state().alerts || []).some(item => item.type === "ts36_missing_s36_division");
    if (!existing) {
      state().alerts.unshift({
        id: `s36-${Date.now().toString(36)}`,
        type: "ts36_missing_s36_division",
        message: "Không thể link TS36 vì tournament chưa có bảng nào tick S36 phù hợp. GO cần tạo/tick bảng S36 rồi nạp lại danh sách.",
        createdAt: new Date().toISOString()
      });
    }
  }

function getPlayerLinkedTourSystemUserId(player = {}) {
    return window.LB.appUtils.cleanText(player.tourSystemUserId || "");
  }

function isPlayerLinkedToDifferentTs36(player = {}, match = {}) {
    const linkedUserId = window.LB.appTs36.getPlayerLinkedTourSystemUserId(player);
    const matchUserId = window.LB.appUtils.cleanText(match.tourSystemUserId || "");
    return !!linkedUserId && (!matchUserId || linkedUserId !== matchUserId);
  }

function isTourSystemMatchConfirmed(match = {}) {
    if (!match.linkedPlayerId) return false;
    const player = state().players.find(item => item.id === match.linkedPlayerId);
    return player?.ts36MatchStatus === "confirmed";
  }

function normalizeTourSystemUser(row = {}) {
    const metadata = row.metadata || {};
    const simulator2MatchMode = window.LB.appUtils.cleanText(metadata.simulator2MatchMode || metadata.simulator2_match_mode || "").toLowerCase();
    const simulator2MatchAccepted = /^(accepted|linked|confirmed)$/i.test(window.LB.appUtils.cleanText(metadata.matchStatus || metadata.match_status || ""))
      || !!metadata.matchAcceptedAt;
    const simulator2ClaimedPlayerId = metadata.simulator2 === true && simulator2MatchMode && simulator2MatchMode !== "duplicate_id" && !simulator2MatchAccepted
      ? ""
      : window.LB.appUtils.cleanText(metadata.leaderboardPlayerId || metadata.claimedLeaderboardPlayerId || "");
    const userId = window.LB.appUtils.cleanText(row.toursystem_user_id || row.user_id || row.userId || metadata.toursystemUserId || metadata.user_id || "");
    const rawVga = window.LB.appUtils.cleanText(
      row.vga_id || row.vgaId || row.vga || row.member_id || row.playerExternalId ||
      metadata.vga_id || metadata.vgaId || metadata.vga || metadata.memberId ||
      metadata.enteredVga || metadata.entered_vga || metadata.playerExternalId ||
      metadata.profileVgaId || metadata.ts36VgaId || metadata.toursystemExternalId || ""
    );
    const displayName = window.LB.appUtils.cleanText(
      row.display_name || row.displayName || row.name || row.full_name || row.player_name ||
      metadata.displayName || metadata.display_name || metadata.ts36DisplayName ||
      metadata.name || row.email || metadata.email || metadata.ts36Email || ""
    );
    const matchId = `ts36-${(userId || window.LB.appUtils.normalizeVgaId(rawVga) || window.LB.appUtils.keyText(displayName) || Math.random().toString(36).slice(2, 8)).replace(/[^a-z0-9-]/gi, "")}`;
    return {
      id: matchId,
      tourSystemUserId: userId,
      displayName: displayName || (userId ? `TS36 ${userId.slice(0, 8)}` : "TS36 user"),
      email: window.LB.appUtils.cleanText(row.email || metadata.email || metadata.ts36Email || ""),
      rawVgaId: rawVga,
      normalizedVgaId: window.LB.appUtils.normalizeVgaId(rawVga),
      claimedPlayerId: window.LB.appUtils.cleanText(
        row.leaderboard_player_id || row.leaderboardPlayerId || row.player_id || row.playerId ||
        simulator2ClaimedPlayerId ||
        metadata.player_id || metadata.playerId || metadata.claimedPlayerId || ""
      ),
      joinedAt: row.joined_at || row.joinedAt || row.submitted_at || row.submittedAt || "",
      metadata,
      raw: row
    };
  }

function normalizeStartHoleMismatch(row = {}, match = null) {
    const metadata = row.metadata || {};
    const warning = metadata.startHoleMismatch || metadata.start_hole_mismatch || null;
    if (!warning || typeof warning !== "object") return null;
    const expectedStartHole = window.LB.scoring.clampInt(
      warning.expectedStartHole || warning.expected_start_hole || warning.selectedStartHole,
      1,
      18,
      0
    );
    const actualStartHole = window.LB.scoring.clampInt(
      warning.actualStartHole || warning.actual_start_hole || warning.firstWrongHole,
      1,
      18,
      0
    );
    const tourSystemUserId = window.LB.appUtils.cleanText(
      row.toursystem_user_id || row.user_id || row.userId || metadata.toursystemUserId || match?.tourSystemUserId || ""
    );
    if (!expectedStartHole || !actualStartHole || !tourSystemUserId) return null;
    const id = window.LB.appUtils.cleanText(warning.warningId || warning.warning_id)
      || `start-hole:${tourSystemUserId}:${expectedStartHole}:${actualStartHole}`;
    return {
      id,
      operatorTournamentId: window.LB.appUtils.cleanText(row.operator_tournament_id || row.operatorTournamentId || state().operator.linkedTournament?.id || ""),
      tourSystemUserId,
      matchId: match?.id || "",
      linkedPlayerId: window.LB.appUtils.cleanText(match?.linkedPlayerId || row.leaderboard_player_id || metadata.leaderboardPlayerId || metadata.claimedLeaderboardPlayerId || ""),
      displayName: match?.displayName || row.display_name || metadata.displayName || metadata.ts36DisplayName || "TS36 golfer",
      email: match?.email || row.email || metadata.email || metadata.ts36Email || "",
      expectedStartHole,
      actualStartHole,
      message: warning.message || `TS36 user chọn H${expectedStartHole} nhưng bắt đầu nhập điểm ở H${actualStartHole}.`,
      status: "pending",
      createdAt: warning.notifiedAt || row.submitted_at || row.submittedAt || new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
  }

function upsertStartHoleMismatchWarning(match, row = {}) {
    const warning = window.LB.appTs36.normalizeStartHoleMismatch(row, match);
    if (!warning) return false;
    const warnings = Array.isArray(state().startHoleWarnings) ? state().startHoleWarnings : [];
    const index = warnings.findIndex(item => item.id === warning.id);
    if (index >= 0) {
      const previous = warnings[index];
      const changed = previous.matchId !== warning.matchId
        || previous.linkedPlayerId !== warning.linkedPlayerId
        || previous.displayName !== warning.displayName
        || previous.expectedStartHole !== warning.expectedStartHole
        || previous.actualStartHole !== warning.actualStartHole
        || previous.message !== warning.message;
      warnings[index] = {
        ...previous,
        ...warning,
        status: previous.status && previous.status !== "pending" ? previous.status : "pending",
        resolvedAt: previous.resolvedAt || "",
        resolution: previous.resolution || null,
        updatedAt: changed ? warning.updatedAt : previous.updatedAt
      };
      state().startHoleWarnings = warnings;
      return changed;
    }
    state().startHoleWarnings = [warning, ...warnings].slice(0, 50);
    state().alerts = (state().alerts || []).filter(item => item.type !== "ts36_start_hole_mismatch" || item.warningId !== warning.id);
    state().alerts.unshift({
      id: `start-hole-${Date.now().toString(36)}`,
      type: "ts36_start_hole_mismatch",
      warningId: warning.id,
      message: `${warning.displayName}: chọn hố xuất phát H${warning.expectedStartHole} nhưng nhập điểm từ H${warning.actualStartHole}.`,
      createdAt: new Date().toISOString()
    });
    return true;
  }

async function resolveStartHoleMismatchWarning(warningId, decision) {
    const warnings = Array.isArray(state().startHoleWarnings) ? state().startHoleWarnings : [];
    const warning = warnings.find(item => item.id === warningId);
    const normalizedDecision = window.LB.appUtils.cleanText(decision).toLowerCase();
    if (!warning || !["accept", "cancel"].includes(normalizedDecision)) return { ok: false, reason: "invalid_warning" };

    const linked = state().operator.linkedTournament;
    const code = state().operator.privateCode || state().tournament.operatorPrivateCode || "";
    const resolution = {
      id: `${warning.id}:${normalizedDecision}:${Date.now().toString(36)}`,
      warningId: warning.id,
      decision: normalizedDecision,
      status: normalizedDecision === "accept" ? "start_hole_corrected" : "opponent_sync_blocked",
      expectedStartHole: warning.expectedStartHole,
      actualStartHole: warning.actualStartHole,
      resolvedAt: new Date().toISOString(),
      resolvedBy: state().tournament.operatorName || "GO"
    };

    const previousWarningState = {
      status: warning.status,
      resolvedAt: warning.resolvedAt,
      resolution: warning.resolution,
      updatedAt: warning.updatedAt
    };
    const rollbackWarning = () => {
      warning.status = previousWarningState.status || "pending";
      warning.resolvedAt = previousWarningState.resolvedAt || "";
      warning.resolution = previousWarningState.resolution || null;
      warning.updatedAt = previousWarningState.updatedAt || warning.updatedAt;
      window.LB.storage.saveState();
      window.LB.appUtils.render();
    };

    warning.status = resolution.status;
    warning.resolvedAt = resolution.resolvedAt;
    warning.resolution = resolution;
    warning.updatedAt = resolution.resolvedAt;
    window.LB.storage.saveState();
    window.LB.appUtils.render();

    const bridge = window.LB.supabaseBridge;
    if (!linked?.id || !code || !warning.tourSystemUserId || !bridge?.resolveOperatorStartHoleMismatch) {
      rollbackWarning();
      return { ok: false, reason: "bridge_not_configured" };
    }
    const result = await bridge.resolveOperatorStartHoleMismatch(
      linked.id,
      code,
      warning.tourSystemUserId,
      resolution
    );
    if (!result.ok) {
      rollbackWarning();
      return result;
    }
    state().alerts.unshift({
      id: `start-hole-resolved-${Date.now().toString(36)}`,
      type: "ts36_start_hole_resolved",
      warningId: warning.id,
      message: normalizedDecision === "accept"
        ? `${warning.displayName}: đã gửi xác nhận đổi TS36 sang hố xuất phát H${warning.actualStartHole}.`
        : `${warning.displayName}: đã hủy sync đối thủ, BTC dùng bảng điểm cứng để xác nhận.`,
      createdAt: new Date().toISOString()
    });
    window.LB.storage.saveState();
    window.LB.appUtils.render();
    return result;
  }

function upsertTourSystemMatch(row = {}) {
    const candidate = window.LB.appTs36.normalizeTourSystemUser(row);
    const suggested = window.LB.appPlayer.findSuggestedPlayer(candidate);
    const matches = state().ts36Matches || [];
    let match = matches.find(item => item.id === candidate.id || (candidate.tourSystemUserId && item.tourSystemUserId === candidate.tourSystemUserId));
    if (!match) {
      match = {
        id: candidate.id,
        pendingScores: [],
        status: "pending",
        createdAt: new Date().toISOString()
      };
      matches.unshift(match);
      state().ts36Matches = matches;
    }
    Object.assign(match, {
      tourSystemUserId: candidate.tourSystemUserId || match.tourSystemUserId || "",
      displayName: candidate.displayName || match.displayName || "",
      email: candidate.email || match.email || "",
      rawVgaId: candidate.rawVgaId || match.rawVgaId || "",
      normalizedVgaId: candidate.normalizedVgaId || match.normalizedVgaId || "",
      claimedPlayerId: candidate.claimedPlayerId || match.claimedPlayerId || "",
      suggestedPlayerId: suggested.player?.id || match.suggestedPlayerId || "",
      suggestionScore: suggested.score || match.suggestionScore || 0,
      suggestionReason: suggested.reason || match.suggestionReason || "",
      joinedAt: candidate.joinedAt || match.joinedAt || "",
      metadata: candidate.metadata || match.metadata || {},
      updatedAt: new Date().toISOString(),
      raw: candidate.raw
    });
    const linkedPlayer = state().players.find(player => player.tourSystemUserId && player.tourSystemUserId === match.tourSystemUserId);
    if (linkedPlayer) {
      match.linkedPlayerId = linkedPlayer.id;
      match.status = "linked";
    } else if (match.status !== "linked") {
      match.status = suggested.player ? "review" : "pending";
    }
    window.LB.appTs36.maybeAutoLinkTourSystemMatch(match);
    return match;
  }

function isDeletedTourSystemScore(row = {}) {
    const status = window.LB.appUtils.keyText(row.status || row.score_status || row.scoreStatus || row.action || row.event || "");
    return row.deleted === true
      || row.is_deleted === true
      || !!row.deleted_at
      || /\b(delete|deleted|remove|removed|clear|cleared)\b/.test(status);
  }

function removePendingTourSystemScore(match, row = {}) {
    if (!match) return 0;
    const hole = window.LB.scoring.clampInt(row.hole, 1, 18, 0);
    if (!hole) return 0;

    let changed = 0;
    const previousPending = Array.isArray(match.pendingScores) ? match.pendingScores : [];
    match.pendingScores = previousPending.filter(score => {
      const keep = Number(score.hole) !== hole;
      if (!keep) changed += 1;
      return keep;
    });

    if (!match.linkedPlayerId) return changed;
    const scoreMap = state().scores[match.linkedPlayerId];
    const submissionId = window.LB.appUtils.cleanText(row.id || "");
    if (!scoreMap) return changed;
    const candidateHoles = new Set([String(hole)]);
    if (submissionId) {
      Object.entries(scoreMap).forEach(([holeKey, record]) => {
        if (record?.tourSystemSubmissionId === submissionId || record?.tourSystemOriginalHole === hole) {
          candidateHoles.add(String(holeKey));
        }
      });
    }

    candidateHoles.forEach((holeKey) => {
      const record = scoreMap?.[holeKey];
      if (!record?.userGross) return;
      const ownsScore = record.source === "toursystem36"
        || !submissionId
        || record.tourSystemSubmissionId === submissionId;
      if (!ownsScore) return;
      const next = { ...record };
      delete next.userGross;
      delete next.tourSystemSubmissionId;
      delete next.tourSystemMatchId;
      delete next.tourSystemOriginalHole;
      if (next.source === "toursystem36") next.source = next.operatorGross ? "manual" : "";
      if (next.conflictStatus === "conflict") next.conflictStatus = next.confirmedGross ? "ok" : "";
      next.updatedAt = row.changed_at || row.changedAt || new Date().toISOString();
      scoreMap[holeKey] = next;
      markScoreLiveUpdated(match.linkedPlayerId, holeKey);
      changed += 1;
    });
    return changed;
  }

function clearTourSystemScoresForMatch(match, keepPlayerId = "") {
    if (!match?.id) return 0;
    const pending = Array.isArray(match.pendingScores) ? match.pendingScores : [];
    const pendingIds = new Set(pending.map(score => window.LB.appUtils.cleanText(score.id)).filter(Boolean));
    const pendingHoles = new Set(pending.map(score => String(score.hole)).filter(Boolean));
    let changed = 0;
    Object.entries(state().scores || {}).forEach(([playerId, scoreMap]) => {
      if (!scoreMap || typeof scoreMap !== "object") return;
      Object.entries(scoreMap).forEach(([holeKey, record]) => {
        const belongsToMatch = record?.tourSystemMatchId === match.id
          || (record?.tourSystemSubmissionId && pendingIds.has(window.LB.appUtils.cleanText(record.tourSystemSubmissionId)));
        if (!belongsToMatch) return;
        const staleForKeptPlayer = playerId === keepPlayerId && !pendingHoles.has(String(record.tourSystemOriginalHole || holeKey));
        if (playerId === keepPlayerId && !staleForKeptPlayer) return;
        const next = { ...record };
        delete next.userGross;
        delete next.tourSystemSubmissionId;
        delete next.tourSystemMatchId;
        delete next.tourSystemOriginalHole;
        if (next.source === "toursystem36") next.source = next.operatorGross ? "manual" : "";
        if (next.conflictStatus === "conflict") next.conflictStatus = next.confirmedGross ? "ok" : "";
        next.updatedAt = new Date().toISOString();
        scoreMap[holeKey] = next;
        markScoreLiveUpdated(playerId, holeKey);
        changed += 1;
      });
    });
    return changed;
  }

function pruneStaleTourSystemScores(authoritativeScoresByMatch = new Map()) {
    let changed = 0;
    (state().ts36Matches || []).forEach(match => {
      const allowedHoles = authoritativeScoresByMatch.get(match.id) || new Set();
      const previousPending = Array.isArray(match.pendingScores) ? match.pendingScores : [];
      match.pendingScores = previousPending.filter(score => {
        const keep = allowedHoles.has(Number(score.hole));
        if (!keep) changed += 1;
        return keep;
      });

      if (!match.linkedPlayerId) return;
      const scoreMap = state().scores[match.linkedPlayerId];
      if (!scoreMap) return;
      Object.keys(scoreMap).forEach(holeKey => {
        const hole = window.LB.scoring.clampInt(holeKey, 1, 18, 0);
        const record = scoreMap[holeKey] || {};
        if (!hole || !record.userGross || allowedHoles.has(hole)) return;
        const next = { ...record };
        delete next.userGross;
        delete next.tourSystemSubmissionId;
        if (next.source === "toursystem36") next.source = next.operatorGross ? "manual" : "";
        if (next.conflictStatus === "conflict") next.conflictStatus = next.confirmedGross ? "ok" : "";
        next.updatedAt = new Date().toISOString();
        scoreMap[holeKey] = next;
        markScoreLiveUpdated(match.linkedPlayerId, hole);
        changed += 1;
      });
    });
    return changed;
  }

function linkTourSystemMatch(matchId, playerId, options = {}) {
    const match = (state().ts36Matches || []).find(item => item.id === matchId);
    const player = state().players.find(item => item.id === playerId);
    if (!match || !player) return 0;
    const previousSuggestedPlayer = match.suggestedPlayerId
      ? state().players.find(item => item.id === match.suggestedPlayerId)
      : null;
    const ts36DivisionName = window.LB.appPlayer.getPreferredSystem36DivisionForPlayer(
      player,
      match.confirmedDivisionName || match.fixedFlightName || match.selectedDivisionName || ""
    );
    if (!ts36DivisionName) {
      window.LB.appTs36.markTourSystemMatchMissingSystem36(match);
      return 0;
    }
    state().players.forEach(item => {
      if (item.id !== player.id && item.tourSystemUserId === match.tourSystemUserId) item.tourSystemUserId = "";
    });
    (state().ts36Matches || []).forEach(item => {
      if (item.id !== match.id && item.linkedPlayerId === player.id) {
        item.linkedPlayerId = "";
        item.status = item.suggestedPlayerId ? "review" : "pending";
        item.reviewNote = "relinked_to_other_ts36_user";
      }
    });
    player.tourSystemUserId = match.tourSystemUserId || player.tourSystemUserId || "";
    player.ts36DisplayName = match.displayName || "";
    player.ts36Email = match.email || "";
    player.ts36VgaId = match.normalizedVgaId || "";
    window.LB.appPlayer.setPlayerSystem36Division(player, ts36DivisionName);
    player.ts36DivisionName = ts36DivisionName;
    player.ts36MatchedAt = new Date().toISOString();
    player.ts36MatchStatus = "confirmed";
    window.LB.appPlayer.ensurePlayerIdentity(player);
    match.linkedPlayerId = player.id;
    match.status = "linked";
    match.confirmedDivisionName = ts36DivisionName;
    match.reviewedAt = new Date().toISOString();
    match.reviewNote = options.source || "operator";
    const changed = window.LB.appPlayer.applyPendingScoresToPlayer(match, player);
    const isRealOverride = previousSuggestedPlayer
      && previousSuggestedPlayer.id !== player.id
      && !window.LB.appUtils.isSameGolferIdentity(previousSuggestedPlayer, player);
    if (isRealOverride) {
      state().alerts.unshift({
        id: `match-${Date.now().toString(36)}`,
        type: "ts36_match_override",
        message: `${match.displayName} được GO link với ${player.name}, khác gợi ý ban đầu.`,
        createdAt: new Date().toISOString()
      });
    }
    match.suggestedPlayerId = player.id;
    match.suggestionScore = 1;
    match.suggestionReason = options.source === "accepted_suggestion" ? match.suggestionReason : "GO đã confirm";
    return changed;
  }

function autoLinkTourSystemMatch(match, player, options = {}) {
    if (!match || !player || window.LB.appTs36.isPlayerLinkedToDifferentTs36(player, match)) return 0;
    const ts36DivisionName = window.LB.appPlayer.getPreferredSystem36DivisionForPlayer(
      player,
      match.confirmedDivisionName || match.fixedFlightName || match.selectedDivisionName || ""
    );
    if (!ts36DivisionName) {
      window.LB.appTs36.markTourSystemMatchMissingSystem36(match);
      return 0;
    }
    state().players.forEach(item => {
      if (item.id !== player.id && item.tourSystemUserId === match.tourSystemUserId) item.tourSystemUserId = "";
    });
    player.tourSystemUserId = match.tourSystemUserId || player.tourSystemUserId || "";
    player.ts36DisplayName = match.displayName || "";
    player.ts36Email = match.email || "";
    player.ts36VgaId = match.normalizedVgaId || "";
    window.LB.appPlayer.setPlayerSystem36Division(player, ts36DivisionName);
    player.ts36DivisionName = ts36DivisionName;
    player.ts36MatchedAt = player.ts36MatchedAt || new Date().toISOString();
    player.ts36MatchStatus = "pending_confirm";
    window.LB.appPlayer.ensurePlayerIdentity(player);
    match.linkedPlayerId = player.id;
    match.status = "linked";
    match.confirmedDivisionName = ts36DivisionName;
    match.reviewNote = options.source || "auto_id_match";
    match.autoLinkedAt = match.autoLinkedAt || new Date().toISOString();
    return window.LB.appPlayer.applyPendingScoresToPlayer(match, player);
  }

function maybeAutoLinkTourSystemMatch(match) {
    if (!match || match.linkedPlayerId || match.status === "linked") return 0;
    if (!match.suggestedPlayerId || Number(match.suggestionScore) < 1) return 0;
    if (!["Trùng ID", "TS36 đã chọn golfer"].includes(match.suggestionReason)) return 0;
    const player = state().players.find(item => item.id === match.suggestedPlayerId);
    return window.LB.appTs36.autoLinkTourSystemMatch(match, player);
  }

function clearTourSystemPlayerLink(player) {
    if (!player) return;
    player.tourSystemUserId = "";
    player.ts36DisplayName = "";
    player.ts36Email = "";
    player.ts36VgaId = "";
    player.ts36DivisionName = "";
    player.ts36MatchedAt = "";
    player.ts36MatchStatus = "";
  }

function resetLocalTourSystemMatchSuggestions() {
    const matches = state().ts36Matches || [];
    state().players.forEach(window.LB.appTs36.clearTourSystemPlayerLink);

    let autoLinked = 0;
    let suggested = 0;
    matches.forEach(match => {
      match.linkedPlayerId = "";
      match.confirmedDivisionName = "";
      match.reviewedAt = "";
      match.autoLinkedAt = "";
      match.reviewNote = "";
      match.status = "pending";

      const suggestion = window.LB.appPlayer.findSuggestedPlayer(match);
      match.suggestedPlayerId = suggestion.player?.id || "";
      match.suggestionScore = suggestion.score || 0;
      match.suggestionReason = suggestion.reason || "";

      if (match.suggestedPlayerId) {
        suggested += 1;
        match.status = "review";
        window.LB.appTs36.autoLinkTourSystemMatch(match, suggestion.player, { source: "reset_suggested_match" });
      }
      if (match.linkedPlayerId && match.status === "linked") autoLinked += 1;
    });

    if (!state().matchReview) state().matchReview = { selectedTs36Id: "", selectedPlayerId: "" };
    state().matchReview.selectedTs36Id = matches[0]?.id || "";
    state().matchReview.selectedPlayerId = matches[0]?.linkedPlayerId || matches[0]?.suggestedPlayerId || "";
    return { autoLinked, suggested, total: matches.length };
  }

async function syncResetTourSystemMatchesToBridge() {
    const linked = state().operator.linkedTournament;
    const code = state().operator.privateCode || state().tournament.operatorPrivateCode || "";
    const bridge = window.LB.supabaseBridge;
    if (!linked?.id || !code || !bridge?.resetOperatorTournamentSuggestedMatches) {
      return { ok: false, reason: "local_only" };
    }
    return bridge.resetOperatorTournamentSuggestedMatches(linked.id, code);
  }

async function syncAcceptedTourSystemMatchToBridge(match, player) {
    const linked = state().operator.linkedTournament;
    const code = state().operator.privateCode || state().tournament.operatorPrivateCode || "";
    const bridge = window.LB.supabaseBridge;
    if (!linked?.id || !code || !match?.tourSystemUserId || !player?.id || !bridge?.acceptOperatorTournamentSuggestedMatch) {
      return { ok: false, reason: "local_only" };
    }
    return bridge.acceptOperatorTournamentSuggestedMatch(linked.id, code, match.tourSystemUserId, player.id);
  }

async function resetTourSystemMatchReview() {
    const matches = state().ts36Matches || [];
    if (!matches.length) {
      alert("Chưa có user TS36 để reset.");
      return;
    }
    if (!confirm("Reset toàn bộ link TS36 hiện tại, tự gợi ý lại và chờ GO confirm?")) return;

    const cloud = await window.LB.appTs36.syncResetTourSystemMatchesToBridge();
    const result = window.LB.appTs36.resetLocalTourSystemMatchSuggestions();
    window.LB.appUtils.persistAndRender();
    scheduleOperatorSnapshotPublish();

    const cloudNote = cloud.ok ? "" : " Supabase bridge chưa sync được, dữ liệu local đã được reset.";
    alert(`Đã reset ${result.total} user TS36. Auto-link ${result.autoLinked} user theo ID, ${result.suggested} user có gợi ý chờ GO confirm.${cloudNote}`);
  }

async function refreshTourSystemScores() {
    const result = await window.LB.appUtils.syncOperatorBridgeData({ silent: false });
    window.LB.storage.saveState();
    window.LB.appUtils.render();
    const total = result.participants + result.scores;
    alert(total ? `Đã nhận ${result.participants} golfer và ${result.scores} dòng điểm từ TourSystem36.` : "Chưa có golfer hoặc điểm TS36 mới cho tournament này.");
  }

async function importTourSystemParticipants() {
    const linked = state().operator.linkedTournament;
    const code = state().operator.privateCode || state().tournament.operatorPrivateCode || "";
    if (!linked?.id || !code) return 0;

    const before = (state().ts36Matches || []).length;
    const rows = await window.LB.supabaseBridge.loadOperatorTournamentParticipants(linked.id, code);
    rows.forEach(row => window.LB.appTs36.upsertTourSystemMatch(row));
    if (rows.length) state().operator.lastParticipantSyncAt = new Date().toISOString();
    return Math.max(0, (state().ts36Matches || []).length - before);
  }

async function importTourSystemScores(options = {}) {
    const linked = state().operator.linkedTournament;
    const code = state().operator.privateCode || state().tournament.operatorPrivateCode || "";
    if (!linked?.id || !code) return 0;

    const savedCursor = state().operator.scoreSyncCursor || {};
    const afterChangeSeq = savedCursor.tournamentId === linked.id
      ? Math.max(0, Number.parseInt(savedCursor.changeSeq, 10) || 0)
      : 0;
    const hadNoLocalScores = !window.LB.appUtils.hasAnyLocalScoreRecord();
    const forceBaseline = options.forceBaseline === true || hadNoLocalScores;
    let result = !forceBaseline && window.LB.supabaseBridge.loadOperatorTournamentScoreChangesWithStatus
      ? await window.LB.supabaseBridge.loadOperatorTournamentScoreChangesWithStatus(linked.id, code, afterChangeSeq)
      : { ok: false, unsupported: true, rows: [] };
    if (forceBaseline || result.unsupported) {
      result = window.LB.supabaseBridge.loadOperatorTournamentScoresWithStatus
        ? await window.LB.supabaseBridge.loadOperatorTournamentScoresWithStatus(linked.id, code)
        : { ok: true, rows: await window.LB.supabaseBridge.loadOperatorTournamentScores(linked.id, code) };
      result.incremental = false;
      result.baseline = true;
    }
    if (
      result.ok
      && result.incremental
      && result.baseline
      && !(result.rows || []).length
      && window.LB.supabaseBridge.loadOperatorTournamentScoresWithStatus
    ) {
      const baselineResult = await window.LB.supabaseBridge.loadOperatorTournamentScoresWithStatus(linked.id, code);
      if (baselineResult.ok && (baselineResult.rows || []).length) {
        result = {
          ...baselineResult,
          incremental: false,
          baseline: true
        };
      }
    }
    if (!result.ok) return 0;
    const rows = result.rows || [];
    const authoritativeScoresByMatch = new Map();
    const touchedPlayerIds = new Set();
    let changed = 0;
    let warningChanged = 0;
    rows.forEach(row => {
      const match = window.LB.appTs36.upsertTourSystemMatch(row);
      if (window.LB.appTs36.upsertStartHoleMismatchWarning(match, row)) warningChanged += 1;
      const isDeletedScore = window.LB.appTs36.isDeletedTourSystemScore(row);
      const pendingChanged = isDeletedScore
        ? window.LB.appTs36.removePendingTourSystemScore(match, row)
        : window.LB.appUtils.appendPendingScore(match, row);
      const hole = window.LB.scoring.clampInt(row.hole, 1, 18, 0);
      const gross = window.LB.scoring.clampInt(row.gross, 1, 30, 0);
      if (match?.id && hole) {
        if (!authoritativeScoresByMatch.has(match.id)) authoritativeScoresByMatch.set(match.id, new Set());
        if (gross && !isDeletedScore) authoritativeScoresByMatch.get(match.id).add(hole);
        else authoritativeScoresByMatch.get(match.id).delete(hole);
      }
      if (match.linkedPlayerId && !isDeletedScore) {
        const player = state().players.find(item => item.id === match.linkedPlayerId);
        if (player) {
          const isSimulator2Score = row.metadata?.simulator2 === true || !!row.metadata?.simulator2ProfileId;
          const hasFixedSimulator2Division = player.operationNote === "simulator2_auto_roster"
            || player.divisionSource === "simulator2_fixed"
            || /^sim2-lb-player-/i.test(window.LB.appUtils.cleanText(player.id || ""));
          const selectedDivision = isSimulator2Score || hasFixedSimulator2Division
            ? (window.LB.appPlayer.getPlayerDivision(player) || player.ts36DivisionName || match.confirmedDivisionName)
            : (row.metadata?.selectedDivisionName || row.metadata?.selectedFlightName || row.metadata?.fixedFlightName || "");
          const selectedConfig = window.LB.appPlayer.getFlightConfigByName(selectedDivision);
          const selectedIsSystem36 = selectedDivision
            && (selectedConfig ? window.LB.appPlayer.isFlightSystem36(selectedConfig, false) : window.LB.appPlayer.isDivisionSystem36(selectedDivision));
          let s36Division = "";
          if (selectedIsSystem36) {
            s36Division = window.LB.appPlayer.setPlayerDivision(player, selectedDivision);
            player.divisionSource = "ts36";
          } else {
            s36Division = window.LB.appPlayer.setPlayerSystem36Division(player, match.confirmedDivisionName || player.ts36DivisionName || "");
          }
          if (s36Division) {
            player.ts36DivisionName = s36Division;
            match.confirmedDivisionName = s36Division;
          }
          changed += window.LB.appPlayer.applyPendingScoresToPlayer(match, player);
          touchedPlayerIds.add(player.id);
        }
      } else if (pendingChanged) {
        changed += pendingChanged === true ? 1 : pendingChanged;
      }
    });
    if (result.baseline || !result.incremental) {
      changed += window.LB.appTs36.pruneStaleTourSystemScores(authoritativeScoresByMatch);
    }
    if (result.incremental) {
      state().operator.scoreSyncCursor = {
        tournamentId: linked.id,
        changeSeq: Math.max(afterChangeSeq, Number.parseInt(result.cursor, 10) || 0)
      };
    }
    state().operator.lastScoreSyncAt = new Date().toISOString();
    if (changed && !options.silent) {
      state().alerts = state().alerts.filter(item => item.type !== "toursystem_sync");
      state().alerts.unshift({
        id: `sync-${Date.now().toString(36)}`,
        type: "toursystem_sync",
        message: `Đã nhận ${changed} thay đổi điểm từ TourSystem36.`,
        createdAt: new Date().toISOString()
      });
    }
    return changed + warningChanged;
  }

  return { isLinkedToTourSystem, markTourSystemMatchMissingSystem36, getPlayerLinkedTourSystemUserId, isPlayerLinkedToDifferentTs36, isTourSystemMatchConfirmed, normalizeTourSystemUser, normalizeStartHoleMismatch, upsertStartHoleMismatchWarning, resolveStartHoleMismatchWarning, upsertTourSystemMatch, isDeletedTourSystemScore, removePendingTourSystemScore, clearTourSystemScoresForMatch, pruneStaleTourSystemScores, linkTourSystemMatch, autoLinkTourSystemMatch, maybeAutoLinkTourSystemMatch, clearTourSystemPlayerLink, resetLocalTourSystemMatchSuggestions, syncResetTourSystemMatchesToBridge, syncAcceptedTourSystemMatchToBridge, resetTourSystemMatchReview, refreshTourSystemScores, importTourSystemParticipants, importTourSystemScores };
})();
