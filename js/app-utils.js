window.LB = window.LB || {};
window.LB.appUtils = (function() {
  const state = () => window.LB.state;

function getCapabilities() {
    return window.LB.getCapabilities
      ? window.LB.getCapabilities()
      : {
          runtimeMode: "local",
          operationMode: state().operator?.linkedTournament?.id ? "fixed" : "local",
          linked: Boolean(state().operator?.linkedTournament?.id),
          cloudRuntime: false,
          canUseBridge: Boolean(state().operator?.linkedTournament?.id),
          canUseLocalServices: true,
          canUseSimulator: true,
          canPublishRoster: Boolean(state().operator?.linkedTournament?.id),
          canPollTourSystemScores: Boolean(state().operator?.linkedTournament?.id)
        };
  }

function readPositiveInt(value, fallback) {
    const parsed = Number(value);
    return Number.isFinite(parsed) && parsed > 0 ? Math.trunc(parsed) : fallback;
  }

function clampMs(value, min, max, fallback) {
    const parsed = window.LB.appUtils.readPositiveInt(value, fallback);
    return Math.max(min, Math.min(max, parsed));
  }

function getOperatorScorePollSeconds() {
    return Math.round(getOperatorScorePollMs() / 1000);
  }

function escapeHtml(value = "") {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

function cleanText(value = "") {
    return String(value ?? "").replace(/\s+/g, " ").trim();
  }

function normalizeOperationNote(value = "") {
    return window.LB.appUtils.cleanText(value)
      .replace(/\bko\s*tính\s*giải\b,?\s*/gi, "")
      .replace(/\bko\s*tinh\s*giai\b,?\s*/gi, "")
      .replace(/^,\s*|,\s*$/g, "")
      .replace(/\s*,\s*,\s*/g, ", ")
      .replace(/\s{2,}/g, " ")
      .trim();
  }

function prefixOperationNote(value = "") {
    const rest = window.LB.appUtils.normalizeOperationNote(value);
    return rest ? `Ko tính giải, ${rest}` : "Ko tính giải";
  }

function stripAccents(value = "") {
    return window.LB.appUtils.cleanText(value).normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  }

function normalizeSearchText(value = "") {
    return window.LB.appUtils.stripAccents(value).toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  }

function keyText(value = "") {
    return window.LB.appUtils.normalizeSearchText(value);
  }

function normalizeVgaId(value = "") {
    return window.LB.ocr?.normalizeVgaId
      ? window.LB.ocr.normalizeVgaId(value)
      : window.LB.appUtils.cleanText(value).toUpperCase().replace(/[^A-Z0-9]/g, "");
  }

function hasSystem36RosterMarker(division = "") {
    const target = window.LB.appUtils.cleanText(division).toLowerCase();
    if (!target) return false;
    const rows = [
      ...(Array.isArray(state().players) ? state().players : []),
      ...(Array.isArray(state().operator?.publishedRosterSnapshot) ? state().operator.publishedRosterSnapshot : [])
    ];
    return rows.some(row => {
      const rowDivision = window.LB.appUtils.cleanText(row?.division || row?.flight || "").toLowerCase();
      if (rowDivision !== target) return false;
      const mode = window.LB.appUtils.cleanText(row?.scoringMode || row?.scoring_mode || "").toLowerCase();
      return mode === "system36" || row?.isSystem36Division === true || row?.isSystem36 === true;
    });
  }

function extractStartHoleNumber(value = "") {
    const raw = window.LB.appUtils.cleanText(value).toUpperCase();
    const match = raw.match(/(?:^|[^0-9])(1[0-8]|[1-9])(?:[^0-9]|$)|^(1[0-8]|[1-9])$/);
    const hole = match ? Number(match[1] || match[2]) : 0;
    return hole >= 1 && hole <= 18 ? String(hole) : "";
  }

function cloneScoreMap(scoreMap = {}) {
    return JSON.parse(JSON.stringify(scoreMap || {}));
  }

function findRestorableScoreMap(player, indexes = []) {
    const keys = window.LB.appSnapshot.getRosterScoreRestoreKeys(player);
    for (const key of keys) {
      for (const index of indexes) {
        const scoreMap = index?.get?.(key);
        if (scoreMap && Object.keys(scoreMap).length) return window.LB.appUtils.cloneScoreMap(scoreMap);
      }
    }
    return {};
  }

function playerMatchesPublicGolfId(player = {}, externalId = "") {
    const key = window.LB.appUtils.normalizeVgaId(externalId) || window.LB.appUtils.cleanText(externalId);
    if (!key) return false;
    window.LB.appPlayer.ensurePlayerIdentity(player);
    return [player.vgaId, player.golferId].some(value => window.LB.appUtils.normalizeVgaId(value) === key);
  }

function isSameGolferIdentity(left = {}, right = {}) {
    if (!left || !right) return false;
    const leftId = window.LB.appUtils.normalizeVgaId(left.vgaId || left.golferId || "");
    const rightId = window.LB.appUtils.normalizeVgaId(right.vgaId || right.golferId || "");
    if (leftId && rightId && leftId === rightId) return true;
    const leftName = window.LB.appUtils.keyText(left.name || "");
    const rightName = window.LB.appUtils.keyText(right.name || "");
    return !!leftName && leftName === rightName;
  }

function nameSimilarity(left = "", right = "") {
    const a = window.LB.appUtils.keyText(left);
    const b = window.LB.appUtils.keyText(right);
    if (!a || !b) return 0;
    if (a === b) return 1;
    if (a.includes(b) || b.includes(a)) return 0.86;
    const aTokens = new Set(a.split(" ").filter(token => token.length > 1));
    const bTokens = new Set(b.split(" ").filter(token => token.length > 1));
    if (!aTokens.size || !bTokens.size) return 0;
    let overlap = 0;
    aTokens.forEach(token => {
      if (bTokens.has(token)) overlap += 1;
    });
    return (2 * overlap) / (aTokens.size + bTokens.size);
  }

function appendPendingScore(match, row = {}) {
    if (!match) return false;
    if (window.LB.appTs36.isDeletedTourSystemScore(row)) return false;
    const hole = window.LB.scoring.clampInt(row.hole, 1, 18, 0);
    const gross = window.LB.scoring.clampInt(row.gross, 1, 30, 0);
    if (!hole || !gross) return false;
    const id = window.LB.appUtils.cleanText(row.id || `${match.id}-${hole}-${row.submitted_at || gross}`);
    match.pendingScores = Array.isArray(match.pendingScores) ? match.pendingScores : [];
    const previous = match.pendingScores.find(item => item.id === id || item.hole === hole);
    const score = {
      id,
      hole,
      gross,
      submittedAt: row.submitted_at || row.submittedAt || new Date().toISOString(),
      sourceRow: row
    };
    if (previous && previous.gross === gross) return false;
    if (previous) Object.assign(previous, score);
    else match.pendingScores.push(score);
    match.updatedAt = new Date().toISOString();
    return true;
  }

function getEffectivePendingScoreHole(match, player, score) {
    const rawHole = window.LB.scoring.clampInt(score?.hole, 1, 18, 0);
    const metadata = score?.sourceRow?.metadata || {};
    const claimedPlayerId = window.LB.appUtils.cleanText(
      match?.claimedPlayerId ||
      score?.sourceRow?.leaderboard_player_id ||
      metadata.leaderboardPlayerId ||
      metadata.claimedLeaderboardPlayerId ||
      metadata.claimedPlayerId ||
      ""
    );
    const isSimulator2WrongClaim = metadata.simulator2 === true
      && claimedPlayerId
      && player?.id
      && claimedPlayerId !== player.id;
    if (!isSimulator2WrongClaim) return rawHole;
    return window.LB.scoring.clampInt(player.startHole || player.flightGroup || player.group, 1, 18, rawHole);
  }

function getScoreKey(playerId, hole) {
    return `${String(playerId || "").replace(/[^a-z0-9-]/gi, "_")}-${Number(hole) || 0}`;
  }

function hasAnyLocalScoreRecord() {
    return Object.values(state().scores || {}).some(scoreMap => (
      scoreMap && typeof scoreMap === "object" && Object.keys(scoreMap).length > 0
    ));
  }

function hasAnyConfirmedPublicScoreRecord() {
    return Object.values(state().scores || {}).some(scoreMap => (
      scoreMap && typeof scoreMap === "object" && Object.values(scoreMap).some(record => (
        window.LB.scoring.clampInt(record?.confirmedGross, 1, 30, 0) > 0
      ))
    ));
  }

function snapshotHasConfirmedPublicScores(snapshot = {}) {
    return (Array.isArray(snapshot.leaderboard) ? snapshot.leaderboard : []).some(row => (
      row?.holeScores && Object.values(row.holeScores).some(value => (
        window.LB.scoring.clampInt(value, 1, 30, 0) > 0
      ))
    ));
  }

function hasPublishableLeaderboardData(snapshot = null) {
    if (window.LB.appUtils.hasAnyConfirmedPublicScoreRecord()) return true;
    return window.LB.appUtils.snapshotHasConfirmedPublicScores(snapshot);
  }

async function loadOperatorCatalogOnDemand(notify = false) {
    await window.LB.appUtils.checkSupabaseStatus(false);
    return window.LB.appUtils.loadOperatorTournaments(notify);
  }

function startLinkedRuntimeServices() {
    restartOperatorBridgePolling();
    scheduleOperatorSnapshotPublish();
    if (window.LB.runtimeAdapter?.onLinkedTournament) {
      void window.LB.runtimeAdapter.onLinkedTournament(state().operator.linkedTournament);
    }
  }

function renderOperationModeVisibility() {
    const capabilities = window.LB.appUtils.getCapabilities();
    document.body.dataset.runtimeMode = capabilities.runtimeMode;
    document.body.dataset.operationMode = capabilities.operationMode;

    document.querySelectorAll("[data-requires-ts36='true']").forEach(element => {
      element.hidden = !capabilities.canUseBridge;
    });
    document.querySelectorAll("[data-view='simulator'], [data-view='simulator2']").forEach(element => {
      element.hidden = !capabilities.canUseSimulator;
    });
    document.querySelectorAll("#view-simulator, #view-simulator2").forEach(element => {
      if (!capabilities.canUseSimulator) element.classList.remove("active");
    });

    const integrationView = document.getElementById("view-integration");
    if (!capabilities.canUseBridge && integrationView?.classList.contains("active")) {
      window.LB.appUtils.showView("dashboard");
    }

    const syncStatus = document.getElementById("sync-status");
    if (syncStatus) {
      syncStatus.hidden = !capabilities.canUseBridge && !capabilities.cloudRuntime;
      if (!capabilities.canUseBridge) {
        syncStatus.textContent = capabilities.cloudRuntime ? "Cloud · Chưa vào giải" : "Local";
        syncStatus.classList.remove("is-online", "is-error");
      }
    }

    if (!capabilities.canUseBridge) stopUnlinkedRuntimeServices();
  }

function finishLinkedTournamentEntry() {
    window.LB.appUtils.renderOperationModeVisibility();
    window.LB.appUtils.startLinkedRuntimeServices();
  }

function hydrateControls() {
    const start = document.getElementById("start-hole");
    if (start && !start.children.length) {
      for (let hole = 1; hole <= 18; hole += 1) {
        const option = document.createElement("option");
        option.value = String(hole);
        option.textContent = `Hố ${hole}`;
        start.appendChild(option);
      }
    }
  }

function bindEvents() {
    document.body.addEventListener("click", handleClick);
    document.body.addEventListener("pointerdown", window.LB.appUtils.handleTouchTooltipPointerDown, true);
    document.body.addEventListener("dblclick", window.LB.appUtils.handleDoubleClick);
    document.body.addEventListener("input", window.LB.appUtils.handleInput);
    document.body.addEventListener("change", window.LB.appUtils.handleChange);
    document.body.addEventListener("keydown", handleKeydown);
    document.body.addEventListener("blur", window.LB.appUtils.handleBlur, true);
    document.body.addEventListener("paste", window.LB.appUtils.handlePaste);
    document.body.addEventListener("focusin", window.LB.appUtils.handleFocusin);
    document.body.addEventListener("blur", window.LB.appUtils.handleSearchBlur, true);
    document.body.addEventListener("pointerdown", window.LB.appUtils.handleSearchPointerDown, true);
    document.body.addEventListener("pointerup", handleSearchPointerUp, true);
    document.body.addEventListener("pointercancel", handleSearchPointerUp, true);
    window.addEventListener("scroll", hideTouchTooltip, { passive: true });
    window.addEventListener("scroll", handleWindowScroll, { passive: true });
    window.addEventListener("scroll", scheduleScoreFlyHeaderUpdate, { passive: true });
    window.addEventListener("resize", window.LB.appUtils.invalidateScoreFlyHeader, { passive: true });
    window.addEventListener("resize", window.LB.appUtils.syncMobileDashboardOverviewForViewport, { passive: true });
    document.getElementById("tournament-form")?.addEventListener("submit", event => event.preventDefault());
    document.getElementById("settings-form")?.addEventListener("submit", event => event.preventDefault());
    document.getElementById("ocr-form")?.addEventListener("submit", event => event.preventDefault());
    document.getElementById("workspace-backup-file")?.addEventListener("change", window.LB.appUtils.importWorkspaceBackupFile);
  }

function getTooltipText(element) {
    return window.LB.appUtils.cleanText(element?.dataset?.tooltip || element?.getAttribute?.("title") || element?.getAttribute?.("aria-label") || "");
  }

function showTouchTooltip(anchor, text) {
    if (!anchor || !text) return;
    hideTouchTooltip();
    const tooltip = document.createElement("div");
    tooltip.id = "lb-touch-tooltip";
    tooltip.className = "touch-tooltip";
    tooltip.textContent = text;
    document.body.appendChild(tooltip);

    const anchorRect = anchor.getBoundingClientRect();
    const tooltipRect = tooltip.getBoundingClientRect();
    const viewportWidth = document.documentElement.clientWidth || window.innerWidth;
    const gap = 8;
    const x = Math.min(
      Math.max(gap, anchorRect.left + (anchorRect.width / 2) - (tooltipRect.width / 2)),
      Math.max(gap, viewportWidth - tooltipRect.width - gap)
    );
    const above = anchorRect.top > tooltipRect.height + 18;
    const y = above
      ? anchorRect.top + window.scrollY - tooltipRect.height - gap
      : anchorRect.bottom + window.scrollY + gap;
    tooltip.style.left = `${Math.round(x)}px`;
    tooltip.style.top = `${Math.round(y)}px`;
    tooltip.dataset.placement = above ? "top" : "bottom";
    touchTooltipTimer = window.setTimeout(hideTouchTooltip, 3600);
  }

function handleTouchTooltipPointerDown(event) {
    const anchor = event.target.closest?.(".field-help-badge, .final-technical-help, [data-touch-tooltip]");
    if (!anchor) {
      if (!event.target.closest?.("#lb-touch-tooltip")) hideTouchTooltip();
      return;
    }
    const text = window.LB.appUtils.getTooltipText(anchor);
    if (!text) return;
    anchor.dataset.tooltip = text;
    anchor.setAttribute("aria-label", text);
    if (!anchor.hasAttribute("tabindex")) anchor.setAttribute("tabindex", "0");
    window.LB.appUtils.showTouchTooltip(anchor, text);
  }

function applyCollapsiblePanelState(panel, title, collapsed, label) {
    if (!panel || !title) return;
    panel.classList.toggle("is-collapsed", collapsed);
    title.setAttribute("aria-expanded", collapsed ? "false" : "true");
    const button = title.querySelector(".panel-collapse-button");
    if (!button) return;
    const actionLabel = collapsed ? `Mở ${label}` : `Thu gọn ${label}`;
    button.setAttribute("aria-label", actionLabel);
    button.title = collapsed ? "Mở rộng" : "Thu gọn";
  }

function restoreSearchFocus(input, wasActive = false) {
    const id = input?.id || "";
    if (!id || !wasActive) return;
    const start = input.selectionStart;
    const end = input.selectionEnd;
    window.requestAnimationFrame(() => {
      const next = document.getElementById(id);
      if (!next) return;
      next.focus({ preventScroll: true });
      try {
        next.setSelectionRange(start ?? next.value.length, end ?? next.value.length);
      } catch (_err) {
        // Search inputs on some browsers reject selection ranges for non-text states.
      }
    });
  }

function applyScopedSearchQuery(input) {
    const value = input?.value || "";
    const scope = input?.dataset?.searchScope || "players";
    if (scope === "score-entry") {
      scoreEntrySearchInputValue = value;
      scoreEntrySearchQuery = window.LB.appUtils.normalizeSearchText(value);
      renderScoreTable();
      return;
    }
    if (scope === "final-dq") {
      const wasActive = document.activeElement === input;
      finalDqSearchInputValue = value;
      finalDqSearchQuery = window.LB.appUtils.normalizeSearchText(value);
      renderFinalResultsPanel();
      window.LB.appUtils.restoreSearchFocus(input, wasActive);
      return;
    }
    if (scope === "ts36-match") {
      const wasActive = document.activeElement === input;
      ts36MatchSearchInputValue = value;
      ts36MatchSearchQuery = window.LB.appUtils.normalizeSearchText(value);
      renderTs36MatchReview();
      window.LB.appUtils.restoreSearchFocus(input, wasActive);
      return;
    }
    if (scope === "roster-match") {
      const wasActive = document.activeElement === input;
      rosterMatchSearchInputValue = value;
      rosterMatchSearchQuery = window.LB.appUtils.normalizeSearchText(value);
      renderTs36MatchReview();
      window.LB.appUtils.restoreSearchFocus(input, wasActive);
      return;
    }
    applyPlayerSearchQuery(value);
  }

function applyMobileOverviewPanelState(panel, title, collapsed, label) {
    if (!panel || !title) return;
    panel.classList.toggle("is-mobile-overview-collapsed", collapsed);
    title.setAttribute("aria-expanded", collapsed ? "false" : "true");
    const button = title.querySelector(".mobile-overview-collapse-button");
    if (!button) return;
    const actionLabel = collapsed ? `Mở ${label}` : `Thu gọn ${label}`;
    button.setAttribute("aria-label", actionLabel);
    button.title = collapsed ? "Mở rộng" : "Thu gọn";
  }

function preserveMobileDashboardScrollAnchor(update) {
    const topbarBottom = document.querySelector(".app-topbar")?.getBoundingClientRect().bottom || 0;
    const anchor = [
      document.querySelector(".flight-config-panel"),
      document.querySelector(".player-panel"),
      document.getElementById("final-results-panel")
    ].find(element => element && element.getBoundingClientRect().bottom > topbarBottom + 40);
    const anchorTop = anchor?.getBoundingClientRect().top;
    update();
    if (!anchor || !Number.isFinite(anchorTop)) return;
    window.requestAnimationFrame(() => {
      const nextAnchorTop = anchor.getBoundingClientRect().top;
      const adjustment = nextAnchorTop - anchorTop;
      if (Math.abs(adjustment) < 1) return;
      const root = document.documentElement;
      const previousScrollBehavior = root.style.scrollBehavior;
      root.style.scrollBehavior = "auto";
      window.scrollTo(0, Math.max(0, window.scrollY + adjustment));
      root.style.scrollBehavior = previousScrollBehavior;
      mobileDashboardLastScrollY = window.scrollY;
    });
  }

function setMobileDashboardOverviewCollapsed(collapsed) {
    mobileTournamentOverviewCollapsed = !!collapsed;
    mobileLiveOverviewCollapsed = !!collapsed;
    mobileDashboardDownTravel = 0;
    mobileDashboardUpTravel = 0;
    mobileDashboardScrollCooldownUntil = Date.now() + 520;
    window.LB.appUtils.preserveMobileDashboardScrollAnchor(applyMobileDashboardOverviewState);
    window.requestAnimationFrame(() => {
      mobileDashboardLastScrollY = window.scrollY;
    });
  }

function syncMobileDashboardOverviewForViewport() {
    const isMobile = window.matchMedia("(max-width: 640px)").matches;
    if (!isMobile) {
      mobileTournamentOverviewCollapsed = false;
      mobileLiveOverviewCollapsed = false;
    }
    mobileDashboardLastScrollY = window.scrollY;
    mobileDashboardDownTravel = 0;
    mobileDashboardUpTravel = 0;
    applyMobileDashboardOverviewState();
  }

function handleDoubleClick(event) {
    const target = event.target.closest('[data-action="select-roster-player"]');
    if (!target) return;
    const matchId = state().matchReview.selectedTs36Id || "";
    const playerId = target.dataset.playerId || "";
    if (!matchId || !playerId) return;
    event.preventDefault();
    window.LB.appTs36.linkTourSystemMatch(matchId, playerId, { source: "double_click" });
    window.LB.appUtils.persistAndRender();
    scheduleOperatorSnapshotPublish();
  }

function getScoreGridRows() {
    const rowSelector = window.matchMedia("(max-width: 640px)").matches
      ? ".score-mobile-player"
      : ".score-table .score-row";
    return Array.from(document.querySelectorAll(rowSelector))
      .filter(row => row.getClientRects().length)
      .map(row => Array.from(row.querySelectorAll(".score-input")));
  }

function handleScoreGridKeydown(event) {
    const input = event.target.closest(".score-input");
    if (!input) return false;
    const directions = {
      ArrowLeft: [0, -1],
      ArrowRight: [0, 1],
      ArrowUp: [-1, 0],
      ArrowDown: [1, 0],
      Enter: [event.shiftKey ? -1 : 1, 0]
    };
    const movement = directions[event.key];
    if (!movement) return false;

    event.preventDefault();
    const rows = window.LB.appUtils.getScoreGridRows();
    const rowIndex = rows.findIndex(row => row.includes(input));
    const columnIndex = rowIndex >= 0 ? rows[rowIndex].indexOf(input) : -1;
    if (rowIndex < 0 || columnIndex < 0) return true;
    const nextRow = Math.max(0, Math.min(rows.length - 1, rowIndex + movement[0]));
    const nextColumn = Math.max(0, Math.min(rows[nextRow].length - 1, columnIndex + movement[1]));
    const nextInput = rows[nextRow][nextColumn];
    if (!nextInput || nextInput === input) {
      input.select();
      return true;
    }

    pendingScoreGridFocus = {
      playerId: nextInput.dataset.playerId,
      hole: nextInput.dataset.hole
    };
    input.blur();
    return true;
  }

function handleInput(event) {
    const target = event.target;
    if (target.id === "ocr-preview-zoom") {
      setOcrPreviewScale(Number(target.value) / 100, { syncSlider: false });
      return;
    }
    if (target.closest?.("#final-results-panel")) {
      if (target.classList?.contains("player-search")) {
        window.LB.appUtils.applyScopedSearchQuery(target);
        return;
      }
      handleFinalResultsInput(target);
      window.LB.storage.saveState();
      return;
    }
    let shouldRenderRoster = false;
    let shouldRenderScoreTable = false;
    let shouldRenderCourseGrid = false;
    if (target.id === "tournament-name") state().tournament.name = target.value;
    if (target.id === "operator-name") state().tournament.operatorName = target.value;
    if (target.id === "course-name") {
      state().tournament.courseName = target.value;
      if (!window.LB.appUtils.getCapabilities().cloudRuntime) {
        if (applyOfflineCourseSelection(target.value, { updateInput: false })) {
          shouldRenderCourseGrid = true;
          shouldRenderScoreTable = true;
        } else if (window.LB.appPlayer.clearOfflineCourseSelectionLock(target.value)) {
          shouldRenderCourseGrid = true;
        }
      }
    }
    if (target.id === "course-rating-male") {
      state().tournament.handicapRatings.male.courseRating = target.value;
      window.LB.appPlayer.recomputeCourseHandicapsFromIndex();
      shouldRenderRoster = true;
    }
    if (target.id === "slope-rating-male") {
      state().tournament.handicapRatings.male.slopeRating = target.value;
      window.LB.appPlayer.recomputeCourseHandicapsFromIndex();
      shouldRenderRoster = true;
    }
    if (target.id === "course-rating-female") {
      state().tournament.handicapRatings.female.courseRating = target.value;
      window.LB.appPlayer.recomputeCourseHandicapsFromIndex();
      shouldRenderRoster = true;
    }
    if (target.id === "slope-rating-female") {
      state().tournament.handicapRatings.female.slopeRating = target.value;
      window.LB.appPlayer.recomputeCourseHandicapsFromIndex();
      shouldRenderRoster = true;
    }
    if (target.id === "operator-private-code") {
      const code = target.value.replace(/\D/g, "").slice(0, 4);
      target.value = code;
      state().operator.privateCode = code;
      state().tournament.operatorPrivateCode = code;
    }
    if (target.id === "start-hole") state().tournament.startHole = window.LB.scoring.clampInt(target.value, 1, 18, 1);

    if (target.closest(".course-hole") && target.matches("input")) {
      if (window.LB.appUtils.getCapabilities().cloudRuntime || window.LB.appPlayer.isOfflineCourseSelectionLocked() || target.readOnly) return;
      const hole = parseInt(target.closest(".course-hole").dataset.hole, 10);
      const holeConfig = window.LB.scoring.getHoleConfig(state(), hole);
      const numericValue = target.value.replace(/\D/g, "");
      if (target.value !== numericValue) target.value = numericValue;
      if (numericValue) {
        if (target.dataset.field === "par") {
          holeConfig.par = window.LB.scoring.clampInt(numericValue, 3, 6, 4);
          target.value = String(holeConfig.par);
        }
        if (target.dataset.field === "si") {
          holeConfig.strokeIndex = window.LB.scoring.clampInt(numericValue, 1, 18, hole);
          target.value = String(holeConfig.strokeIndex);
        }
        shouldRenderScoreTable = true;
        window.LB.appFinal.invalidatePublishedFinalResults();
      }
    }

    if (target.closest(".player-row")) {
      const player = state().players.find(item => item.id === target.closest(".player-row").dataset.playerId);
      if (player) {
        const field = target.dataset.field;
        if (field === "name") player.name = target.value;
        if (field === "vgaId") {
          const nextId = window.LB.appUtils.normalizeVgaId(target.value);
          if (!nextId) {
            player.vgaId = "";
            player.golferId = /^CLW\d{4,}$/i.test(player.golferId || "") ? player.golferId : "";
          } else {
            player.vgaId = /^CLW\d{4,}$/i.test(nextId) ? "" : nextId;
            player.golferId = nextId;
          }
          window.LB.appPlayer.ensurePlayerIdentity(player);
          window.LB.appPlayer.markPlayerProfileReviewPending(player);
          player.vgaNeedsReview = true;
          target.classList.add("is-review-field");
        }
        if (field === "handicapIndex") {
          const existingCourseHandicap = window.LB.appPlayer.getPlayerCourseHandicapValue(player);
          const preserveManualCourseHandicap = window.LB.appPlayer.hasCourseHandicapLock(player) && window.LB.appPlayer.hasNumericPlayerValue(existingCourseHandicap);
          const nextIndex = target.value === "" ? "" : window.LB.scoring.clampNumber(target.value, -10, 54, 0);
          player.handicapIndex = nextIndex;
          player.courseHandicapLocked = preserveManualCourseHandicap && nextIndex === "";
          player.handicapSource = nextIndex === ""
            ? (preserveManualCourseHandicap ? "course_handicap_manual" : "")
            : "whs_index_manual";
          if (nextIndex === "") {
            player.handicap = preserveManualCourseHandicap ? existingCourseHandicap : "";
            player.courseHandicap = preserveManualCourseHandicap ? existingCourseHandicap : "";
          } else {
            player.handicap = window.LB.appPlayer.calculateCourseHandicap(nextIndex, player.gender);
            player.courseHandicap = player.handicap;
          }
          window.LB.appPlayer.markPlayerProfileReviewPending(player);
          player.handicapIndexNeedsReview = true;
          player.courseHandicapNeedsReview = true;
          if (player.divisionSource !== "import" && player.divisionSource !== "manual") {
            if (window.LB.appPlayer.hasNumericPlayerValue(player.handicap)) {
              window.LB.appPlayer.setPlayerDivision(player, window.LB.appPlayer.getFlightNameForHandicap(player.handicap, player.gender));
            }
          }
          shouldRenderRoster = true;
        }
        if (field === "handicap") {
          if (target.value === "") {
            player.handicap = "";
            player.courseHandicap = "";
            player.courseHandicapLocked = false;
            player.handicapSource = "";
          } else {
            player.handicap = window.LB.scoring.clampNumber(target.value, -10, 54, 0);
            player.courseHandicap = player.handicap;
            player.courseHandicapLocked = true;
            player.handicapSource = "course_handicap_manual";
          }
          window.LB.appPlayer.markPlayerProfileReviewPending(player);
          player.courseHandicapNeedsReview = true;
          if (player.divisionSource !== "import" && player.divisionSource !== "manual") {
            if (window.LB.appPlayer.hasNumericPlayerValue(player.handicap)) {
              window.LB.appPlayer.setPlayerDivision(player, window.LB.appPlayer.getFlightNameForHandicap(player.handicap, player.gender));
            }
          }
          shouldRenderRoster = true;
        }
        if (field === "gender") {
          player.gender = window.LB.appPlayer.normalizeGender(target.value);
          target.value = player.gender;
          if (player.handicapIndex !== "" && player.handicapIndex !== null && player.handicapIndex !== undefined && !window.LB.appPlayer.hasCourseHandicapLock(player)) {
            player.handicap = window.LB.appPlayer.calculateCourseHandicap(player.handicapIndex, player.gender);
            player.courseHandicap = player.handicap;
          }
          if (((state().flightConfig || {}).locked && player.divisionSource !== "import" && player.divisionSource !== "manual") || !window.LB.appPlayer.getPlayerDivision(player)) {
            if (window.LB.appPlayer.hasNumericPlayerValue(window.LB.appPlayer.getPlayerCourseHandicapValue(player))) {
              window.LB.appPlayer.setPlayerDivision(player, window.LB.appPlayer.getFlightNameForHandicap(window.LB.appPlayer.getPlayerCourseHandicapValue(player), player.gender));
            }
          }
          shouldRenderRoster = true;
        }
        if (field === "caddyNumber") {
          player.caddyNumber = target.value;
          window.LB.appUtils.recomputeCaddyDuplicates();
          shouldRenderRoster = false;
          window.LB.appUtils.syncCaddyDuplicateClasses();
        }
        if (field === "awardEligible") {
          const checked = !!target.checked;
          player.awardEligible = checked;
          player.operationNote = checked
            ? window.LB.appUtils.normalizeOperationNote(player.operationNote || player.note || "")
            : window.LB.appUtils.prefixOperationNote(player.operationNote || player.note || "");
          shouldRenderRoster = true;
          shouldRenderScoreTable = true;
        }
        if (field === "operationNote") player.operationNote = target.value;
        if (field === "division") {
          window.LB.appPlayer.setPlayerDivision(player, target.value);
          if (target.value) {
            player.divisionSource = "manual";
            player.divisionNeedsReview = false;
            player.divisionReviewReason = "";
            player.divisionReviewConfirmedAt = new Date().toISOString();
          } else {
            player.divisionNeedsReview = true;
          }
          shouldRenderRoster = true;
        }
        if (field === "flightGroup") {
          const flightGroup = window.LB.appPlayer.normalizeFlightGroupLabel(target.value, player.startHole);
          player.flightGroup = flightGroup;
          player.group = flightGroup;
          player.startHole = window.LB.appPlayer.getStartHoleFromFlightGroup(flightGroup, player.startHole);
          const row = target.closest(".player-row");
          const startHoleInput = row?.querySelector('[data-field="startHole"]');
          if (startHoleInput) startHoleInput.value = player.startHole || "";
          shouldRenderScoreTable = true;
        }
        if (field === "startHole") {
          player.startHole = window.LB.appPlayer.getStartHoleFromFlightGroup(player.flightGroup, target.value);
          window.LB.appPlayer.normalizePlayerFlightAssignment(player);
          shouldRenderRoster = true;
        }
      }
    }

    if (target.classList?.contains("player-search")) {
      window.LB.appUtils.applyScopedSearchQuery(target);
      return;
    }

    if (target.closest(".flight-config-panel")) {
      window.LB.appPlayer.handleFlightConfigInput(target);
      window.LB.appFinal.invalidatePublishedFinalResults();
    }

    if (target.classList.contains("score-input")) {
      const playerId = target.dataset.playerId;
      const hole = target.dataset.hole;
      const gross = parseInt(target.value, 10);
      if (!state().scores[playerId]) state().scores[playerId] = {};
      const previous = state().scores[playerId][hole] || {};
      const operatorGross = Number.isFinite(gross) && gross > 0 ? gross : null;
      const userGross = parseInt(previous.userGross, 10);
      const conflict = operatorGross && Number.isFinite(userGross) && userGross > 0 && userGross !== operatorGross;
      state().scores[playerId][hole] = {
        ...previous,
        operatorGross,
        source: operatorGross ? (previous.source === "ocr" ? "ocr" : "manual") : (previous.userGross ? "toursystem36" : previous.source),
        conflictStatus: conflict ? "conflict" : (operatorGross ? "pending" : (previous.userGross ? "pending" : previous.conflictStatus)),
        ocrPending: (previous.source === "ocr" || previous.ocrPending) && operatorGross
          ? operatorGross !== parseInt(previous.confirmedGross, 10)
          : false,
        updatedAt: new Date().toISOString()
      };
      window.LB.appFinal.invalidatePublishedFinalResults();
    }

    if (target.closest(".player-row") && ["awardEligible", "division", "gender", "handicap", "handicapIndex"].includes(target.dataset.field)) {
      window.LB.appFinal.invalidatePublishedFinalResults();
    }

    if (["tournament-name", "operator-name", "course-name"].includes(target.id)) {
      window.LB.appUtils.ensureLocalShareSlugFromTournament();
    }

    window.LB.storage.saveState();
    if (shouldRenderRoster) {
      window.LB.appPlayer.renderPlayers();
      renderScoreTable();
    } else if (shouldRenderScoreTable) {
      renderScoreTable();
    }
    if (shouldRenderCourseGrid) window.LB.appPlayer.renderCourseGrid();
    window.LB.appUtils.renderLight();
  }

function handleChange(event) {
    const target = event.target;
    if (target.id === "ocr-files") {
      prepareOcrFiles(target.files);
      return;
    }
    if (target.id === "roster-ocr-files") {
      window.LB.appUtils.syncRosterImportFileName(target.files);
      return;
    }
    if (target.id === "course-name") {
      if (window.LB.appUtils.getCapabilities().cloudRuntime) {
        window.LB.appUtils.setValue("course-name", state().tournament.courseName);
        return;
      }
      if (applyOfflineCourseSelection(target.value)) {
        window.LB.storage.saveState();
        window.LB.appPlayer.renderCourseGrid();
        renderScoreTable();
        window.LB.appUtils.renderLight();
      }
      return;
    }
    if (target.id === "operator-tournament-select") {
      state().tournament.operatorTournamentId = target.value || "";
      window.LB.storage.saveState();
    }
    if (target.id === "operator-score-poll-seconds") {
      setOperatorScorePollSeconds(target.value);
      target.value = window.LB.appUtils.getOperatorScorePollSeconds();
      window.LB.storage.saveState();
      restartOperatorBridgePolling();
      renderOperatorTournamentControls();
      return;
    }
    if (target.id === "operator-auto-live-seconds") {
      setOperatorSnapshotAutoPublishSeconds(target.value);
      target.value = window.LB.appSnapshot.getOperatorSnapshotAutoPublishSeconds();
      window.LB.storage.saveState();
      scheduleOperatorSnapshotPublish();
      renderOperatorTournamentControls();
      return;
    }
    if (target.id === "live-notification-retention-mode") {
      setOperatorLiveNotificationRetentionMode(target.value);
      window.LB.storage.saveState();
      scheduleOperatorSnapshotPublish(250);
      renderOperatorTournamentControls();
      return;
    }
    if (target.id === "live-notification-max-age-minutes") {
      target.value = setOperatorLiveNotificationMaxAgeMinutes(target.value);
      window.LB.storage.saveState();
      scheduleOperatorSnapshotPublish(250);
      renderOperatorTournamentControls();
      return;
    }
    if (target.id === "live-notification-max-items") {
      target.value = setOperatorLiveNotificationMaxItems(target.value);
      window.LB.storage.saveState();
      scheduleOperatorSnapshotPublish(250);
      renderOperatorTournamentControls();
      return;
    }
    if (target.closest(".flight-config-panel")) {
      window.LB.appPlayer.handleFlightConfigInput(target);
    }
  }

function handleSearchBlur(event) {
    if (!event.target.closest(".player-search")) return;
    window.LB.appUtils.applyScopedSearchQuery(event.target);
  }

function handleSearchPointerDown(event) {
    if (!event.target.closest(".player-search")) return;
    playerSearchPointerActive = true;
    suppressPanelHeaderToggleUntil = Date.now() + 350;
    event.stopPropagation();
  }

function getNormalizedCaddyNumber(value = "") {
    const raw = window.LB.appUtils.cleanText(value);
    return /^\d+$/.test(raw) ? raw : "";
  }

function recomputeCaddyDuplicates() {
    const seen = new Map();
    const duplicateNumbers = new Set();
    state().players.forEach(player => {
      const numeric = window.LB.appUtils.getNormalizedCaddyNumber(player.caddyNumber);
      player.caddyDuplicate = false;
      if (!numeric) return;
      if (seen.has(numeric)) {
        duplicateNumbers.add(numeric);
        player.caddyDuplicate = true;
        const other = seen.get(numeric);
        if (other) other.caddyDuplicate = true;
      } else {
        seen.set(numeric, player);
      }
    });
    return duplicateNumbers.size;
  }

function syncCaddyDuplicateClasses() {
    document.querySelectorAll('.player-row [data-field="caddyNumber"]').forEach(input => {
      const row = input.closest(".player-row");
      const player = state().players.find(item => item.id === row?.dataset.playerId);
      const duplicate = !!player?.caddyDuplicate && /^\d+$/.test(window.LB.appUtils.cleanText(player.caddyNumber || ""));
      input.classList.toggle("is-caddy-duplicate", duplicate);
    });
  }

function handleBlur(event) {
    if (event.target.classList.contains("score-input")) {
      const record = window.LB.scoring.getScoreRecord(state(), event.target.dataset.playerId, event.target.dataset.hole);
      event.target.closest(".score-cell")?.classList.toggle("is-pending-confirm", window.LB.appUtils.isScorePendingReview(record));
      renderScoreTable();
      window.requestAnimationFrame(focusPendingScoreGridCell);
      return;
    }

    if (event.target.closest(".player-row") && event.target.dataset.field === "caddyNumber") {
      const player = state().players.find(item => item.id === event.target.closest(".player-row").dataset.playerId);
      if (player) {
        player.caddyNumber = event.target.value;
        window.LB.appUtils.recomputeCaddyDuplicates();
        window.LB.storage.saveState();
        window.LB.appUtils.syncCaddyDuplicateClasses();
      }
    }
  }

function applySpreadsheetPaste(playerId, startHole, scores) {
    let changed = false;
    scores.forEach((s, i) => {
      const currentHole = startHole + i;
      if (currentHole > 18) return;
      const gross = parseInt(s, 10);
      if (Number.isFinite(gross) && gross > 0) {
        if (!state().scores[playerId]) state().scores[playerId] = {};
        const previous = state().scores[playerId][currentHole] || {};
        const userGross = parseInt(previous.userGross, 10);
        const conflict = Number.isFinite(userGross) && userGross > 0 && userGross !== gross;
        state().scores[playerId][currentHole] = {
          ...previous,
          operatorGross: gross,
          source: previous.source === "ocr" ? "ocr" : "manual",
          conflictStatus: conflict ? "conflict" : "pending",
          ocrPending: false,
          updatedAt: new Date().toISOString()
        };
        changed = true;
      }
    });
    if (changed) {
      window.LB.storage.saveState();
      renderScoreTable();
      window.LB.appFinal.invalidatePublishedFinalResults();
    }
  }

function handlePaste(event) {
    const target = event.target;
    if (target.classList.contains("score-input")) {
      event.preventDefault();
      const text = (event.clipboardData || window.clipboardData).getData('text');
      const scores = text.split(/[\s,]+/).map(s => String(s).trim().toLowerCase()).filter(Boolean);
      if (!scores.length) return;
      const playerId = target.dataset.playerId;
      const startHole = parseInt(target.dataset.hole, 10);
      window.LB.appUtils.applySpreadsheetPaste(playerId, startHole, scores);
    }
  }

function handleFocusin(event) {
    const target = event.target;
    if (target.classList.contains("score-input") && window.LB.pendingPasteScores && window.LB.pendingPasteScores.length > 0) {
      // Mobile click-to-paste logic
      const scores = window.LB.pendingPasteScores;
      window.LB.pendingPasteScores = null; // Consume
      const playerId = target.dataset.playerId;
      const startHole = parseInt(target.dataset.hole, 10);
      
      const proceed = confirm(`Dán chuỗi điểm đã copy bắt đầu từ hố ${startHole}?`);
      if (proceed) {
        window.LB.appUtils.applySpreadsheetPaste(playerId, startHole, scores);
      }
    }
  }

function getScoreReviewGross(record = {}) {
    const operatorGross = parseInt(record.operatorGross, 10);
    if (Number.isFinite(operatorGross) && operatorGross > 0) return operatorGross;
    const userGross = parseInt(record.userGross, 10);
    return Number.isFinite(userGross) && userGross > 0 ? userGross : 0;
  }

function isScorePendingReview(record = {}) {
    const candidate = window.LB.appUtils.getScoreReviewGross(record);
    const official = parseInt(record.confirmedGross, 10) || 0;
    if (candidate === 0 && official === 0 && !record.ocrPending) return false;
    return candidate !== official || !!record.ocrPending;
  }

function confirmScore(playerId, hole) {
    const record = window.LB.scoring.getScoreRecord(state(), playerId, hole);
    const operatorGross = window.LB.appUtils.getScoreReviewGross(record);
    if (!window.LB.appUtils.isScorePendingReview(record)) return false;
    const finalGross = operatorGross > 0 ? operatorGross : null;
    const userGross = parseInt(record.userGross, 10);
    const conflict = Number.isFinite(userGross) && userGross > 0 && userGross !== finalGross;
    state().scores[playerId][hole] = {
      ...record,
      operatorGross: finalGross,
      confirmedGross: finalGross,
      confirmedAt: new Date().toISOString(),
      conflictStatus: conflict ? "resolved" : "ok",
      ocrPending: false
    };
    window.LB.appFinal.invalidatePublishedFinalResults();

    if (conflict) {
      const player = state().players.find(item => item.id === playerId);
      state().alerts.unshift({
        id: `a-${Date.now().toString(36)}`,
        type: "score_conflict",
        playerId,
        hole: Number(hole),
        message: `${player?.name || "Golfer"} H${hole}: TS36 gửi ${userGross}, operator confirm ${operatorGross}.`,
        createdAt: new Date().toISOString()
      });
    }
    return true;
  }

function showView(view) {
    if (view === "integration" && !window.LB.appUtils.getCapabilities().canUseBridge) {
      view = "dashboard";
    }
    if ((view === "simulator" || view === "simulator2") && !window.LB.appUtils.getCapabilities().canUseSimulator) {
      view = "dashboard";
    }
    document.querySelectorAll(".view").forEach(item => item.classList.toggle("active", item.id === `view-${view}`));
    document.querySelectorAll("[data-action='show-view']").forEach(btn => btn.classList.toggle("active", btn.dataset.view === view));
    mobileDashboardLastScrollY = window.scrollY;
    mobileDashboardDownTravel = 0;
    mobileDashboardUpTravel = 0;
    if (view !== "dashboard") window.LB.appUtils.setMobileDashboardOverviewCollapsed(false);
    handleWindowScroll();
    scheduleScoreFlyHeaderUpdate();
    if (view === "leaderboard") renderLeaderboard();
    if (view === "settings" && window.LB.appUtils.getCapabilities().canUseLocalServices) window.LB.appUtils.loadServiceSettings(false);
  }

function scrollToTop() {
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

function isBackToTopViewActive() {
    return !!document.querySelector(
      "#view-dashboard.active, #view-imports.active, #view-leaderboard.active"
    );
  }

function setupBackToTopVisibility() {
    const button = document.getElementById("back-to-top-fab");
    if (!button) return;
    const toggle = () => {
      button.classList.toggle(
        "is-visible",
        window.scrollY > 320 && window.LB.appUtils.isBackToTopViewActive()
      );
    };
    toggle();
    window.addEventListener("scroll", toggle, { passive: true });
  }

function persistAndRender() {
    window.LB.storage.saveState();
    window.LB.appUtils.render();
  }

function render() {
    window.LB.appUtils.renderOperationModeVisibility();
    renderSimulatorLocalOnlyState();
    window.LB.appUtils.renderTournamentForm();
    renderOfflineCourseCatalogOptions();
    renderOfflineCourseStatus();
    renderOperatorTournamentControls();
    window.LB.appPlayer.renderCourseGrid();
    window.LB.appPlayer.renderFlightConfigPanel();
    window.LB.appPlayer.renderPlayers();
    renderScoreTable();
    renderLeaderboard();
    renderFinalResultsPanel();
    renderTs36MatchReview();
    window.LB.appUtils.renderSummary();
    window.LB.appUtils.renderPlan();
    handleWindowScroll();
    window.LB.appUtils.renderOperationModeVisibility();
  }

function getActiveSimulationMode() {
    if (state().simulator?.active === true) {
      const sim = state().simulator || {};
      return {
        active: true,
        mode: "simulator",
        title: "Simulator local-only, không ghi cloud",
        detail: sim.running ? "Đang chạy Giả lập" : "Đang giữ state Giả lập"
      };
    }
    if (state().simulator2?.active === true) {
      const sim2 = state().simulator2 || {};
      return {
        active: true,
        mode: "simulator2",
        title: "Đang chạy Giả lập 2",
        detail: sim2.message || (sim2.running ? "TS36 account lab đang thao tác dữ liệu test" : "Đang giữ context test của Giả lập 2")
      };
    }
    return { active: false, mode: "", title: "", detail: "" };
  }

function setSimulator2Mode(input = {}) {
    const active = input.active === true;
    if (!active) {
      if (state().simulator2) {
        state().simulator2 = {
          ...state().simulator2,
          active: false,
          running: false,
          action: "",
          message: input.message || "",
          updatedAt: new Date().toISOString()
        };
      }
    } else {
      state().simulator2 = {
        ...(state().simulator2 || {}),
        active: true,
        running: input.running === true,
        action: input.action || state().simulator2?.action || "",
        message: input.message || state().simulator2?.message || "TS36 account lab đang chạy dữ liệu test",
        openProfiles: Number.isFinite(Number(input.openProfiles)) ? Number(input.openProfiles) : state().simulator2?.openProfiles || 0,
        scorePollMs: getOperatorScorePollMs(),
        snapshotAutoPublishMs: getOperatorSnapshotAutoPublishMs(),
        scenarioReady: input.scenarioReady === true,
        updatedAt: new Date().toISOString()
      };
    }
    window.LB.storage.saveState();
    renderSimulatorLocalOnlyState();
    if (active) {
      void publishOperatorLinkSnapshot({ silent: true, skipIfUnchanged: false });
    }
  }

function renderLight() {
    renderLeaderboard();
    renderFinalResultsPanel();
    window.LB.appUtils.renderSummary();
  }

function renderTournamentForm() {
    const t = state().tournament;
    window.LB.appUtils.setValue("tournament-name", t.name);
    window.LB.appUtils.setValue("operator-name", t.operatorName);
    window.LB.appUtils.setValue("course-name", t.courseName);
    [
      "tournament-name",
      "operator-name",
      "course-name",
      "course-rating-male",
      "slope-rating-male",
      "course-rating-female",
      "slope-rating-female"
    ].forEach(id => {
      const input = document.getElementById(id);
      if (!input) return;
      input.readOnly = false;
      input.classList.remove("is-mode3-readonly");
      input.title = "";
    });
    window.LB.appUtils.setValue("start-hole", t.startHole);
    state().tournament.handicapRatings = {
      male: { courseRating: "", slopeRating: "", ...(state().tournament.handicapRatings?.male || {}) },
      female: { courseRating: "", slopeRating: "", ...(state().tournament.handicapRatings?.female || {}) }
    };
    window.LB.appUtils.setValue("course-rating-male", state().tournament.handicapRatings.male.courseRating);
    window.LB.appUtils.setValue("slope-rating-male", state().tournament.handicapRatings.male.slopeRating);
    window.LB.appUtils.setValue("course-rating-female", state().tournament.handicapRatings.female.courseRating);
    window.LB.appUtils.setValue("slope-rating-female", state().tournament.handicapRatings.female.slopeRating);
    const badge = document.getElementById("tournament-state-badge");
    if (badge) badge.textContent = t.status;
    const shareUrl = document.getElementById("share-url");
    if (shareUrl) shareUrl.value = window.LB.appUtils.buildShareUrl();
  }

function setOperatorLinkStatus(message = "", mode = "") {
    const el = document.getElementById("operator-link-status");
    if (!el) return;
    el.textContent = message;
    el.classList.toggle("is-linked", mode === "linked");
    el.classList.toggle("is-error", mode === "error");
  }

function normalizeOperatorTournament(row = {}) {
    return {
      id: row.id || "",
      title: row.title || "Tournament",
      courseId: row.course_id || row.courseId || "",
      courseName: row.course_name || row.courseName || "",
      courseSnapshot: row.course_snapshot || row.courseSnapshot || {},
      operatorName: row.operator_name || row.operatorName || "",
      leaderboardTournamentId: row.leaderboard_tournament_id || row.leaderboardTournamentId || "",
      shareSlug: row.share_slug || row.shareSlug || "",
      flightConfig: row.flight_config || row.flightConfig || row.metadata?.flightConfig || null,
      managementMode: String(
        row.management_mode ||
        row.managementMode ||
        row.metadata?.managementMode ||
        "fixed"
      ).toLowerCase() === "flexible" ? "flexible" : "fixed",
      operatorUsername: row.operator_username || row.operatorUsername || "",
      participantCount: row.participant_count || row.participantCount || 0,
      startsAt: row.starts_at || row.startsAt || "",
      endsAt: row.ends_at || row.endsAt || "",
      updatedAt: row.updated_at || row.updatedAt || ""
    };
  }

function getOperatorTournamentListSignature() {
    return JSON.stringify((state().operator.tournaments || []).map(item => [
      item.id,
      item.leaderboardTournamentId,
      item.shareSlug,
      item.participantCount,
      item.updatedAt || "",
      item.flightConfig || null
    ]));
  }

function applyOperatorTournamentToState(tournament) {
    const normalized = window.LB.appUtils.normalizeOperatorTournament(tournament);
    const previousTournamentId = state().operator.linkedTournament?.id || "";
    const sameTournamentReady = previousTournamentId === normalized.id
      && state().flightConfig?.rosterImportReady === true;
    const snapshot = normalized.courseSnapshot || {};
    const holes = window.LB.appPlayer.normalizeLeaderboardCourseHoles(snapshot.holes_data || snapshot.holesData || []);
    state().operator.linkedTournament = normalized;
    if (state().course?.offlineCatalogCourse) delete state().course.offlineCatalogCourse;
    if (previousTournamentId !== normalized.id) {
      state().operator.scoreSyncCursor = {
        tournamentId: normalized.id,
        changeSeq: 0
      };
      state().operator.lastScoreSyncAt = "";
    }
    state().tournament.operatorTournamentId = normalized.id;
    state().tournament.id = normalized.leaderboardTournamentId || state().tournament.id;
    state().tournament.name = normalized.title || state().tournament.name;
    state().tournament.operatorName = normalized.operatorName || state().tournament.operatorName;
    state().tournament.courseName = normalized.courseName || snapshot.name || state().tournament.courseName;
    state().tournament.shareSlug = normalized.shareSlug || state().tournament.shareSlug;
    state().tournament.status = "live";
    state().course.holes = holes;
    window.LB.appPlayer.applyFlightConfig(normalized.flightConfig || {});
    state().flightConfig.rosterImportReady = sameTournamentReady;
  }

async function loadOperatorTournaments(notify = false, options = {}) {
    const rows = await window.LB.supabaseBridge.listActiveOperatorTournaments();
    state().operator.tournaments = rows.map(window.LB.appUtils.normalizeOperatorTournament);
    const linked = state().operator.linkedTournament;
    if (linked?.id) {
      const latest = state().operator.tournaments.find(item => item.id === linked.id);
      if (latest) {
        const isEditingFlightConfig = !!document.activeElement?.closest?.(".flight-config-panel");
        state().operator.linkedTournament = {
          ...linked,
          ...latest,
          courseSnapshot: linked.courseSnapshot || latest.courseSnapshot,
          flightConfig: latest.flightConfig || linked.flightConfig
        };
        state().tournament.id = latest.leaderboardTournamentId || state().tournament.id;
        state().tournament.shareSlug = latest.shareSlug || state().tournament.shareSlug;
        if (latest.flightConfig && !isEditingFlightConfig) {
          window.LB.appPlayer.applyFlightConfig(latest.flightConfig);
        }
      }
    }
    window.LB.storage.saveState();
    if (!options.silent) renderOperatorTournamentControls();
    if (notify) {
      alert(rows.length ? `Đã tải ${rows.length} tournament đang mở.` : "Chưa có tournament đang mở hoặc Supabase chưa sẵn sàng.");
    }
    return rows;
  }

async function linkOperatorTournament() {
    const select = document.getElementById("operator-tournament-select");
    const code = (document.getElementById("operator-private-code")?.value || "").replace(/\D/g, "").slice(0, 4);
    const operatorTournamentId = select?.value || "";
    if (!operatorTournamentId || !/^\d{4}$/.test(code)) {
      window.LB.appUtils.setOperatorLinkStatus("Chọn tournament và nhập private code đúng 4 số.", "error");
      return;
    }

    window.LB.appUtils.setOperatorLinkStatus("Đang xác thực private code...");
    const result = await window.LB.supabaseBridge.validateOperatorTournament(operatorTournamentId, code);
    if (!result.ok) {
      window.LB.appUtils.setOperatorLinkStatus("Private code không đúng hoặc tournament đã đóng.", "error");
      return;
    }

    const normalizedTournament = window.LB.appUtils.normalizeOperatorTournament(result.tournament);
    const capabilities = window.LB.appUtils.getCapabilities();
    if (normalizedTournament.managementMode === "flexible" && !capabilities.cloudRuntime) {
      window.LB.appUtils.setOperatorLinkStatus(
        "Tournament này dùng Điều hành linh động. Mở /leaderboard/manage hoặc chạy local fallback bằng cloud adapter để lấy lease độc quyền.",
        "error"
      );
      return;
    }

    state().operator.privateCode = code;
    state().tournament.operatorPrivateCode = code;
    window.LB.appUtils.applyOperatorTournamentToState(normalizedTournament);
    window.LB.appUtils.setOperatorLinkStatus("Đã vào giải. Player-panel vẫn lưu local; bấm Nạp danh sách khi roster đã sẵn sàng cho TS36.", "linked");
    window.LB.appUtils.persistAndRender();
    window.LB.appUtils.finishLinkedTournamentEntry();
  }

function setValue(id, value) {
    const el = document.getElementById(id);
    if (el && String(el.value) !== String(value ?? "")) el.value = value ?? "";
  }

function playerMatchesSearch(player = {}, query = "") {
    const normalizedQuery = window.LB.appUtils.normalizeSearchText(query);
    if (!normalizedQuery) return true;
    const name = window.LB.appUtils.normalizeSearchText(player.name || "");
    const vga = window.LB.appUtils.normalizeSearchText([
      player.vgaId,
      player.golferId,
      player.caddyNumber,
      player.ts36VgaId,
      player.tourSystemUserId,
      player.ts36DisplayName
    ].filter(Boolean).join(" "));
    const cleanQuery = normalizedQuery.replace(/\s+/g, "");
    if (/^\d+$/.test(cleanQuery)) {
      return vga.includes(cleanQuery);
    }
    return name.includes(normalizedQuery) || vga.includes(cleanQuery) || vga.includes(normalizedQuery);
  }

function tourSystemMatchMatchesSearch(match = {}, query = "") {
    const normalizedQuery = window.LB.appUtils.normalizeSearchText(query);
    if (!normalizedQuery) return true;
    const haystack = window.LB.appUtils.normalizeSearchText([
      match.displayName,
      match.email,
      match.rawVgaId,
      match.normalizedVgaId,
      match.tourSystemUserId,
      match.claimedPlayerId,
      match.suggestionReason
    ].filter(Boolean).join(" "));
    const cleanQuery = normalizedQuery.replace(/\s+/g, "");
    return haystack.includes(normalizedQuery) || haystack.includes(cleanQuery);
  }

function getScoreToParMeta(hole, score) {
    const holeConfig = window.LB.scoring.getHoleConfig(state(), Number(hole) || 0);
    const rawPar = Number(holeConfig?.par);
    const par = Number.isFinite(rawPar) && rawPar > 0 ? Math.trunc(rawPar) : 4;
    const gross = parseInt(score, 10);
    if (!Number.isFinite(gross) || gross <= 0) {
      return { par, diff: null, className: "" };
    }
    const diff = gross - par;
    return {
      par,
      diff,
      className: diff < 0 ? "is-under-par" : (diff > 0 ? "is-over-par" : "is-at-par")
    };
  }

function renderScoreEntryHeaderCell(hole) {
    const { par } = window.LB.appUtils.getScoreToParMeta(hole, "");
    return `
      <th class="score-hole-head" scope="col">
        <span>H${window.LB.appUtils.escapeHtml(hole)}</span>
        <small>P${window.LB.appUtils.escapeHtml(par)}</small>
      </th>
    `;
  }

function ensureScoreFlyHeader() {
    let flyHeader = document.getElementById("score-table-fly-header");
    if (flyHeader) return flyHeader;
    flyHeader = document.createElement("div");
    flyHeader.id = "score-table-fly-header";
    flyHeader.className = "score-table-fly-header";
    flyHeader.hidden = true;
    flyHeader.setAttribute("aria-hidden", "true");
    flyHeader.innerHTML = `<div class="score-table-fly-viewport"></div>`;
    document.body.appendChild(flyHeader);
    return flyHeader;
  }

function getScoreFlyHeaderTop() {
    let top = 0;
    [
      document.querySelector(".app-topbar"),
      document.getElementById("simulator-local-only-warning")
    ].forEach(element => {
      if (!element || element.hidden || getComputedStyle(element).display === "none") return;
      const rect = element.getBoundingClientRect();
      if (rect.bottom > 0 && rect.top <= top + 1) top = Math.max(top, rect.bottom);
    });
    return Math.max(0, Math.round(top));
  }

function rebuildScoreFlyHeader(sourceTable, sourceHead, flyViewport) {
    if (sourceHead.classList.contains("score-mobile-header")) {
      const flyHead = sourceHead.cloneNode(true);
      flyHead.classList.add("score-mobile-fly-header");
      flyViewport.replaceChildren(flyHead);
      scoreFlyHeaderSourceTable = sourceHead;
      scoreFlyHeaderNeedsRebuild = false;
      return;
    }
    const sourceCells = Array.from(sourceHead.querySelectorAll("th"));
    const sourceTableWidth = sourceTable.getBoundingClientRect().width;
    const flyTable = sourceTable.cloneNode(false);
    const flyHead = sourceHead.cloneNode(true);
    flyTable.classList.add("score-table-fly-table");
    flyTable.appendChild(flyHead);
    flyTable.style.width = `${sourceTableWidth}px`;
    flyTable.style.minWidth = `${sourceTableWidth}px`;
    Array.from(flyHead.querySelectorAll("th")).forEach((cell, index) => {
      const width = sourceCells[index]?.getBoundingClientRect().width || 0;
      if (!width) return;
      cell.style.width = `${width}px`;
      cell.style.minWidth = `${width}px`;
      cell.style.maxWidth = `${width}px`;
    });
    flyViewport.replaceChildren(flyTable);
    scoreFlyHeaderSourceTable = sourceTable;
    scoreFlyHeaderNeedsRebuild = false;
  }

function invalidateScoreFlyHeader() {
    scoreFlyHeaderNeedsRebuild = true;
    scheduleScoreFlyHeaderUpdate();
  }

function resetScoreFlyHeader() {
    scoreFlyHeaderSourceTable = null;
    scoreFlyHeaderNeedsRebuild = true;
    const flyHeader = document.getElementById("score-table-fly-header");
    if (flyHeader) flyHeader.hidden = true;
  }

function bindScoreTableViewport(root) {
    window.LB.appUtils.resetScoreFlyHeader();
    const viewport = root.querySelector(".score-table-viewport");
    viewport?.addEventListener("scroll", scheduleScoreFlyHeaderUpdate, { passive: true });
    scheduleScoreFlyHeaderUpdate();
  }

function renderScoreEntryTable(players, sequence) {
    const groups = window.LB.appPlayer.groupScoreEntryPlayers(players);
    const colSpan = sequence.length + 3;
    return `
      <div class="score-table-viewport" role="region" aria-label="Bảng nhập điểm vận hành" tabindex="0">
        <table class="score-table">
          <thead>
            <tr>
              <th scope="col">Golfer</th>
              ${sequence.map(hole => window.LB.appUtils.renderScoreEntryHeaderCell(hole)).join("")}
              <th scope="col">Total</th>
              <th class="score-review-head" scope="col">Duyệt</th>
            </tr>
          </thead>
          <tbody>
            ${groups.map(group => `
              <tr class="score-flight-group-row">
                <td colspan="${colSpan}">
                  <span class="score-flight-group-label">Flight ${window.LB.appUtils.escapeHtml(group.label)}${group.startHole ? ` · Hố ${window.LB.appUtils.escapeHtml(group.startHole)}` : ""} · ${group.players.length} golfer</span>
                </td>
              </tr>
              ${group.players.map(player => window.LB.appUtils.renderScoreRow(player, sequence)).join("")}
            `).join("")}
          </tbody>
        </table>
      </div>
      ${window.LB.appUtils.renderMobileScoreEntry(groups, sequence)}
    `;
  }

function renderMobileScoreHeader(sequence) {
    const halves = [sequence.slice(0, 9), sequence.slice(9, 18)];
    return `
      <div class="score-mobile-header" aria-hidden="true">
        ${halves.map(holes => `
          <div class="score-mobile-hole-grid score-mobile-hole-header-row">
            ${holes.map(hole => {
              const { par } = window.LB.appUtils.getScoreToParMeta(hole, "");
              return `
                <span class="score-mobile-hole-head">
                  <strong>H${window.LB.appUtils.escapeHtml(hole)}</strong>
                  <small>P${window.LB.appUtils.escapeHtml(par)}</small>
                </span>
              `;
            }).join("")}
          </div>
        `).join("")}
      </div>
    `;
  }

function renderMobileScoreEntry(groups, sequence) {
    const halves = [sequence.slice(0, 9), sequence.slice(9, 18)];
    return `
      <div class="score-mobile-list" aria-label="Bảng nhập điểm mobile">
        ${window.LB.appUtils.renderMobileScoreHeader(sequence)}
        ${groups.map(group => `
          <section class="score-mobile-flight">
            <div class="score-mobile-flight-label">Flight ${window.LB.appUtils.escapeHtml(group.label)}${group.startHole ? ` · Hố ${window.LB.appUtils.escapeHtml(group.startHole)}` : ""} · ${group.players.length} golfer</div>
            ${group.players.map(player => window.LB.appPlayer.renderMobileScorePlayer(player, halves)).join("")}
          </section>
        `).join("")}
      </div>
    `;
  }

function renderScoreRow(player, sequence) {
    const summary = window.LB.scoring.summarizePlayer(state(), player, { includeStaging: true });
    const publicId = window.LB.appPlayer.getPlayerPublicId(player);
    const pendingCount = window.LB.appPlayer.getPlayerPendingScoreCount(player.id);
    const tooltipParts = [player.name || "Golfer"];
    if (player.caddyNumber) tooltipParts.push(`Caddy ${player.caddyNumber}`);
    const note = player.operationNote || player.note || "";
    if (note) tooltipParts.push(note);
    const tooltip = tooltipParts.join(" · ");

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
    const metadataParts = [
      publicId ? window.LB.appUtils.escapeHtml(publicId) : "",
      `HCP ${window.LB.appUtils.escapeHtml(player.handicap || 0)}`,
      `F ${frontDisplay}`,
      `B ${backDisplay}`,
      `T ${totalDisplay}`
    ].filter(Boolean);

    return `
      <tr class="score-row">
        <td class="score-player-cell" title="${window.LB.appUtils.escapeHtml(tooltip)}">
          <strong class="golfer-name">${window.LB.appUtils.escapeHtml(player.name || "Golfer")}</strong>
          <small>${metadataParts.join(" · ")}</small>
        </td>
        ${sequence.map(hole => renderScoreCell(player, hole)).join("")}
        <td class="score-total-cell"><strong>${summary.holesPlayed}/18</strong></td>
        <td class="score-row-action-cell">
          <button class="row-confirm-button" type="button" data-action="confirm-player-scores" data-player-id="${window.LB.appUtils.escapeHtml(player.id)}" ${pendingCount ? "" : "disabled"} title="${pendingCount ? `Xác nhận ${pendingCount} điểm đang chờ của ${window.LB.appUtils.escapeHtml(player.name || "golfer")}` : "Không có điểm chờ xác nhận"}">${pendingCount ? `Duyệt ${pendingCount}` : "✓"}</button>
        </td>
      </tr>
    `;
  }

function getLeaderboardRowKey(row = {}) {
    return window.LB.appUtils.cleanText(row.playerId || row.golferId || row.vgaId || row.name || "");
  }

function captureLeaderboardRowPositions(root) {
    const rows = new Map();
    root?.querySelectorAll("[data-leaderboard-row]").forEach(row => {
      const key = row.getAttribute("data-row-key");
      if (!key) return;
      rows.set(key, {
        rank: row.getAttribute("data-rank") || "",
        rect: row.getBoundingClientRect()
      });
    });
    return rows;
  }

function animateLeaderboardRows(root, previousRows) {
    if (!previousRows?.size || window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches) return;
    root?.querySelectorAll("[data-leaderboard-row]").forEach(row => {
      const key = row.getAttribute("data-row-key");
      const previous = key ? previousRows.get(key) : null;
      if (!previous) {
        row.classList.add("is-rank-entering");
        window.setTimeout(() => row.classList.remove("is-rank-entering"), 700);
        return;
      }

      const nextRect = row.getBoundingClientRect();
      const deltaY = previous.rect.top - nextRect.top;
      const rankChanged = previous.rank !== row.getAttribute("data-rank");
      if (Math.abs(deltaY) < 1 && !rankChanged) return;

      row.classList.add("is-rank-moving");
      if (rankChanged) row.classList.add("is-rank-changed");
      row.style.transition = "transform 0s";
      row.style.transform = `translateY(${deltaY}px)`;
      row.getBoundingClientRect();
      window.requestAnimationFrame(() => {
        row.style.transition = "transform 560ms cubic-bezier(0.22, 1, 0.36, 1)";
        row.style.transform = "";
      });
      window.setTimeout(() => {
        row.classList.remove("is-rank-moving", "is-rank-changed");
        row.style.transition = "";
        row.style.transform = "";
      }, 700);
    });
  }

function updateLeaderboardViewportState(viewport) {
    if (!viewport) return;
    const frame = viewport.closest(".leaderboard-table-frame");
    if (!frame) return;
    const maxScrollLeft = Math.max(0, viewport.scrollWidth - viewport.clientWidth);
    frame.dataset.scrollable = maxScrollLeft > 2 ? "true" : "false";
    frame.dataset.canScrollLeft = viewport.scrollLeft > 2 ? "true" : "false";
    frame.dataset.canScrollRight = viewport.scrollLeft < maxScrollLeft - 2 ? "true" : "false";
  }

async function syncOperatorBridgeData(options = {}) {
    const participants = await window.LB.appTs36.importTourSystemParticipants();
    const scores = await window.LB.appTs36.importTourSystemScores(options);
    if ((participants || scores) && !options.silent) {
      state().alerts = state().alerts.filter(item => item.type !== "toursystem_sync");
      state().alerts.unshift({
        id: `sync-${Date.now().toString(36)}`,
        type: "toursystem_sync",
        message: `Đã đồng bộ ${participants} golfer và ${scores} dòng điểm từ TourSystem36.`,
        createdAt: new Date().toISOString()
      });
    }
    return { participants, scores };
  }

function renderSummary() {
    const metrics = window.LB.scoring.countMetrics(state());
    window.LB.appUtils.setText("metric-players", metrics.players);
    window.LB.appUtils.setText("metric-confirmed", metrics.confirmed);
    window.LB.appUtils.setText("metric-conflicts", metrics.conflicts);
    window.LB.appUtils.setText("metric-share", state().tournament.shareSlug ? "Ready" : "Local");
    window.LB.appUtils.setText("last-updated", state().tournament.updatedAt ? new Date(state().tournament.updatedAt).toLocaleTimeString("vi-VN") : "Chưa có");
    const shareUrl = document.getElementById("share-url");
    if (shareUrl) shareUrl.value = window.LB.appUtils.buildShareUrl();

    const alerts = document.getElementById("alert-list");
    if (alerts) {
      alerts.innerHTML = state().alerts.slice(0, 4).map(alert => `
        <div class="alert-item">${window.LB.appUtils.escapeHtml(alert.message)}</div>
      `).join("");
    }
  }

function setText(id, value) {
    const el = document.getElementById(id);
    if (el) el.textContent = value;
  }

function renderPlan() {
    const root = document.getElementById("plan-content");
    if (!root || root.dataset.rendered) return;
    root.dataset.rendered = "true";
    const phases = [
      ["Phase 1 — Local Tournament Ops", ["Hoàn thiện nhập player/flight, operator score, confirm score, public snapshot.", "Chạy ổn trên localhost cho sân golf hoặc máy điều hành giải.", "Import OCR bằng paste JSON và endpoint local PaddleOCR."]],
      ["Phase 2 — Supabase Cloud Contract", ["Apply migration Leaderboard Pro sau khi review RLS.", "Auto-publish snapshot confirmed-only lên `leaderboard_public_snapshots` để golfer theo dõi từ nhiều thiết bị.", "Edge Function xử lý unlock credit và staging score từ TourSystem36."]],
      ["Phase 3 — TourSystem36 Pro Sync", ["Thêm nút mở khóa Leaderboard sync 30 credit, hoặc 20 credit nếu đã mở OCR import.", "TourSystem36 gửi điểm live vào staging table theo player link.", "Hiển thị cảnh báo nếu điểm user nhập lệch điểm operator confirm."]],
      ["Phase 4 — OCR Production", ["PaddleOCR local server cho doanh nghiệp/sân golf dùng miễn phí.", "Google AI Studio service cho operator tự nhập API key.", "Review queue bắt buộc trước khi confirm public leaderboard."]],
      ["Phase 5 — Temporary Event Server", ["Localhost + Cloudflare Tunnel/ngrok cho outing CLB.", "Vercel Preview + Supabase cho giải cần link public ổn định.", "Sau giải, khóa chỉnh sửa và lưu snapshot audit."]]
    ];
    root.innerHTML = phases.map(([title, items]) => `
      <article class="plan-phase">
        <h2>${window.LB.appUtils.escapeHtml(title)}</h2>
        <ul>${items.map(item => `<li>${window.LB.appUtils.escapeHtml(item)}</li>`).join("")}</ul>
      </article>
    `).join("");
  }

function getShareSlugInput() {
    const tournament = state().tournament || {};
    return {
      courseName: tournament.courseName,
      tournamentName: tournament.name,
      operatorName: tournament.operatorName
    };
  }

function isLocalShareSlugLocked() {
    const tournament = state().tournament || {};
    const slug = tournament.shareSlug || "";
    const isLegacySimulatorSlug = /^sim-/i.test(String(slug).trim());
    if (isLegacySimulatorSlug) return false;
    return Boolean(
      state().cloud?.enabled ||
      state().operator?.linkedTournament?.id ||
      (slug && window.LB.storage.getSnapshot(slug))
    );
  }

function ensureLocalShareSlugFromTournament() {
    const tournament = state().tournament || {};
    const currentSlug = String(tournament.shareSlug || "").trim();
    if (currentSlug && !/^sim-/i.test(currentSlug)) return tournament.shareSlug;
    if (!window.LB.storage?.generateShareSlug || window.LB.appUtils.isLocalShareSlugLocked()) return tournament.shareSlug || "";
    const shareInput = window.LB.appUtils.getShareSlugInput();
    const desiredPrefix = window.LB.storage.getSharePrefix
      ? window.LB.storage.getSharePrefix(shareInput)
      : "LB";
    const normalizedCurrentSlug = currentSlug.toUpperCase();
    if (normalizedCurrentSlug && normalizedCurrentSlug.startsWith(desiredPrefix)) return tournament.shareSlug;
    tournament.shareSlug = window.LB.storage.generateShareSlug(shareInput);
    return tournament.shareSlug;
  }

function buildShareUrl() {
    window.LB.appUtils.ensureLocalShareSlugFromTournament();
    const configuredBase = String(window.ENV?.PUBLIC_LIVE_BASE_URL || "").trim();
    const baseUrl = configuredBase || window.location.href;
    return new URL(`live/${encodeURIComponent(state().tournament.shareSlug)}`, baseUrl).toString();
  }

function setRosterPublishBusy(isBusy, mode = "publish") {
    document.querySelectorAll('[data-action="publish-roster"]').forEach(button => {
      const simulatorLocalOnly = state().simulator?.active === true;
      button.disabled = simulatorLocalOnly || !!isBusy;
      button.setAttribute("aria-busy", isBusy ? "true" : "false");
      button.textContent = isBusy ? (mode === "clear" ? "Đang xóa..." : "Đang nạp...") : "Nạp danh sách";
      button.title = simulatorLocalOnly
        ? "Simulator local-only, không ghi cloud"
        : "";
    });
  }

function triggerAutoPublishRefreshEffect() {
    const clock = document.getElementById("auto-publish-clock");
    if (!clock) return;
    clock.classList.remove("is-refreshing");
    void clock.offsetWidth;
    clock.classList.add("is-refreshing");
    updateAutoPublishClock();
  }

function downloadRuntimeFile(fileName, content, type = "application/octet-stream") {
    const blob = content instanceof Blob ? content : new Blob([content], { type });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = fileName;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

async function copyTextFromShareInput(value) {
    const input = document.getElementById("share-url");
    const fallbackCopy = () => {
      if (!input) return false;
      input.value = value;
      input.focus();
      input.select();
      return document.execCommand("copy");
    };
    if (navigator.clipboard && window.isSecureContext) {
      try {
        await navigator.clipboard.writeText(value);
        return true;
      } catch (err) {
        return fallbackCopy();
      }
    }
    return fallbackCopy();
  }

function exportWorkspaceBackup() {
    const payload = {
      format: "leaderboard-pro-workspace",
      version: 1,
      exportedAt: new Date().toISOString(),
      runtimeMode: window.LB.appUtils.getCapabilities().runtimeMode,
      state: window.LB.storage.clone(state()),
      snapshots: window.LB.storage.getSnapshots()
    };
    const slug = String(state().tournament?.shareSlug || "workspace").replace(/[^a-z0-9_-]/gi, "-");
    window.LB.appUtils.downloadRuntimeFile(
      `leaderboard-pro-${slug}-backup.json`,
      JSON.stringify(payload, null, 2),
      "application/json;charset=utf-8"
    );
  }

async function importWorkspaceBackupFile(event) {
    const input = event.currentTarget;
    const file = input?.files?.[0];
    if (!file) return;
    try {
      const payload = JSON.parse(await file.text());
      if (payload?.format !== "leaderboard-pro-workspace" || !payload.state?.tournament) {
        throw new Error("File không phải backup Leaderboard Pro hợp lệ.");
      }
      if (!confirm(`Khôi phục workspace "${payload.state.tournament.name || "Tournament"}"? Dữ liệu hiện tại sẽ được thay bằng backup.`)) {
        return;
      }
      localStorage.setItem(window.LB.STORAGE_KEYS.APP_STATE, JSON.stringify(payload.state));
      if (payload.snapshots && typeof payload.snapshots === "object") {
        localStorage.setItem(window.LB.STORAGE_KEYS.SNAPSHOTS, JSON.stringify(payload.snapshots));
      }
      window.location.reload();
    } catch (err) {
      alert(err.message || "Không đọc được file backup.");
    } finally {
      input.value = "";
    }
  }

function getStaticLiveDocument(snapshot) {
    const safeSnapshot = JSON.stringify(snapshot).replace(/</g, "\\u003c");
    return `<!doctype html>
<html lang="vi">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>${window.LB.appUtils.escapeHtml(snapshot.tournament?.name || "Leaderboard Live")}</title>
  <style>
    :root{color-scheme:dark;font-family:system-ui,-apple-system,"Segoe UI",sans-serif;background:#09090b;color:#f4f4f5}
    body{margin:0;padding:24px}.shell{max-width:1180px;margin:auto}.head{display:flex;justify-content:space-between;gap:16px;align-items:end;margin-bottom:24px}
    h1{margin:0;font-size:clamp(1.7rem,5vw,3rem)}p{color:#a1a1aa}.meta{text-align:right}.division{margin:24px 0}.rows{display:grid;gap:8px}
    .row{display:grid;grid-template-columns:56px minmax(160px,1fr) 92px 92px 92px;gap:10px;align-items:center;padding:13px 16px;background:#18181b;border:1px solid #27272a;border-radius:12px}
    .rank{font-size:1.25rem;font-weight:800;color:#10b981}.name{font-weight:700}.label{display:block;color:#71717a;font-size:.7rem;text-transform:uppercase}
    @media(max-width:680px){body{padding:14px}.head{display:block}.meta{text-align:left}.row{grid-template-columns:44px 1fr 70px}.row>div:nth-child(4),.row>div:nth-child(5){display:none}}
  </style>
</head>
<body>
  <main class="shell">
    <header class="head">
      <div><p>Leaderboard Live</p><h1 id="title"></h1><p id="course"></p></div>
      <div class="meta"><strong id="operator"></strong><p id="updated"></p></div>
    </header>
    <div id="leaderboard"></div>
  </main>
  <script>
    const snapshot=${safeSnapshot};
    const text=value=>String(value??"");
    document.getElementById("title").textContent=text(snapshot.tournament?.name||"Tournament");
    document.getElementById("course").textContent=text(snapshot.tournament?.courseName||"");
    document.getElementById("operator").textContent=text(snapshot.tournament?.operatorName||"");
    document.getElementById("updated").textContent=snapshot.tournament?.updatedAt?"Cập nhật "+new Date(snapshot.tournament.updatedAt).toLocaleString("vi-VN"):"";
    const rows=Array.isArray(snapshot.leaderboard)?snapshot.leaderboard:[];
    const groups=rows.reduce((result,row)=>{const key=text(row.division||row.flight||"Tổng");(result[key]??=[]).push(row);return result},{});
    const root=document.getElementById("leaderboard");
    Object.entries(groups).forEach(([division,items])=>{
      const section=document.createElement("section");section.className="division";
      const heading=document.createElement("h2");heading.textContent=division;section.appendChild(heading);
      const list=document.createElement("div");list.className="rows";
      items.forEach((row,index)=>{
        const item=document.createElement("article");item.className="row";
        const values=[
          ["rank","",text(row.rank||index+1)],
          ["name","",text(row.name||row.displayName||"Golfer")],
          ["","Gross",text(row.gross??"-")],
          ["","HCP",text(row.system36Handicap??row.handicap??"-")],
          ["","Net",text(row.system36Net??row.net??"-")]
        ];
        values.forEach(([className,label,value])=>{const cell=document.createElement("div");cell.className=className;if(label){const caption=document.createElement("span");caption.className="label";caption.textContent=label;cell.appendChild(caption)}cell.appendChild(document.createTextNode(value));item.appendChild(cell)});
        list.appendChild(item);
      });
      section.appendChild(list);root.appendChild(section);
    });
  </script>
</body>
</html>`;
  }

function exportStaticLivePage() {
    const snapshot = buildOperatorLinkSnapshot();
    if (!window.LB.appUtils.hasPublishableLeaderboardData(snapshot)) {
      alert("Chưa có điểm GO đã xác nhận để xuất trang live.");
      return;
    }
    window.LB.storage.saveSnapshot(snapshot, { publish: false });
    const slug = String(snapshot.shareSlug || "live").replace(/[^a-z0-9_-]/gi, "-");
    window.LB.appUtils.downloadRuntimeFile(`${slug}.html`, window.LB.appUtils.getStaticLiveDocument(snapshot), "text/html;charset=utf-8");
  }

async function copyShareUrl() {
    const value = window.LB.appUtils.buildShareUrl();
    const copyAttempt = window.LB.appUtils.copyTextFromShareInput(value);
    const snapshot = buildOperatorLinkSnapshot();
    window.LB.storage.saveSnapshot(snapshot, { publish: false });
    if (window.LB.appUtils.getCapabilities().canUseLocalServices) {
      window.LB.appUtils.setOperatorLinkStatus("Đang nạp dữ liệu live lên máy chủ local...");
      const publishedToLan = await window.LB.storage.ensureLanSnapshotPublished(snapshot);
      if (!publishedToLan) {
        window.LB.appUtils.setOperatorLinkStatus("Chưa nạp được dữ liệu live lên máy chủ local. App sẽ tự thử lại trong nền; chưa nên gửi link này.");
        return;
      }
    } else {
      const published = await publishOperatorLinkSnapshot({ snapshot, silent: true });
      if (!published.ok) {
        window.LB.appUtils.setOperatorLinkStatus(`Chưa publish được bảng live: ${published.reason || "publish_failed"}`, "error");
        return;
      }
    }

    const copied = await copyAttempt;

    window.LB.appUtils.setOperatorLinkStatus(
      copied ? "Đã copy link live." : "Bảng live đã sẵn sàng. Hãy copy link trong ô bên cạnh.",
      copied ? "linked" : ""
    );
  }

function syncRosterImportFileName(fileList) {
    const files = Array.from(fileList || []);
    const label = document.getElementById("roster-ocr-file-name");
    if (!label) return;
    label.textContent = files.length
      ? (files.length === 1 ? files[0].name : `${files.length} file`)
      : "Chưa chọn";
    label.title = files.map(file => file.name).join(", ");
  }

function renderWarnings(row) {
    const warnings = Array.isArray(row.warnings) ? row.warnings.filter(Boolean) : [];
    if (!warnings.length) return "";
    return `<small class="ocr-warning">${window.LB.appUtils.escapeHtml(warnings.join(" · "))}</small>`;
  }

function summarizeParticipantImport(rows = []) {
    const summary = {
      total: rows.length,
      male: 0,
      female: 0,
      flights: new Set(),
      divisions: new Set(),
      withVgaId: 0,
      withCourseHandicap: 0
    };

    rows.forEach(row => {
      const gender = window.LB.appPlayer.normalizeGender(row.gender || "");
      if (gender === "male") summary.male += 1;
      if (gender === "female") summary.female += 1;

      const flightGroup = window.LB.appPlayer.normalizeFlightGroupLabel(row.flightGroup || row.group || "", row.startHole || "");
      if (flightGroup) summary.flights.add(flightGroup);

      const division = window.LB.appUtils.cleanText(row.division || row.flight || "");
      if (division) summary.divisions.add(division);

      if (window.LB.appUtils.normalizeVgaId(row.vgaId || "")) summary.withVgaId += 1;
      if (row.courseHandicap !== "" && Number.isFinite(Number(row.courseHandicap))) summary.withCourseHandicap += 1;
    });

    return {
      ...summary,
      flightCount: summary.flights.size,
      divisionCount: summary.divisions.size
    };
  }

function renderRosterImportReview(rows = []) {
    const root = document.getElementById("roster-ocr-review");
    const reviewCount = document.getElementById("roster-ocr-review-count");
    const summary = window.LB.appUtils.summarizeParticipantImport(rows);
    if (reviewCount) reviewCount.textContent = `${summary.total} golfer`;
    if (!root) return;
    if (!summary.total) {
      root.innerHTML = `<div class="empty-state">Chưa có dữ liệu import golfer.</div>`;
      return;
    }

    root.innerHTML = `
      <article class="ocr-summary-card">
        <strong>Đã import vào ${summary.total} golfer (${summary.male} nam, ${summary.female} nữ)</strong>
        <div class="ocr-summary-meta">
          <span>${summary.flightCount} flight (nhóm đấu)</span>
          <span>${summary.divisionCount} division (bảng đấu)</span>
          <span>${summary.withVgaId} golfer có ID (VGA)</span>
          <span>${summary.withCourseHandicap} golfer có handicap sân</span>
        </div>
      </article>
    `;
  }

function setSettingsStatus(message, mode = "") {
    const stateEl = document.getElementById("settings-config-state");
    const preview = document.getElementById("settings-gemini-key-preview");
    const paddle = document.getElementById("settings-paddle-status");
    [stateEl, preview, paddle].forEach(el => {
      if (!el) return;
      el.classList.toggle("is-linked", mode === "linked");
      el.classList.toggle("is-error", mode === "error");
    });
    if (stateEl) stateEl.textContent = message;
  }

function renderServiceSettings(data = {}) {
    window.LB.appUtils.setValue("settings-local-ocr-endpoint", window.ENV?.LOCAL_OCR_ENDPOINT || "http://localhost:8866/ocr");
    window.LB.appUtils.setValue("settings-gemini-model", data.gemini_model || "gemini-3.1-flash-lite");
    window.LB.appUtils.setValue("settings-paddle-device", data.paddle_device || "auto");
    window.LB.appUtils.setValue("settings-paddle-cpu-threads", data.paddle_cpu_threads || "");
    const mkldnn = document.getElementById("settings-paddle-mkldnn");
    if (mkldnn) mkldnn.checked = data.paddle_enable_mkldnn !== false;
    window.LB.appUtils.setText("settings-config-path", data.config_path || ".local/ocr-service-config.json");
    window.LB.appUtils.setText("settings-key-state", data.has_gemini_api_key ? "Đã lưu" : "Chưa có");
    window.LB.appUtils.setText("settings-paddle-state", `${data.paddle_effective_device || "cpu"} · Paddle ${data.paddle_version || "?"}`);
    window.LB.appUtils.setText("settings-service-state", "Online");
    const paddleStatus = document.getElementById("settings-paddle-status");
    if (paddleStatus) {
      const gpuText = data.paddle_cuda_compiled
        ? `CUDA OK · ${data.paddle_gpu_count || 0} GPU`
        : "CUDA chưa khả dụng trong Paddle wheel";
      paddleStatus.textContent = data.paddle_warning
        ? `${gpuText}. ${data.paddle_warning}`
        : `${gpuText}. Đang dùng ${data.paddle_effective_device || "cpu"}.`;
      paddleStatus.classList.toggle("is-linked", !data.paddle_warning);
      paddleStatus.classList.toggle("is-error", !!data.paddle_warning);
    }
    const keyInput = document.getElementById("settings-gemini-key");
    if (keyInput) keyInput.value = "";
    const preview = document.getElementById("settings-gemini-key-preview");
    const hasLocalJsKey = !!localStorage.getItem("lb_gemini_api_key");
    const hasKey = data.has_gemini_api_key || hasLocalJsKey;
    if (preview) {
      preview.textContent = hasKey
        ? `Key đang dùng: ${hasLocalJsKey ? "JS LocalStorage" : (data.gemini_api_key_preview || "đã lưu")}${data.uses_env_key ? " · env" : ""}`
        : "Chưa có key local.";
      preview.classList.toggle("is-linked", !!hasKey);
      preview.classList.toggle("is-error", !hasKey);
    }
  }

async function loadServiceSettings(notify = false) {
    window.LB.appUtils.setValue("settings-local-ocr-endpoint", window.ENV?.LOCAL_OCR_ENDPOINT || "http://localhost:8866/ocr");
    try {
      const response = await fetch(window.LB.appOcr.getOcrConfigUrl());
      if (!response.ok) throw new Error(`OCR config endpoint lỗi ${response.status}`);
      const data = await response.json();
      window.LB.appUtils.renderServiceSettings(data);
      window.LB.appUtils.setSettingsStatus("Đã kết nối", "linked");
      if (notify) alert("Đã tải cấu hình OCR local.");
    } catch (err) {
      window.LB.appUtils.setText("settings-service-state", "Offline");
      window.LB.appUtils.setSettingsStatus(err.message, "error");
      if (notify) alert(err.message);
    }
  }

async function saveServiceSettings() {
    const key = document.getElementById("settings-gemini-key")?.value || "";
    const model = document.getElementById("settings-gemini-model")?.value || "gemini-3.1-flash-lite";
    const paddleDevice = document.getElementById("settings-paddle-device")?.value || "auto";
    const paddleCpuThreads = document.getElementById("settings-paddle-cpu-threads")?.value || "";
    const paddleMkldnn = !!document.getElementById("settings-paddle-mkldnn")?.checked;
    
    if (key.trim()) {
      localStorage.setItem("lb_gemini_api_key", key.trim());
    }
    
    try {
      const response = await fetch(window.LB.appOcr.getOcrConfigUrl(), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          gemini_api_key: key.trim(),
          gemini_model: model.trim(),
          paddle_device: paddleDevice,
          paddle_cpu_threads: paddleCpuThreads,
          paddle_enable_mkldnn: paddleMkldnn
        })
      });
      if (!response.ok) throw new Error(`Không lưu được cấu hình OCR (${response.status}).`);
      const data = await response.json();
      window.LB.appUtils.renderServiceSettings(data);
      window.LB.appUtils.setSettingsStatus("Đã lưu", "linked");
      alert("Đã lưu cấu hình OCR local.");
    } catch (err) {
      // If Python server is offline, we can still use the JS local key
      if (key.trim()) {
        window.LB.appUtils.renderServiceSettings({ has_gemini_api_key: true });
        window.LB.appUtils.setSettingsStatus("Đã lưu key vào trình duyệt (Python offline)", "linked");
        alert("Đã lưu key vào trình duyệt. Tính năng OCR qua Gemini có thể hoạt động mà không cần Python.");
      } else {
        window.LB.appUtils.setSettingsStatus(err.message, "error");
        alert(err.message);
      }
    }
  }

async function clearServiceApiKey() {
    if (!confirm("Xóa Google API Key khỏi file cấu hình local?")) return;
    localStorage.removeItem("lb_gemini_api_key");
    try {
      const model = document.getElementById("settings-gemini-model")?.value || "gemini-3.1-flash-lite";
      const response = await fetch(window.LB.appOcr.getOcrConfigUrl(), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clear_gemini_api_key: true, gemini_model: model.trim() })
      });
      if (!response.ok) throw new Error(`Không xóa được key (${response.status}).`);
      const data = await response.json();
      window.LB.appUtils.renderServiceSettings(data);
      window.LB.appUtils.setSettingsStatus("Đã xóa key", "linked");
    } catch (err) {
      window.LB.appUtils.renderServiceSettings({});
      window.LB.appUtils.setSettingsStatus("Đã xóa key trên trình duyệt (Python offline)", "linked");
    }
  }

async function checkSupabaseStatus(notify = false) {
    const result = await window.LB.supabaseBridge.checkConnection();
    const el = document.getElementById("sync-status");
    if (el) {
      el.textContent = result.message;
      el.classList.toggle("is-online", result.ok);
      el.classList.toggle("is-error", !result.ok && result.mode === "error");
    }
    if (notify) alert(result.message);
  }

  return { getCapabilities, readPositiveInt, clampMs, getOperatorScorePollSeconds, escapeHtml, cleanText, normalizeOperationNote, prefixOperationNote, stripAccents, normalizeSearchText, keyText, normalizeVgaId, hasSystem36RosterMarker, extractStartHoleNumber, cloneScoreMap, findRestorableScoreMap, playerMatchesPublicGolfId, isSameGolferIdentity, nameSimilarity, appendPendingScore, getEffectivePendingScoreHole, getScoreKey, hasAnyLocalScoreRecord, hasAnyConfirmedPublicScoreRecord, snapshotHasConfirmedPublicScores, hasPublishableLeaderboardData, loadOperatorCatalogOnDemand, startLinkedRuntimeServices, renderOperationModeVisibility, finishLinkedTournamentEntry, hydrateControls, bindEvents, getTooltipText, showTouchTooltip, handleTouchTooltipPointerDown, applyCollapsiblePanelState, restoreSearchFocus, applyScopedSearchQuery, applyMobileOverviewPanelState, preserveMobileDashboardScrollAnchor, setMobileDashboardOverviewCollapsed, syncMobileDashboardOverviewForViewport, handleDoubleClick, getScoreGridRows, handleScoreGridKeydown, handleInput, handleChange, handleSearchBlur, handleSearchPointerDown, getNormalizedCaddyNumber, recomputeCaddyDuplicates, syncCaddyDuplicateClasses, handleBlur, applySpreadsheetPaste, handlePaste, handleFocusin, getScoreReviewGross, isScorePendingReview, confirmScore, showView, scrollToTop, isBackToTopViewActive, setupBackToTopVisibility, persistAndRender, render, getActiveSimulationMode, setSimulator2Mode, renderLight, renderTournamentForm, setOperatorLinkStatus, normalizeOperatorTournament, getOperatorTournamentListSignature, applyOperatorTournamentToState, loadOperatorTournaments, linkOperatorTournament, setValue, playerMatchesSearch, tourSystemMatchMatchesSearch, getScoreToParMeta, renderScoreEntryHeaderCell, ensureScoreFlyHeader, getScoreFlyHeaderTop, rebuildScoreFlyHeader, invalidateScoreFlyHeader, resetScoreFlyHeader, bindScoreTableViewport, renderScoreEntryTable, renderMobileScoreHeader, renderMobileScoreEntry, renderScoreRow, getLeaderboardRowKey, captureLeaderboardRowPositions, animateLeaderboardRows, updateLeaderboardViewportState, syncOperatorBridgeData, renderSummary, setText, renderPlan, getShareSlugInput, isLocalShareSlugLocked, ensureLocalShareSlugFromTournament, buildShareUrl, setRosterPublishBusy, triggerAutoPublishRefreshEffect, downloadRuntimeFile, copyTextFromShareInput, exportWorkspaceBackup, importWorkspaceBackupFile, getStaticLiveDocument, exportStaticLivePage, copyShareUrl, syncRosterImportFileName, renderWarnings, summarizeParticipantImport, renderRosterImportReview, setSettingsStatus, renderServiceSettings, loadServiceSettings, saveServiceSettings, clearServiceApiKey, checkSupabaseStatus };
})();
