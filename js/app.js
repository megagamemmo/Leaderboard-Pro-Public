(function () {
  const state = () => window.LB.state;
  let operatorBridgePollTimer = null;
  let operatorBridgePollTick = 0;
  let operatorBridgeLastCatalogPollAt = 0;
  let operatorBridgeLastParticipantPollAt = 0;
  let flightConfigPublishTimer = null;
  let operatorSnapshotPublishTimer = null;
  let operatorSnapshotCountdownTimer = null;
  let operatorSnapshotNextPublishAt = 0;
  let operatorSnapshotPublishInFlight = false;
  let operatorSnapshotLastPublishedSignature = "";
  let ocrProcessing = false;
  let leaderboardDivision = "";
  let leaderboardViewportResizeObserver = null;
  let scoreEntryDivision = "";
  let playerPanelCollapsed = false;
  let flightConfigPanelCollapsed = false;
  let operatorLinkPanelCollapsed = false;
  let rosterImportPanelCollapsed = false;
  let scoreEntryPanelCollapsed = false;
  let finalResultsPanelCollapsed = false;
  let ocrFormCollapsed = false;
  let ocrPreviewFiles = [];
  let ocrPreviewStates = [];
  let ocrPreviewIndex = 0;
  let ocrPreviewScale = 1;
  let ocrEditorInstance = null;
  let mobileTournamentOverviewCollapsed = false;
  let mobileLiveOverviewCollapsed = false;
  let mobileDashboardLastScrollY = 0;
  let mobileDashboardDownTravel = 0;
  let mobileDashboardUpTravel = 0;
  let mobileDashboardScrollCooldownUntil = 0;
  let playerSearchInputValue = "";
  let scoreEntrySearchInputValue = "";
  let finalDqSearchInputValue = "";
  let ts36MatchSearchInputValue = "";
  let rosterMatchSearchInputValue = "";
  let backToTopVisible = false;
  let rosterPublishing = false;
  let finalResultsPublishing = false;
  let playerSearchQuery = "";
  let scoreEntrySearchQuery = "";
  let finalDqSearchQuery = "";
  let ts36MatchSearchQuery = "";
  let rosterMatchSearchQuery = "";
  let playerSearchPointerActive = false;
  let suppressPanelHeaderToggleUntil = 0;
  let pendingScoreGridFocus = null;
  let scoreFlyHeaderSourceTable = null;
  let scoreFlyHeaderFrame = 0;
  let scoreFlyHeaderNeedsRebuild = true;
  let touchTooltipTimer = null;
  const liveUpdatedScoreKeys = new Set();
  const PLAYER_PANEL_COLLAPSED_KEY = "lbpro_player_panel_collapsed";
  const FLIGHT_CONFIG_PANEL_COLLAPSED_KEY = "lbpro_flight_config_panel_collapsed";
  const OPERATOR_LINK_PANEL_COLLAPSED_KEY = "lbpro_operator_link_panel_collapsed";
  const ROSTER_IMPORT_PANEL_COLLAPSED_KEY = "lbpro_roster_import_panel_collapsed";
  const SCORE_ENTRY_PANEL_COLLAPSED_KEY = "lbpro_score_entry_panel_collapsed";
  const FINAL_RESULTS_PANEL_COLLAPSED_KEY = "lbpro_final_results_panel_collapsed";
  const OCR_FORM_COLLAPSED_KEY = "lbpro_ocr_form_collapsed";
  const FINAL_TECHNICAL_AWARD_FIELDS = ["longestDrive", "nearestToPin", "nearToTheLine", "longestPutt"];
  const FINAL_NET_CUT_LIMITS = [-1, -2, -3, -4, -5, -6, -7, -8];
  const DEFAULT_OPERATOR_SCORE_POLL_MS = 10000;
  const DEFAULT_OPERATOR_SNAPSHOT_AUTO_PUBLISH_MS = 300000;
  const DEFAULT_OPERATOR_PARTICIPANT_POLL_MS = 60000;
  const DEFAULT_OPERATOR_CATALOG_POLL_MS = 60000;
  const DEFAULT_LIVE_NOTIFICATION_MAX_AGE_MINUTES = 45;
  const DEFAULT_LIVE_NOTIFICATION_MAX_ITEMS = 20;
  const MIN_OPERATOR_SCORE_POLL_MS = 3000;
  const MIN_OPERATOR_SNAPSHOT_AUTO_PUBLISH_MS = 5000;
  const MAX_OPERATOR_SCORE_POLL_MS = 300000;
  const MIN_LIVE_NOTIFICATION_MAX_AGE_MINUTES = 1;
  const MAX_LIVE_NOTIFICATION_MAX_AGE_MINUTES = 360;
  const MIN_LIVE_NOTIFICATION_MAX_ITEMS = 4;
  const MAX_LIVE_NOTIFICATION_MAX_ITEMS = 48;
  const OFFLINE_COURSE_CATALOG_PATHS = [
    "offline-data/master-courses.json",
    "offline-data/ts36-master-courses-offline.json"
  ];
  let offlineCourseCatalog = [];
  let offlineCourseCatalogLoaded = false;
  let offlineCourseCatalogLoading = false;
  let offlineCourseCatalogSource = "";
  let offlineCourseCatalogError = "";
  let offlineCourseCatalogNotice = "";

  function getOperatorScorePollMs() {
    const configured = state().operator?.scorePollMs ?? window.ENV?.OPERATOR_SCORE_POLL_MS;
    return window.LB.appUtils.clampMs(configured, MIN_OPERATOR_SCORE_POLL_MS, MAX_OPERATOR_SCORE_POLL_MS, DEFAULT_OPERATOR_SCORE_POLL_MS);
  }

  function setOperatorScorePollSeconds(value) {
    const ms = window.LB.appUtils.clampMs(
      Number(value) * 1000,
      MIN_OPERATOR_SCORE_POLL_MS,
      MAX_OPERATOR_SCORE_POLL_MS,
      DEFAULT_OPERATOR_SCORE_POLL_MS
    );
    state().operator.scorePollMs = ms;
    return ms;
  }

  function getOperatorParticipantPollMs() {
    return window.LB.appUtils.readPositiveInt(window.ENV?.OPERATOR_PARTICIPANT_POLL_MS, DEFAULT_OPERATOR_PARTICIPANT_POLL_MS);
  }

  function getOperatorCatalogPollMs() {
    return window.LB.appUtils.readPositiveInt(window.ENV?.OPERATOR_CATALOG_POLL_MS, DEFAULT_OPERATOR_CATALOG_POLL_MS);
  }

  function getOperatorSnapshotAutoPublishMs() {
    const configured = state().operator?.snapshotAutoPublishMs ?? window.ENV?.OPERATOR_SNAPSHOT_AUTO_PUBLISH_MS;
    return window.LB.appUtils.clampMs(
      configured,
      MIN_OPERATOR_SNAPSHOT_AUTO_PUBLISH_MS,
      MAX_OPERATOR_SCORE_POLL_MS,
      DEFAULT_OPERATOR_SNAPSHOT_AUTO_PUBLISH_MS
    );
  }

  function setOperatorSnapshotAutoPublishSeconds(value) {
    const ms = window.LB.appUtils.clampMs(
      Number(value) * 1000,
      MIN_OPERATOR_SNAPSHOT_AUTO_PUBLISH_MS,
      MAX_OPERATOR_SCORE_POLL_MS,
      DEFAULT_OPERATOR_SNAPSHOT_AUTO_PUBLISH_MS
    );
    state().operator.snapshotAutoPublishMs = ms;
    return ms;
  }

  function getOperatorLiveNotificationRetentionMode() {
    return state().operator?.liveNotificationRetentionMode === "count" ? "count" : "time";
  }

  function setOperatorLiveNotificationRetentionMode(value) {
    const mode = value === "count" ? "count" : "time";
    state().operator.liveNotificationRetentionMode = mode;
    return mode;
  }

  function getOperatorLiveNotificationMaxAgeMinutes() {
    return window.LB.scoring.clampInt(
      state().operator?.liveNotificationMaxAgeMinutes,
      MIN_LIVE_NOTIFICATION_MAX_AGE_MINUTES,
      MAX_LIVE_NOTIFICATION_MAX_AGE_MINUTES,
      DEFAULT_LIVE_NOTIFICATION_MAX_AGE_MINUTES
    );
  }

  function setOperatorLiveNotificationMaxAgeMinutes(value) {
    const minutes = window.LB.scoring.clampInt(
      value,
      MIN_LIVE_NOTIFICATION_MAX_AGE_MINUTES,
      MAX_LIVE_NOTIFICATION_MAX_AGE_MINUTES,
      DEFAULT_LIVE_NOTIFICATION_MAX_AGE_MINUTES
    );
    state().operator.liveNotificationMaxAgeMinutes = minutes;
    return minutes;
  }

  function getOperatorLiveNotificationMaxItems() {
    return window.LB.scoring.clampInt(
      state().operator?.liveNotificationMaxItems,
      MIN_LIVE_NOTIFICATION_MAX_ITEMS,
      MAX_LIVE_NOTIFICATION_MAX_ITEMS,
      DEFAULT_LIVE_NOTIFICATION_MAX_ITEMS
    );
  }

  function setOperatorLiveNotificationMaxItems(value) {
    const maxItems = window.LB.scoring.clampInt(
      value,
      MIN_LIVE_NOTIFICATION_MAX_ITEMS,
      MAX_LIVE_NOTIFICATION_MAX_ITEMS,
      DEFAULT_LIVE_NOTIFICATION_MAX_ITEMS
    );
    state().operator.liveNotificationMaxItems = maxItems;
    return maxItems;
  }

  function markScoreLiveUpdated(playerId, hole) {
    const key = window.LB.appUtils.getScoreKey(playerId, hole);
    liveUpdatedScoreKeys.add(key);
    window.setTimeout(() => {
      liveUpdatedScoreKeys.delete(key);
      document.querySelectorAll(`[data-score-key="${key}"]`).forEach(el => {
        el.classList.remove("is-live-updated");
      });
    }, 1200);
  }

  function init() {
    window.LB.storage.initTheme();
    window.LB.storage.loadState();
    window.LB.appPlayer.syncPlayerIdentities();
    window.LB.appSnapshot.restoreMissingScoreMapsFromSnapshots();
    window.LB.appUtils.recomputeCaddyDuplicates();
    window.LB.appPlayer.sortPlayersByFlightInPlace();
    playerSearchInputValue = "";
    playerSearchQuery = "";
    playerPanelCollapsed = localStorage.getItem(PLAYER_PANEL_COLLAPSED_KEY) === "1";
    flightConfigPanelCollapsed = localStorage.getItem(FLIGHT_CONFIG_PANEL_COLLAPSED_KEY) === "1";
    const savedOperatorPanelState = localStorage.getItem(OPERATOR_LINK_PANEL_COLLAPSED_KEY);
    operatorLinkPanelCollapsed = savedOperatorPanelState === null
      ? !window.LB.appTs36.isLinkedToTourSystem()
      : savedOperatorPanelState === "1";
    rosterImportPanelCollapsed = localStorage.getItem(ROSTER_IMPORT_PANEL_COLLAPSED_KEY) === "1";
    scoreEntryPanelCollapsed = localStorage.getItem(SCORE_ENTRY_PANEL_COLLAPSED_KEY) === "1";
    finalResultsPanelCollapsed = localStorage.getItem(FINAL_RESULTS_PANEL_COLLAPSED_KEY) === "1";
    ocrFormCollapsed = localStorage.getItem(OCR_FORM_COLLAPSED_KEY) === "1";
    window.LB.appUtils.hydrateControls();
    window.LB.appOcr.syncOcrTaskUi();
    window.LB.appUtils.bindEvents();
    window.LB.appUtils.setupBackToTopVisibility();
    applyPlayerPanelCollapsedState();
    applyFlightConfigPanelCollapsedState();
    applyOperatorLinkPanelCollapsedState();
    applyRosterImportPanelCollapsedState();
    applyScoreEntryPanelCollapsedState();
    applyFinalResultsPanelCollapsedState();
    applyOcrFormCollapsedState();
    window.LB.appUtils.syncMobileDashboardOverviewForViewport();
    window.LB.appUtils.render();
    void loadOfflineCourseCatalog();
    const initialSnapshot = buildOperatorLinkSnapshot();
    if (window.LB.appUtils.hasPublishableLeaderboardData(initialSnapshot)) {
      window.LB.storage.saveSnapshot(initialSnapshot, { publish: false });
      if (window.LB.appUtils.getCapabilities().canUseLocalServices) {
        void window.LB.storage.ensureLanSnapshotPublished(initialSnapshot).then(published => {
          window.LB.appUtils.setText("metric-share", published ? "Ready" : "Retrying");
          window.LB.appUtils.setOperatorLinkStatus(
            published
              ? "Dữ liệu live trên LAN đã sẵn sàng."
              : "Đang tự nạp dữ liệu live lên máy chủ local, sẽ thử lại trong nền.",
            published ? "linked" : ""
          );
        });
      }
    } else {
      window.LB.appUtils.setText("metric-share", "Chưa có điểm");
    }
    if (window.LB.appUtils.getCapabilities().canUseLocalServices) window.LB.appUtils.loadServiceSettings(false);
    startOperatorSnapshotCountdownClock();
    if (window.LB.appTs36.isLinkedToTourSystem()) {
      window.LB.appUtils.checkSupabaseStatus().then(() => {
        window.LB.appUtils.loadOperatorTournaments(false, { silent: true });
        startOperatorBridgePolling();
        scheduleOperatorSnapshotPublish();
      });
    } else {
      window.LB.appUtils.renderOperationModeVisibility();
      window.LB.appUtils.setOperatorLinkStatus("Chế độ Local. Mở khung này và bấm Làm mới khi cần liên kết TourSystem36.");
    }
  }

  function stopUnlinkedRuntimeServices() {
    if (operatorBridgePollTimer) {
      window.clearInterval(operatorBridgePollTimer);
      operatorBridgePollTimer = null;
    }
    window.clearTimeout(operatorSnapshotPublishTimer);
    operatorSnapshotNextPublishAt = 0;
    updateAutoPublishClock();
  }

  function hideTouchTooltip() {
    window.clearTimeout(touchTooltipTimer);
    touchTooltipTimer = null;
    document.getElementById("lb-touch-tooltip")?.remove();
  }

  function applyPlayerPanelCollapsedState() {
    const panel = document.querySelector(".player-panel");
    const title = panel?.querySelector(".panel-title");
    window.LB.appUtils.applyCollapsiblePanelState(panel, title, playerPanelCollapsed, "Golfer / Bảng đấu");
  }

  function applyPlayerSearchQuery(value = "") {
    playerSearchQuery = window.LB.appUtils.normalizeSearchText(value);
    playerSearchInputValue = value;
    if (playerSearchQuery && playerPanelCollapsed) {
      playerPanelCollapsed = false;
      localStorage.setItem(PLAYER_PANEL_COLLAPSED_KEY, "0");
      applyPlayerPanelCollapsedState();
    }
    window.LB.appPlayer.renderPlayers();
  }

  function syncPlayerSearchField() {
    const input = window.LB.appPlayer.getPlayerSearchField();
    if (!input) return;
    if (document.activeElement !== input && input.value !== playerSearchInputValue) {
      input.value = playerSearchInputValue;
    }
  }

  function togglePlayerPanelCollapsed() {
    playerPanelCollapsed = !playerPanelCollapsed;
    localStorage.setItem(PLAYER_PANEL_COLLAPSED_KEY, playerPanelCollapsed ? "1" : "0");
    applyPlayerPanelCollapsedState();
  }

  function applyFlightConfigPanelCollapsedState() {
    const panel = document.querySelector(".flight-config-panel");
    const title = panel?.querySelector(".panel-title");
    window.LB.appUtils.applyCollapsiblePanelState(panel, title, flightConfigPanelCollapsed, "Cài đặt bảng đấu");
  }

  function toggleFlightConfigPanelCollapsed() {
    flightConfigPanelCollapsed = !flightConfigPanelCollapsed;
    localStorage.setItem(FLIGHT_CONFIG_PANEL_COLLAPSED_KEY, flightConfigPanelCollapsed ? "1" : "0");
    applyFlightConfigPanelCollapsedState();
  }

  function applyOperatorLinkPanelCollapsedState() {
    const panel = document.querySelector(".operator-link-panel");
    const head = panel?.querySelector(".operator-link-head");
    window.LB.appUtils.applyCollapsiblePanelState(panel, head, operatorLinkPanelCollapsed, "Liên kết TourSystem36");
  }

  function toggleOperatorLinkPanelCollapsed() {
    operatorLinkPanelCollapsed = !operatorLinkPanelCollapsed;
    localStorage.setItem(OPERATOR_LINK_PANEL_COLLAPSED_KEY, operatorLinkPanelCollapsed ? "1" : "0");
    applyOperatorLinkPanelCollapsedState();
    if (!operatorLinkPanelCollapsed && !(state().operator.tournaments || []).length) {
      void window.LB.appUtils.loadOperatorCatalogOnDemand(false);
    }
  }

  function applyRosterImportPanelCollapsedState() {
    const panel = document.querySelector(".roster-import-panel");
    const head = panel?.querySelector(".roster-import-title");
    window.LB.appUtils.applyCollapsiblePanelState(panel, head, rosterImportPanelCollapsed, "Import danh sách golfer");
  }

  function toggleRosterImportPanelCollapsed() {
    rosterImportPanelCollapsed = !rosterImportPanelCollapsed;
    localStorage.setItem(ROSTER_IMPORT_PANEL_COLLAPSED_KEY, rosterImportPanelCollapsed ? "1" : "0");
    applyRosterImportPanelCollapsedState();
  }

  function applyScoreEntryPanelCollapsedState() {
    const panel = document.querySelector(".score-entry-panel");
    const title = panel?.querySelector(".panel-title");
    window.LB.appUtils.applyCollapsiblePanelState(panel, title, scoreEntryPanelCollapsed, "Nhập điểm vận hành");
    if (scoreEntryPanelCollapsed) window.LB.appUtils.resetScoreFlyHeader();
    else window.LB.appUtils.invalidateScoreFlyHeader();
  }

  function toggleScoreEntryPanelCollapsed() {
    scoreEntryPanelCollapsed = !scoreEntryPanelCollapsed;
    localStorage.setItem(SCORE_ENTRY_PANEL_COLLAPSED_KEY, scoreEntryPanelCollapsed ? "1" : "0");
    applyScoreEntryPanelCollapsedState();
  }

  function applyFinalResultsPanelCollapsedState() {
    const panel = document.getElementById("final-results-panel");
    const title = panel?.querySelector(".panel-title");
    window.LB.appUtils.applyCollapsiblePanelState(panel, title, finalResultsPanelCollapsed, "Kết quả chung cuộc");
  }

  function toggleFinalResultsPanelCollapsed() {
    finalResultsPanelCollapsed = !finalResultsPanelCollapsed;
    localStorage.setItem(FINAL_RESULTS_PANEL_COLLAPSED_KEY, finalResultsPanelCollapsed ? "1" : "0");
    applyFinalResultsPanelCollapsedState();
  }

  function applyOcrFormCollapsedState() {
    const form = document.getElementById("ocr-form");
    const title = form?.querySelector(".ocr-form-title");
    window.LB.appUtils.applyCollapsiblePanelState(form, title, ocrFormCollapsed, "OCR nhập điểm scorecard");
  }

  function toggleOcrFormCollapsed() {
    ocrFormCollapsed = !ocrFormCollapsed;
    localStorage.setItem(OCR_FORM_COLLAPSED_KEY, ocrFormCollapsed ? "1" : "0");
    applyOcrFormCollapsedState();
  }

  function applyMobileDashboardOverviewState() {
    const tournament = document.getElementById("tournament-form");
    const summary = document.querySelector(".summary-panel");
    window.LB.appUtils.applyMobileOverviewPanelState(
      tournament,
      tournament?.querySelector(".mobile-overview-title"),
      mobileTournamentOverviewCollapsed,
      "Thông tin giải"
    );
    window.LB.appUtils.applyMobileOverviewPanelState(
      summary,
      summary?.querySelector(".mobile-overview-title"),
      mobileLiveOverviewCollapsed,
      "Trạng thái live"
    );
  }

  function handleMobileDashboardOverviewScroll() {
    const isMobileDashboard = window.matchMedia("(max-width: 640px)").matches
      && !!document.querySelector("#view-dashboard.active");
    const summaryPanel = document.querySelector(".summary-panel");
    const nextScrollY = Math.max(0, window.scrollY);
    const delta = nextScrollY - mobileDashboardLastScrollY;
    mobileDashboardLastScrollY = nextScrollY;
    if (!isMobileDashboard || Date.now() < mobileDashboardScrollCooldownUntil || Math.abs(delta) < 2) return;

    if (nextScrollY < 120) {
      if (mobileTournamentOverviewCollapsed || mobileLiveOverviewCollapsed) {
        window.LB.appUtils.setMobileDashboardOverviewCollapsed(false);
      }
      return;
    }

    if (delta > 0) {
      mobileDashboardDownTravel += delta;
      mobileDashboardUpTravel = 0;
      const summaryTop = summaryPanel
        ? summaryPanel.getBoundingClientRect().top + nextScrollY
        : Number.POSITIVE_INFINITY;
      if (
        nextScrollY > summaryTop + 48
        && mobileDashboardDownTravel >= 90
        && (!mobileTournamentOverviewCollapsed || !mobileLiveOverviewCollapsed)
      ) {
        window.LB.appUtils.setMobileDashboardOverviewCollapsed(true);
      }
      return;
    }

    mobileDashboardUpTravel += Math.abs(delta);
    mobileDashboardDownTravel = 0;
    if (
      mobileDashboardUpTravel >= 130
      && (mobileTournamentOverviewCollapsed || mobileLiveOverviewCollapsed)
    ) {
      window.LB.appUtils.setMobileDashboardOverviewCollapsed(false);
    }
  }

  function handleClick(event) {
    const target = event.target.closest("[data-action]");
    if (!target) return;
    const action = target.dataset.action;

    if (action === "copy-ocr-fallback") {
      const index = target.dataset.index;
      const input = document.querySelector(`.ocr-score-string-fallback[data-index="${index}"]`);
      if (!input) return;
      const scoreString = input.value;
      
      let success = false;
      try {
        const tempTextarea = document.createElement("textarea");
        tempTextarea.value = scoreString;
        tempTextarea.style.position = "fixed";
        tempTextarea.style.opacity = "0";
        document.body.appendChild(tempTextarea);
        tempTextarea.select();
        tempTextarea.setSelectionRange(0, 99999);
        success = document.execCommand("copy");
        document.body.removeChild(tempTextarea);
      } catch(e) {}
      
      const originalText = target.textContent;
      const onSuccess = () => {
        window.LB.pendingPasteScores = scoreString.split(/[\s,]+/).map(s => String(s).trim().toLowerCase());
        target.textContent = "Đã Copy!";
        target.classList.add("success", "is-ok");
        target.style.backgroundColor = "var(--emerald)";
        target.style.color = "white";
        target.style.borderColor = "var(--emerald)";
        setTimeout(() => {
          target.textContent = originalText;
          target.classList.remove("success", "is-ok");
          target.style.backgroundColor = "";
          target.style.color = "";
          target.style.borderColor = "";
        }, 2000);
      };
      
      if (success) {
        onSuccess();
      } else if (navigator.clipboard && window.isSecureContext) {
        navigator.clipboard.writeText(scoreString).then(onSuccess).catch(err => alert("Copy thất bại: " + err));
      } else {
        alert("Không thể copy tự động. Vui lòng tự bôi đen chuỗi bên cạnh để copy.");
      }
      return;
    }

    const suppressToggle = Date.now() < suppressPanelHeaderToggleUntil;
    const clickedCollapseButton = !!event.target.closest(".panel-collapse-button");
    if (action === "toggle-player-panel") {
      if (suppressToggle) return;
      if (!clickedCollapseButton && event.target.closest("button, input, select, textarea")) return;
      if (playerSearchPointerActive) return;
      togglePlayerPanelCollapsed();
      return;
    }
    if (action === "toggle-flight-config-panel") {
      if (suppressToggle) return;
      if (!clickedCollapseButton && event.target.closest(".flight-toggle-mini, button, input, select, textarea")) return;
      toggleFlightConfigPanelCollapsed();
      return;
    }
    if (action === "toggle-operator-link-panel") {
      if (suppressToggle) return;
      if (!clickedCollapseButton && event.target.closest("button, input, select, textarea")) return;
      toggleOperatorLinkPanelCollapsed();
      return;
    }
    if (action === "toggle-roster-import-panel") {
      if (suppressToggle) return;
      if (!clickedCollapseButton && event.target.closest("button, input, select, textarea")) return;
      toggleRosterImportPanelCollapsed();
      return;
    }
    if (action === "toggle-score-entry-panel") {
      if (suppressToggle) return;
      if (!clickedCollapseButton && event.target.closest(".segmented-mini, button, input, select, textarea")) return;
      toggleScoreEntryPanelCollapsed();
      return;
    }
    if (action === "toggle-final-results-panel") {
      if (suppressToggle) return;
      if (!clickedCollapseButton && event.target.closest("button, input, select, textarea")) return;
      toggleFinalResultsPanelCollapsed();
      return;
    }
    if (action === "toggle-final-awards") {
      if (suppressToggle) return;
      if (!clickedCollapseButton && event.target.closest("button, input, select, textarea")) return;
      const section = event.target.closest(".final-awards-section");
      if (section) {
        section.classList.toggle("is-collapsed");
        const titleRow = section.querySelector(".collapsible-panel-title");
        if (titleRow) titleRow.setAttribute("aria-expanded", !section.classList.contains("is-collapsed"));
      }
      return;
    }
    if (action === "toggle-ocr-form") {
      if (suppressToggle) return;
      toggleOcrFormCollapsed();
      return;
    }
    if (action === "toggle-mobile-tournament-overview") {
      mobileTournamentOverviewCollapsed = !mobileTournamentOverviewCollapsed;
      mobileDashboardScrollCooldownUntil = Date.now() + 520;
      window.LB.appUtils.preserveMobileDashboardScrollAnchor(applyMobileDashboardOverviewState);
      return;
    }
    if (action === "toggle-mobile-live-overview") {
      mobileLiveOverviewCollapsed = !mobileLiveOverviewCollapsed;
      mobileDashboardScrollCooldownUntil = Date.now() + 520;
      window.LB.appUtils.preserveMobileDashboardScrollAnchor(applyMobileDashboardOverviewState);
      return;
    }
    if (action === "ocr-preview-previous") {
      setOcrPreviewIndex(ocrPreviewIndex - 1);
      return;
    }
    if (action === "ocr-preview-next") {
      setOcrPreviewIndex(ocrPreviewIndex + 1);
      return;
    }
    if (action === "ocr-preview-zoom-out") {
      setOcrPreviewScale(ocrPreviewScale - 0.2);
      return;
    }
    if (action === "ocr-preview-zoom-fit") {
      setOcrPreviewScale(1);
      return;
    }
    if (action === "ocr-preview-zoom-in") {
      setOcrPreviewScale(ocrPreviewScale + 0.2);
      return;
    }
    if (action === "show-view") window.LB.appUtils.showView(target.dataset.view);
    if (action === "new-tournament") {
      if (window.LB.appUtils.getCapabilities().cloudRuntime) {
        alert("Mode 3 đã cố định tournament. Không tạo giải mới trong màn điều hành online.");
        return;
      }
      if (confirm("Tạo tournament local mới? Dữ liệu hiện tại vẫn nằm trong localStorage snapshot nếu đã publish.")) {
        if (state().simulator?.active === true) void window.LB.storage.cleanupSimulatorSnapshots?.();
        window.LB.storage.resetState();
        window.LB.appUtils.render();
      }
    }
    if (action === "add-player") {
      window.LB.appPlayer.addPlayer();
      window.LB.appFinal.invalidatePublishedFinalResults();
      window.LB.appUtils.persistAndRender();
    }
    if (action === "confirm-flight-config") {
      window.LB.appPlayer.confirmFlightConfig();
      return;
    }
    if (action === "print-players") {
      window.LB.appPlayer.printPlayerRoster(target.dataset.printLayout || "landscape");
      return;
    }
    if (action === "remove-player") {
      window.LB.appPlayer.removePlayer(target.closest(".player-row")?.dataset.playerId);
      window.LB.appFinal.invalidatePublishedFinalResults();
      window.LB.appUtils.persistAndRender();
    }
    if (action === "confirm-player-import-review") {
      window.LB.appPlayer.confirmPlayerImportReview(target.closest(".player-row")?.dataset.playerId || target.dataset.playerId || "");
      return;
    }
    if (action === "set-score-entry-division") {
      scoreEntryDivision = target.dataset.division || "";
      renderScoreTable();
    }
    if (action === "set-leaderboard-division") {
      const nextDivision = target.dataset.division || "";
      leaderboardDivision = leaderboardDivision === nextDivision ? "" : nextDivision;
      renderLeaderboard();
    }
    if (action === "confirm-score") {
      window.LB.appUtils.confirmScore(target.dataset.playerId, target.dataset.hole);
      window.LB.appUtils.persistAndRender();
      void publishOperatorLinkSnapshot({ silent: true, skipIfUnchanged: false });
      scheduleOperatorSnapshotPublish(250);
    }
    if (action === "confirm-player-scores") {
      const confirmed = window.LB.appPlayer.confirmPlayerScores(target.dataset.playerId);
      if (confirmed) {
        window.LB.appUtils.persistAndRender();
        void publishOperatorLinkSnapshot({ silent: true, skipIfUnchanged: false });
        scheduleOperatorSnapshotPublish(250);
      }
    }
    if (action === "add-special-award") {
      const finalResults = window.LB.appFinal.getFinalResultsState();
      finalResults.specialAwards.push({
        id: `special-${Date.now().toString(36)}`,
        name: "",
        playerId: "",
        note: ""
      });
      window.LB.appFinal.markFinalResultsDraft();
      window.LB.storage.saveState();
      renderFinalResultsPanel();
    }
    if (action === "remove-special-award") {
      const finalResults = window.LB.appFinal.getFinalResultsState();
      finalResults.specialAwards = finalResults.specialAwards.filter(item => item.id !== target.dataset.awardId);
      window.LB.appFinal.markFinalResultsDraft();
      window.LB.storage.saveState();
      renderFinalResultsPanel();
    }
    if (action === "add-hio-prize") {
      const finalResults = window.LB.appFinal.getFinalResultsState();
      window.LB.appFinal.syncFinalHoleInOneRows(finalResults);
      const award = finalResults.holeInOneAwards[Number(target.dataset.finalHioIndex) || 0];
      if (award) {
        award.prizes = window.LB.appFinal.normalizePrizeList(award.prizes, { keepEmpty: true, ensureOne: true });
        award.prizes.push("");
        window.LB.appFinal.markFinalResultsDraft();
        window.LB.storage.saveState();
        renderFinalResultsPanel();
      }
      return;
    }
    if (action === "remove-hio-prize") {
      const finalResults = window.LB.appFinal.getFinalResultsState();
      window.LB.appFinal.syncFinalHoleInOneRows(finalResults);
      const award = finalResults.holeInOneAwards[Number(target.dataset.finalHioIndex) || 0];
      const prizeIndex = Number(target.dataset.finalPrizeIndex) || 0;
      if (award) {
        award.prizes = window.LB.appFinal.normalizePrizeList(award.prizes, { keepEmpty: true, ensureOne: true });
        award.prizes.splice(prizeIndex, 1);
        award.prizes = window.LB.appFinal.normalizePrizeList(award.prizes, { keepEmpty: true, ensureOne: true });
        window.LB.appFinal.markFinalResultsDraft();
        window.LB.storage.saveState();
        renderFinalResultsPanel();
      }
      return;
    }
    if (action === "publish-final-results") void publishFinalResults();
    if (action === "print-results-landscape") window.LB.appFinal.printFinalResults("landscape");
    if (action === "print-results-portrait") window.LB.appFinal.printFinalResults("portrait");
    if (action === "back-to-top") window.LB.appUtils.scrollToTop();
    if (action === "publish-roster") publishRoster();
    if (action === "copy-share") window.LB.appUtils.copyShareUrl();
    if (action === "run-ocr") {
      if (!ocrProcessing) runOcr();
    }
    if (action === "ocr-editor-rotate-ccw" && ocrEditorInstance) ocrEditorInstance.rotate('ccw');
    if (action === "ocr-editor-rotate-cw" && ocrEditorInstance) ocrEditorInstance.rotate('cw');
    if (action === "ocr-editor-enhance" && ocrEditorInstance) {
        ocrEditorInstance.toggleEnhance();
        target.classList.toggle('active', ocrEditorInstance.state.isEnhanced);
    }
    if (action === "ocr-editor-crop") toggleCropMode();
    if (action === "ocr-preview-zoom-fit") centerOcrPreview();
    if (action === "run-roster-ocr") {
      if (!ocrProcessing) window.LB.appOcr.runRosterImportOcr();
    }
    if (action === "connect-supabase") window.LB.appUtils.checkSupabaseStatus(true);
    if (action === "refresh-operator-tournaments") void window.LB.appUtils.loadOperatorCatalogOnDemand(true);
    if (action === "link-operator-tournament") window.LB.appUtils.linkOperatorTournament();
    if (action === "refresh-toursystem-scores") window.LB.appTs36.refreshTourSystemScores();
    if (action === "export-workspace-backup") window.LB.appUtils.exportWorkspaceBackup();
    if (action === "import-workspace-backup") {
      document.getElementById("workspace-backup-file")?.click();
    }
    if (action === "export-static-live") window.LB.appUtils.exportStaticLivePage();
    if (action === "reset-suggested-matches") {
      window.LB.appTs36.resetTourSystemMatchReview();
      return;
    }
    if (action === "select-ts36-match") {
      state().matchReview.selectedTs36Id = target.dataset.matchId || "";
      const match = (state().ts36Matches || []).find(item => item.id === state().matchReview.selectedTs36Id);
      state().matchReview.selectedPlayerId = match?.linkedPlayerId || match?.suggestedPlayerId || "";
      window.LB.storage.saveState();
      renderTs36MatchReview();
    }
    if (action === "select-roster-player") {
      state().matchReview.selectedPlayerId = target.dataset.playerId || "";
      window.LB.storage.saveState();
      renderTs36MatchReview();
    }
    if (action === "accept-suggested-match") {
      const match = (state().ts36Matches || []).find(item => item.id === target.dataset.matchId);
      if (match?.suggestedPlayerId) {
        const player = state().players.find(item => item.id === match.suggestedPlayerId);
        window.LB.appTs36.linkTourSystemMatch(match.id, match.suggestedPlayerId, { source: "accepted_suggestion" });
        window.LB.appUtils.persistAndRender();
        scheduleOperatorSnapshotPublish();
        window.LB.appTs36.syncAcceptedTourSystemMatchToBridge(match, player).then(result => {
          if (!result.ok && result.reason !== "local_only") console.warn("[Supabase] accept suggested match failed:", result.reason);
        });
      }
    }
    if (action === "link-selected-match") {
      const matchId = state().matchReview.selectedTs36Id || target.dataset.matchId || "";
      const playerId = state().matchReview.selectedPlayerId || target.dataset.playerId || "";
      if (matchId && playerId) {
        const match = (state().ts36Matches || []).find(item => item.id === matchId);
        const player = state().players.find(item => item.id === playerId);
        window.LB.appTs36.linkTourSystemMatch(matchId, playerId, { source: "manual" });
        window.LB.appUtils.persistAndRender();
        scheduleOperatorSnapshotPublish();
        window.LB.appTs36.syncAcceptedTourSystemMatchToBridge(match, player).then(result => {
          if (!result.ok && result.reason !== "local_only") console.warn("[Supabase] accept manual match failed:", result.reason);
        });
      }
    }
    if (action === "refresh-settings") window.LB.appUtils.loadServiceSettings(true);
    if (action === "save-settings") window.LB.appUtils.saveServiceSettings();
    if (action === "clear-settings-api-key") window.LB.appUtils.clearServiceApiKey();
  }

  function handleKeydown(event) {
    if (window.LB.appUtils.handleScoreGridKeydown(event)) return;
    const searchInput = event.target.closest(".player-search");
    if (searchInput && event.key === "Enter") {
      event.preventDefault();
      window.LB.appUtils.applyScopedSearchQuery(searchInput);
      searchInput.blur();
      return;
    }
    if (event.target.closest("button, input, select, textarea")) return;
    const target = event.target.closest("[data-action]");
    if (!target || !["Enter", " "].includes(event.key)) return;
    const action = target.dataset.action;
    if (action === "toggle-player-panel") {
      event.preventDefault();
      togglePlayerPanelCollapsed();
    } else if (action === "toggle-flight-config-panel") {
      event.preventDefault();
      toggleFlightConfigPanelCollapsed();
    } else if (action === "toggle-operator-link-panel") {
      event.preventDefault();
      toggleOperatorLinkPanelCollapsed();
    } else if (action === "toggle-roster-import-panel") {
      event.preventDefault();
      toggleRosterImportPanelCollapsed();
    } else if (action === "toggle-score-entry-panel") {
      event.preventDefault();
      toggleScoreEntryPanelCollapsed();
    } else if (action === "toggle-final-results-panel") {
      event.preventDefault();
      toggleFinalResultsPanelCollapsed();
    } else if (action === "toggle-final-awards") {
      event.preventDefault();
      const section = target.closest(".final-awards-section");
      if (section) {
        section.classList.toggle("is-collapsed");
        const titleRow = section.querySelector(".collapsible-panel-title");
        if (titleRow) titleRow.setAttribute("aria-expanded", !section.classList.contains("is-collapsed"));
      }
    } else if (action === "toggle-ocr-form") {
      event.preventDefault();
      toggleOcrFormCollapsed();
    } else if (action === "toggle-mobile-tournament-overview") {
      event.preventDefault();
      mobileTournamentOverviewCollapsed = !mobileTournamentOverviewCollapsed;
      mobileDashboardScrollCooldownUntil = Date.now() + 520;
      window.LB.appUtils.preserveMobileDashboardScrollAnchor(applyMobileDashboardOverviewState);
    } else if (action === "toggle-mobile-live-overview") {
      event.preventDefault();
      mobileLiveOverviewCollapsed = !mobileLiveOverviewCollapsed;
      mobileDashboardScrollCooldownUntil = Date.now() + 520;
      window.LB.appUtils.preserveMobileDashboardScrollAnchor(applyMobileDashboardOverviewState);
    }
  }

  function focusPendingScoreGridCell() {
    const pending = pendingScoreGridFocus;
    pendingScoreGridFocus = null;
    if (!pending) return;
    const input = Array.from(document.querySelectorAll(".score-input")).find(item => (
      item.getClientRects().length &&
      item.dataset.playerId === pending.playerId && item.dataset.hole === pending.hole
    ));
    if (!input) return;
    input.focus({ preventScroll: true });
    input.select();
    // input.scrollIntoView({ block: "nearest", inline: "nearest" });
  }

  function handleSearchPointerUp(event) {
    if (!playerSearchPointerActive) return;
    playerSearchPointerActive = false;
    suppressPanelHeaderToggleUntil = Date.now() + 350;
    event.stopPropagation();
  }

  function handleWindowScroll() {
    handleMobileDashboardOverviewScroll();
    const shouldShow = window.scrollY > 320 && window.LB.appUtils.isBackToTopViewActive();
    if (shouldShow === backToTopVisible) return;
    backToTopVisible = shouldShow;
    document.querySelectorAll(".back-to-top-fab").forEach(button => {
      button.classList.toggle("is-visible", backToTopVisible);
    });
  }

  function renderSimulatorLocalOnlyState() {
    const simulation = window.LB.appUtils.getActiveSimulationMode();
    const active = simulation.active;
    const topbar = document.querySelector(".app-topbar");
    const warning = document.getElementById("simulator-local-only-warning");
    if (warning) {
      warning.hidden = !active;
      warning.classList.toggle("is-simulator2", simulation.mode === "simulator2");
      if (active) {
        warning.textContent = simulation.detail ? `${simulation.title} · ${simulation.detail}` : simulation.title;
      }
    }
    topbar?.classList.toggle("is-simulation-active", active);
    topbar?.classList.toggle("is-simulator2-active", simulation.mode === "simulator2");
    document.body.classList.toggle("is-simulation-active", active);
    if (active) {
      document.body.dataset.simulationMode = simulation.mode;
    } else {
      delete document.body.dataset.simulationMode;
    }
    document.querySelectorAll('[data-action="publish-roster"]').forEach(button => {
      const simulatorLocalOnly = state().simulator?.active === true;
      button.disabled = simulatorLocalOnly || rosterPublishing;
      button.title = simulatorLocalOnly
        ? "Simulator local-only, không ghi cloud"
        : "";
    });
    if (state().simulator?.active === true) {
      window.clearTimeout(operatorSnapshotPublishTimer);
      operatorSnapshotNextPublishAt = 0;
    }
  }

  function validateOperatorTournamentRuntime(tournament) {
    const normalizedTournament = window.LB.appUtils.normalizeOperatorTournament(tournament || {});
    const capabilities = window.LB.appUtils.getCapabilities();
    if (normalizedTournament.managementMode === "flexible" && !capabilities.cloudRuntime) {
      return {
        ok: false,
        reason: "flexible_requires_cloud_runtime",
        message: "Tournament này dùng Điều hành linh động. Mở /leaderboard/manage hoặc chạy local fallback bằng cloud adapter để lấy lease độc quyền."
      };
    }
    return { ok: true, tournament: normalizedTournament };
  }

  function unlockTournamentFormInputs() {
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
    return true;
  }

  function getCourseGridLockTitle(lockedByCloudRuntime) {
    return lockedByCloudRuntime
      ? "Mode 3 khóa Par/SI theo course snapshot của tournament."
      : "Par/SI đang khóa vì sân được chọn từ offline list. Đổi tên sân thủ công để mở nhập tay.";
  }

  function getRosterImportGateMessage({ flightConfigState, hasFlights, requiresSystem36, s36Count, ready } = {}) {
    if (!flightConfigState?.ok) return flightConfigState?.message || "Cần kiểm tra Cài đặt bảng đấu trước khi import.";
    if (!hasFlights) return "Cần tạo ít nhất 1 bảng trước khi import danh sách.";
    if (requiresSystem36 && !s36Count) return "Tournament đã link TS36 cần có ít nhất 1 bảng S36 trước khi import danh sách.";
    if (!ready) return "Hãy bấm Xác nhận bảng trước khi import danh sách.";
    return "";
  }

  function markRosterImportReady() {
    state().flightConfig = window.LB.appPlayer.normalizeFlightConfig({
      ...(state().flightConfig || {}),
      rosterImportReady: true
    });
    return state().flightConfig;
  }

  function scheduleOperatorFlightConfigPublish() {
    window.clearTimeout(flightConfigPublishTimer);
    flightConfigPublishTimer = window.setTimeout(async () => {
      const linked = state().operator.linkedTournament;
      const code = state().operator.privateCode || state().tournament.operatorPrivateCode || "";
      if (!linked?.id || !code || !window.LB.appPlayer.validateFlightConfig().ok) return;
      await publishOperatorLinkSnapshot({ silent: true });
      renderOperatorTournamentControls();
    }, 800);
  }

  function renderOperatorTournamentControls() {
    const select = document.getElementById("operator-tournament-select");
    const input = document.getElementById("operator-private-code");
    const linked = state().operator.linkedTournament;
    if (input && String(input.value) !== String(state().operator.privateCode || "")) {
      input.value = state().operator.privateCode || "";
    }
    const cadenceInput = document.getElementById("operator-score-poll-seconds");
    if (cadenceInput && document.activeElement !== cadenceInput) {
      cadenceInput.value = window.LB.appUtils.getOperatorScorePollSeconds();
    }
    const autoLiveInput = document.getElementById("operator-auto-live-seconds");
    if (autoLiveInput && document.activeElement !== autoLiveInput) {
      autoLiveInput.value = window.LB.appSnapshot.getOperatorSnapshotAutoPublishSeconds();
    }
    const cadenceStatus = document.getElementById("operator-sync-cadence-status");
    if (cadenceStatus) {
      cadenceStatus.textContent = `Tự nhận điểm TS36: ${window.LB.appUtils.getOperatorScorePollSeconds()}s · Live leaderboard: ${window.LB.appSnapshot.getOperatorSnapshotAutoPublishSeconds()}s`;
    }
    const liveNotificationModeInput = document.getElementById("live-notification-retention-mode");
    if (liveNotificationModeInput && document.activeElement !== liveNotificationModeInput) {
      liveNotificationModeInput.value = getOperatorLiveNotificationRetentionMode();
    }
    const liveNotificationAgeInput = document.getElementById("live-notification-max-age-minutes");
    if (liveNotificationAgeInput && document.activeElement !== liveNotificationAgeInput) {
      liveNotificationAgeInput.value = getOperatorLiveNotificationMaxAgeMinutes();
    }
    const liveNotificationItemsInput = document.getElementById("live-notification-max-items");
    if (liveNotificationItemsInput && document.activeElement !== liveNotificationItemsInput) {
      liveNotificationItemsInput.value = getOperatorLiveNotificationMaxItems();
    }
    const liveNotificationStatus = document.getElementById("live-notification-settings-status");
    if (liveNotificationStatus) {
      liveNotificationStatus.textContent = getOperatorLiveNotificationRetentionMode() === "count"
        ? `Giữ theo số lượng · ${getOperatorLiveNotificationMaxItems()} sự kiện`
        : `Giữ theo thời gian · ${getOperatorLiveNotificationMaxAgeMinutes()} phút`;
    }
    if (!select) return;

    const currentId = linked?.id || state().tournament.operatorTournamentId || "";
    const rows = state().operator.tournaments || [];
    select.innerHTML = [
      `<option value="">Chọn tournament đang mở</option>`,
      ...rows.map(item => {
        const meta = [item.courseName, item.operatorName].filter(Boolean).join(" · ");
        return `<option value="${window.LB.appUtils.escapeHtml(item.id)}" ${item.id === currentId ? "selected" : ""}>${window.LB.appUtils.escapeHtml(item.title)}${meta ? ` — ${window.LB.appUtils.escapeHtml(meta)}` : ""}</option>`;
      })
    ].join("");

    if (linked?.id) {
      const publishedCount = Number.isFinite(Number(state().operator.rosterPublishedCount))
        ? Number(state().operator.rosterPublishedCount)
        : state().players.length;
      const rosterNote = state().operator.rosterPublishedAt
        ? ` ${publishedCount ? `Đã nạp ${publishedCount} golfer` : "Bridge roster đang trống"} lúc ${new Date(state().operator.rosterPublishedAt).toLocaleTimeString("vi-VN")}.`
        : " Chưa nạp danh sách; player-panel vẫn chỉ lưu local.";
      window.LB.appUtils.setOperatorLinkStatus(`Đã link: ${linked.title} · ${linked.courseName}.${rosterNote}`, "linked");
    } else if (!rows.length) {
      window.LB.appUtils.setOperatorLinkStatus(
        operatorLinkPanelCollapsed
          ? "Chế độ Local. Mở khung này khi cần liên kết TourSystem36."
          : "Bấm Làm mới để tải tournament đang mở từ TourSystem36 Admin."
      );
    } else {
      window.LB.appUtils.setOperatorLinkStatus("Chọn tournament đang mở từ TS36 Admin để tự tải cấu hình sân.");
    }
  }

  function renderOfflineCourseCatalogOptions() {
    const datalist = document.getElementById("course-name-options");
    if (!datalist) return;
    datalist.innerHTML = offlineCourseCatalog.map(course => `
      <option value="${window.LB.appUtils.escapeHtml(course.name)}" label="${window.LB.appUtils.escapeHtml(course.location ? `${course.location} · Par ${course.totalPar}` : `Par ${course.totalPar}`)}"></option>
    `).join("");
  }

  function renderOfflineCourseStatus() {
    if (offlineCourseCatalogNotice) {
      window.LB.appPlayer.setOfflineCourseStatus(offlineCourseCatalogNotice, "linked");
      return;
    }
    if (offlineCourseCatalogLoading) {
      window.LB.appPlayer.setOfflineCourseStatus("Đang đọc danh sách sân offline...");
      return;
    }
    if (offlineCourseCatalog.length) {
      window.LB.appPlayer.setOfflineCourseStatus(`Đã nạp ${offlineCourseCatalog.length} sân từ ${offlineCourseCatalogSource}. Chọn trong ô Sân golf để tự điền Par/SI.`, "linked");
      return;
    }
    window.LB.appPlayer.setOfflineCourseStatus(
      offlineCourseCatalogError || "Chưa có file offline-data/master-courses.json. Bạn vẫn có thể nhập Par/SI thủ công.",
      offlineCourseCatalogLoaded ? "" : "error"
    );
  }

  async function loadOfflineCourseCatalog() {
    if (offlineCourseCatalogLoaded || offlineCourseCatalogLoading) return offlineCourseCatalog;
    offlineCourseCatalogLoading = true;
    offlineCourseCatalogError = "";
    renderOfflineCourseStatus();

    let lastError = "";
    for (const path of OFFLINE_COURSE_CATALOG_PATHS) {
      try {
        const response = await fetch(`${path}?v=${Date.now()}`, { cache: "no-store" });
        if (response.status === 404) {
          lastError = `Chưa thấy ${path}.`;
          continue;
        }
        if (!response.ok) throw new Error(`${path} trả về HTTP ${response.status}`);
        const payload = await response.json();
        const courses = window.LB.appPlayer.normalizeOfflineCourseCatalogPayload(payload);
        if (!courses.length) throw new Error(`${path} không có courses hợp lệ.`);
        offlineCourseCatalog = courses;
        offlineCourseCatalogSource = path;
        offlineCourseCatalogNotice = "";
        break;
      } catch (err) {
        lastError = err.message || `Không đọc được ${path}.`;
      }
    }

    offlineCourseCatalogLoaded = true;
    offlineCourseCatalogLoading = false;
    if (!offlineCourseCatalog.length) {
      offlineCourseCatalogError = `${lastError || "Chưa có file sân offline."} Copy file TS36 export vào offline-data/master-courses.json.`;
    }
    renderOfflineCourseCatalogOptions();
    renderOfflineCourseStatus();
    return offlineCourseCatalog;
  }

  function findOfflineCourseCatalogMatch(value = "") {
    const target = window.LB.appUtils.keyText(value);
    if (!target) return null;
    return offlineCourseCatalog.find(course => course.searchKeys.includes(target)) || null;
  }

  function applyOfflineCourseSelection(value = "", options = {}) {
    const course = findOfflineCourseCatalogMatch(value);
    if (!course) {
      offlineCourseCatalogNotice = "";
      renderOfflineCourseStatus();
      return false;
    }
    state().course = state().course || {};
    state().course.holes = window.LB.appPlayer.normalizeLeaderboardCourseHoles(course.holes_data || course.holes || []);
    state().course.offlineCatalogCourse = {
      id: course.id,
      name: course.name,
      displayName: course.displayName,
      source: offlineCourseCatalogSource
    };
    state().tournament.courseName = course.name;
    offlineCourseCatalogNotice = `Đã nạp Par/SI từ ${course.displayName} (Par ${course.totalPar}). Par/SI đang khóa theo dữ liệu sân offline.`;
    if (options.updateInput !== false) window.LB.appUtils.setValue("course-name", course.name);
    window.LB.appFinal.invalidatePublishedFinalResults();
    renderOfflineCourseStatus();
    return true;
  }

  function getFilteredPlayers(players = []) {
    return window.LB.appPlayer.getFilteredPlayersForQuery(players, playerSearchQuery);
  }

  function renderScoreTable() {
    const root = document.getElementById("score-table-wrap");
    if (!root) return;
    const sequence = window.LB.scoring.buildPlaySequence(state().tournament.startHole);
    const divisions = window.LB.appPlayer.getDivisionList(state().players);
    if (scoreEntryDivision && !divisions.includes(scoreEntryDivision)) scoreEntryDivision = "";
    if (!scoreEntryDivision && divisions.length) scoreEntryDivision = divisions[0];
    const visiblePlayers = scoreEntryDivision
      ? state().players.filter(player => window.LB.appPlayer.getPlayerDivision(player) === scoreEntryDivision)
      : state().players;
    const filteredPlayers = window.LB.appPlayer.getFilteredPlayersForQuery(visiblePlayers, scoreEntrySearchQuery);
    const sortedPlayers = window.LB.appPlayer.sortScoreEntryPlayers(filteredPlayers);
    if (!state().players.length) {
      root.innerHTML = `<div class="empty-state">Chưa có golfer trong tournament.</div>`;
      window.LB.appUtils.resetScoreFlyHeader();
      return;
    }
    root.innerHTML = `
      ${renderScoreEntryTabs(divisions)}
      ${sortedPlayers.length ? window.LB.appUtils.renderScoreEntryTable(sortedPlayers, sequence) : `<div class="empty-state">Không tìm thấy golfer phù hợp.</div>`}
    `;
    window.LB.appUtils.bindScoreTableViewport(root);
  }

  function renderScoreEntryTabs(divisions = []) {
    if (!divisions.length) return "";
    return `
      <div class="leaderboard-tabs score-entry-tabs" role="tablist" aria-label="Bảng đấu nhập điểm">
        ${divisions.map(division => `
          <button type="button" class="${division === scoreEntryDivision ? "active" : ""}" data-action="set-score-entry-division" data-division="${window.LB.appUtils.escapeHtml(division)}">${window.LB.appUtils.escapeHtml(window.LB.appPlayer.formatDivisionLabel(division))}</button>
        `).join("")}
      </div>
    `;
  }

  function updateScoreFlyHeader() {
    scoreFlyHeaderFrame = 0;
    const isMobile = window.matchMedia("(max-width: 640px)").matches;
    const sourceViewport = document.querySelector(
      isMobile
        ? "#score-table-wrap .score-mobile-list"
        : "#score-table-wrap .score-table-viewport"
    );
    const sourceTable = isMobile
      ? sourceViewport?.querySelector(".score-mobile-header")
      : sourceViewport?.querySelector(".score-table");
    const sourceHead = isMobile ? sourceTable : sourceTable?.querySelector("thead");
    const flyHeader = window.LB.appUtils.ensureScoreFlyHeader();
    const flyViewport = flyHeader.querySelector(".score-table-fly-viewport");
    if (!sourceViewport || !sourceTable || !sourceHead || !flyViewport || !sourceViewport.getClientRects().length) {
      flyHeader.hidden = true;
      return;
    }

    const top = window.LB.appUtils.getScoreFlyHeaderTop();
    const viewportRect = sourceViewport.getBoundingClientRect();
    const tableRect = sourceViewport.getBoundingClientRect();
    const headRect = sourceHead.getBoundingClientRect();
    const shouldShow = headRect.top < top && tableRect.bottom > top + headRect.height;
    if (!shouldShow) {
      flyHeader.hidden = true;
      return;
    }

    if (scoreFlyHeaderNeedsRebuild || scoreFlyHeaderSourceTable !== sourceTable) {
      window.LB.appUtils.rebuildScoreFlyHeader(sourceTable, sourceHead, flyViewport);
    }

    const left = Math.max(0, viewportRect.left);
    const right = Math.min(window.innerWidth, viewportRect.right);
    flyHeader.style.left = `${left}px`;
    flyHeader.style.top = `${top}px`;
    flyHeader.style.width = `${Math.max(0, right - left)}px`;
    flyHeader.hidden = false;
    flyViewport.scrollLeft = isMobile ? 0 : sourceViewport.scrollLeft;
  }

  function scheduleScoreFlyHeaderUpdate() {
    if (scoreFlyHeaderFrame) return;
    scoreFlyHeaderFrame = window.requestAnimationFrame(updateScoreFlyHeader);
  }

  function renderScoreCell(player, hole, options = {}) {
    const record = window.LB.scoring.getScoreRecord(state(), player.id, hole);
    const official = window.LB.scoring.getOfficialGross(record);
    const operatorGross = parseInt(record.operatorGross, 10);
    const userGross = parseInt(record.userGross, 10);
    const operator = Number.isFinite(operatorGross) && operatorGross > 0 ? operatorGross : "";
    const user = Number.isFinite(userGross) && userGross > 0 ? userGross : "";
    const candidate = operator || user || "";
    const officialGross = parseInt(official, 10);
    const isConfirmedCurrent = !!candidate && Number.isFinite(officialGross) && officialGross === Number(candidate) && !record.ocrPending;
    const isPending = window.LB.appUtils.isScorePendingReview(record);
    const isConflict = isPending && (
      record.conflictStatus === "conflict" ||
      !!record.ocrPending ||
      (operator && user && Number(operator) !== Number(user))
    );
    const isReviewRequired = !!record.ocrPending || !!record.ocrReviewRequired || record.conflictStatus === "conflict";
    const sourceText = record.ocrPending || record.source === "ocr"
      ? "OCR"
      : (user ? `TS36 ${user}` : (operator ? "GO" : (official ? "Đã duyệt" : "")));
    let statusText = "-";
    let statusClass = "is-empty";
    if (isConfirmedCurrent) {
      statusText = "✓";
      statusClass = "is-confirmed";
    } else if (isConflict) {
      statusText = "?";
      statusClass = "is-review";
    } else if (candidate && user && operator && Number(user) === Number(operator)) {
      statusText = "OK";
      statusClass = "is-ok";
    } else if (candidate) {
      statusText = "Chờ";
      statusClass = "is-waiting";
    }
    const scoreToPar = window.LB.appUtils.getScoreToParMeta(hole, candidate);
    const scoreKey = window.LB.appUtils.getScoreKey(player.id, hole);
    const liveClass = liveUpdatedScoreKeys.has(scoreKey) ? "is-live-updated" : "";
    const tagName = options.mobile ? "div" : "td";
    const mobileClass = options.mobile ? "score-mobile-score-cell" : "";
    return `
      <${tagName} class="score-cell ${mobileClass} ${isConfirmedCurrent ? "is-confirmed" : ""} ${isPending ? "is-pending-confirm" : ""} ${isConflict ? "is-conflict" : ""} ${isReviewRequired ? "is-review-required" : ""} ${user ? "has-ts36" : ""} ${scoreToPar.className} ${liveClass}" data-score-key="${window.LB.appUtils.escapeHtml(scoreKey)}" data-score-diff="${window.LB.appUtils.escapeHtml(scoreToPar.diff ?? "")}">
        <input class="score-input" type="number" min="1" max="30" value="${window.LB.appUtils.escapeHtml(candidate)}" placeholder="${window.LB.appUtils.escapeHtml(user || "")}" data-player-id="${window.LB.appUtils.escapeHtml(player.id)}" data-hole="${hole}" aria-label="${window.LB.appUtils.escapeHtml(player.name)} hố ${hole}, par ${window.LB.appUtils.escapeHtml(scoreToPar.par)}">
        <small>${window.LB.appUtils.escapeHtml(sourceText)}</small>
        <span class="score-status-label ${statusClass}" title="${window.LB.appUtils.escapeHtml(isPending ? "Điểm đang chờ GO xác nhận" : "Trạng thái điểm")}">${window.LB.appUtils.escapeHtml(statusText)}</span>
      </${tagName}>
    `;
  }

  function renderLeaderboard() {
    const roots = [document.getElementById("leaderboard-root")].filter(Boolean);
    const allRows = window.LB.scoring.buildLeaderboard(state());
    const discoveredDivisions = Array.from(new Set(allRows.map(row => row.division || row.flight).filter(Boolean)));
    const configuredDivisions = window.LB.appPlayer.getConfiguredDivisionNames();
    const divisions = [
      ...configuredDivisions.filter(division => discoveredDivisions.includes(division)),
      ...discoveredDivisions.filter(division => !configuredDivisions.includes(division))
    ];
    if (leaderboardDivision && !divisions.includes(leaderboardDivision)) leaderboardDivision = "";
    const rows = leaderboardDivision
      ? window.LB.scoring.buildLeaderboard(state(), { division: leaderboardDivision })
      : allRows;
    const table = `${renderLeaderboardTabs(divisions)}${renderLeaderboardTable(rows)}`;
    roots.forEach(root => {
      const before = window.LB.appUtils.captureLeaderboardRowPositions(root);
      root.innerHTML = table;
      window.LB.appUtils.animateLeaderboardRows(root, before);
      bindLeaderboardViewport(root);
    });
  }

  function bindLeaderboardViewport(root) {
    const viewport = root?.querySelector(".leaderboard-table-viewport");
    if (!viewport) return;
    let frame = 0;
    let dragPointerId = null;
    let dragStartX = 0;
    let dragStartScrollLeft = 0;
    let dragMoved = false;
    const schedule = () => {
      if (frame) return;
      frame = window.requestAnimationFrame(() => {
        frame = 0;
        window.LB.appUtils.updateLeaderboardViewportState(viewport);
      });
    };
    const finishDrag = event => {
      if (dragPointerId === null || event.pointerId !== dragPointerId) return;
      if (viewport.hasPointerCapture?.(dragPointerId)) viewport.releasePointerCapture(dragPointerId);
      dragPointerId = null;
      viewport.classList.remove("is-dragging");
      schedule();
    };

    viewport.addEventListener("scroll", schedule, { passive: true });
    viewport.addEventListener("pointerdown", event => {
      if (event.pointerType === "touch" || event.button !== 0) return;
      dragPointerId = event.pointerId;
      dragStartX = event.clientX;
      dragStartScrollLeft = viewport.scrollLeft;
      dragMoved = false;
      viewport.setPointerCapture?.(event.pointerId);
    });
    viewport.addEventListener("pointermove", event => {
      if (dragPointerId === null || event.pointerId !== dragPointerId) return;
      const deltaX = event.clientX - dragStartX;
      if (!dragMoved && Math.abs(deltaX) < 4) return;
      dragMoved = true;
      viewport.classList.add("is-dragging");
      viewport.scrollLeft = dragStartScrollLeft - deltaX;
      event.preventDefault();
    });
    viewport.addEventListener("pointerup", finishDrag);
    viewport.addEventListener("pointercancel", finishDrag);
    viewport.addEventListener("keydown", event => {
      if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
      event.preventDefault();
      const direction = event.key === "ArrowRight" ? 1 : -1;
      viewport.scrollBy({
        behavior: window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches ? "auto" : "smooth",
        left: direction * Math.max(126, Math.round(viewport.clientWidth * 0.48))
      });
    });
    leaderboardViewportResizeObserver?.disconnect();
    leaderboardViewportResizeObserver = typeof ResizeObserver === "function"
      ? new ResizeObserver(schedule)
      : null;
    leaderboardViewportResizeObserver?.observe(viewport);
    schedule();
  }

  function renderLeaderboardTabs(divisions = []) {
    if (!divisions.length) return "";
    return `
      <div class="leaderboard-tabs" role="tablist" aria-label="Bảng đấu leaderboard">
        ${divisions.map(division => `
          <button type="button" class="${division === leaderboardDivision ? "active" : ""}" data-action="set-leaderboard-division" data-division="${window.LB.appUtils.escapeHtml(division)}">${window.LB.appUtils.escapeHtml(window.LB.appPlayer.formatDivisionLabel(division))}</button>
        `).join("")}
      </div>
    `;
  }

  function renderLeaderboardTable(rows) {
    if (!rows.length) return `<div class="empty-state">Chưa có golfer trong tournament.</div>`;
    const holes = Array.from({ length: 18 }, (_, index) => {
      const hole = index + 1;
      return {
        hole,
        ...window.LB.scoring.getHoleConfig(state(), hole)
      };
    });
    return `
      <div class="leaderboard-table-frame">
      <div class="leaderboard-table-viewport" tabindex="0" aria-label="Bảng xếp hạng. Dùng thao tác kéo ngang hoặc phím mũi tên để xem các hố.">
      <table class="leaderboard-table">
        <colgroup>
          <col class="leaderboard-summary-col">
          ${holes.map(() => `<col class="leaderboard-hole-col">`).join("")}
        </colgroup>
        <thead>
          <tr>
            <th class="leaderboard-summary-head">
              <span class="leaderboard-summary-grid">
                <span>#</span>
                <span>Golfer</span>
                <span>Holes</span>
                <span>Gross</span>
                <span>Net</span>
                <span>+/-</span>
                <span>Front</span>
                <span>Back</span>
              </span>
            </th>
            ${holes.map(({ hole, par }) => `<th class="leaderboard-hole-head">H${hole}<small>P${par}</small></th>`).join("")}
          </tr>
        </thead>
        <tbody>
          ${rows.map(row => `
            ${(() => {
              const rankNet = row.scoringMode === "system36" ? row.system36Net : row.net;
              const displayHandicap = row.scoringMode === "system36" && Number.isFinite(row.system36Handicap)
                ? row.system36Handicap
                : row.handicap;
              const playerMetadata = [
                window.LB.appUtils.escapeHtml(row.golferId || ""),
                `HCP ${window.LB.appUtils.escapeHtml(String(displayHandicap ?? "-"))}`,
                row.flightGroup ? `Flight ${window.LB.appUtils.escapeHtml(row.flightGroup)}` : ""
              ].filter(Boolean).join(" · ");
              let front = 0, back = 0, frontPlayed = 0, backPlayed = 0;
              holes.forEach(({ hole }) => {
                const val = Number(row.holeScores[hole]);
                if (Number.isFinite(val) && val > 0) {
                  if (hole <= 9) { front += val; frontPlayed++; }
                  else { back += val; backPlayed++; }
                }
              });
              const frontStr = frontPlayed > 0 ? front : "-";
              const backStr = backPlayed > 0 ? back : "-";
              return `
            <tr class="${row.rank <= 3 ? `is-podium is-rank-${row.rank}` : ""}" data-leaderboard-row data-row-key="${window.LB.appUtils.escapeHtml(window.LB.appUtils.getLeaderboardRowKey(row))}" data-rank="${row.rank}">
              <td class="leaderboard-summary-cell">
                <span class="leaderboard-summary-grid">
                  <span class="leaderboard-rank"><small>${row.rank <= 5 ? "Hạng" : "#"}</small><span>${row.rank}</span></span>
                  <span class="leaderboard-name"><strong>${window.LB.appUtils.escapeHtml(row.name)}</strong><small>${playerMetadata}</small><span class="leaderboard-mobile-summary">Gross ${row.gross || "-"} · Net ${Number.isFinite(rankNet) ? rankNet.toFixed(1).replace(/\.0$/, "") : "-"} · F ${frontStr} · B ${backStr} · ${Number.isFinite(row.toPar) ? window.LB.scoring.formatDiff(row.toPar) : "-"}</span>${row.dynamicDivision && row.registeredDivision && row.dynamicDivision !== row.registeredDivision ? `<em class="leaderboard-division-jump">${window.LB.appUtils.escapeHtml(window.LB.appPlayer.formatDivisionLabel(row.registeredDivision))} → ${window.LB.appUtils.escapeHtml(window.LB.appPlayer.formatDivisionLabel(row.dynamicDivision))}</em>` : ""}</span>
                  <span class="leaderboard-summary-value">${row.holesPlayed}/18</span>
                  <span class="leaderboard-summary-value">${row.gross || "-"}</span>
                  <span class="leaderboard-summary-value">${Number.isFinite(rankNet) ? rankNet.toFixed(1).replace(/\\.0$/, "") : "-"}</span>
                  <span class="leaderboard-summary-value">${Number.isFinite(row.toPar) ? window.LB.scoring.formatDiff(row.toPar) : "-"}</span>
                  <span class="leaderboard-summary-value">${frontStr}</span>
                  <span class="leaderboard-summary-value">${backStr}</span>
                </span>
              </td>
              ${holes.map(({ hole }) => {
                const score = row.holeScores[hole];
                const source = row.holeSources?.[hole] || "";
                const scoreKey = window.LB.appUtils.getScoreKey(row.playerId, hole);
                const liveClass = liveUpdatedScoreKeys.has(scoreKey) ? "is-live-updated" : "";
                return `<td class="leaderboard-hole-cell ${score ? "is-filled" : ""} ${source ? `is-${source}` : ""} ${liveClass}" data-score-key="${window.LB.appUtils.escapeHtml(scoreKey)}"><b>${score || "-"}</b></td>`;
              }).join("")}
            </tr>
              `;
            })()}
          `).join("")}
        </tbody>
      </table>
      </div>
      <span class="leaderboard-scroll-fade" aria-hidden="true"></span>
      </div>
    `;
  }

  function normalizeFinalNetCutLimit(value) {
    if (value === null || value === undefined || value === "" || value === "none") return null;
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) return null;
    const limit = Math.trunc(parsed);
    return FINAL_NET_CUT_LIMITS.includes(limit) ? limit : null;
  }

  function renderFinalResultsPanel() {
    const panel = document.getElementById("final-results-panel");
    const root = document.getElementById("final-results-content");
    const status = document.getElementById("final-results-status");
    if (!panel || !root || !status) return;

    const finalResults = window.LB.appFinal.getFinalResultsState();
    const rows = window.LB.appFinal.getFinalAwardRows();
    const completion = window.LB.appFinal.getFinalCompletion(rows);
    panel.classList.toggle("is-locked", !completion.isReady);
    panel.classList.toggle("is-published", finalResults.status === "published");

    if (completion.unresolved > 0) {
      status.textContent = "Cần xử lý";
      status.className = "final-results-status";
    } else {
      status.textContent = finalResults.status === "published" ? "Đã công bố" : "Sẵn sàng";
      status.className = `final-results-status ${finalResults.status === "published" ? "is-published" : "is-ready"}`;
    }

    const computation = window.LB.appFinal.buildFinalAwardComputation();
    const excluded = new Set(finalResults.excludedPlayerIds);
    const dqRows = finalDqSearchQuery
      ? rows.filter(row => window.LB.appUtils.normalizeSearchText([
          row.name,
          row.golferId,
          row.vgaId,
          row.playerId,
          window.LB.appPlayer.getPlayerDivision(row)
        ].filter(Boolean).join(" ")).includes(finalDqSearchQuery))
      : rows;
    const genderScopeBlocked = window.LB.appFinal.hasMixedFinalGenderScoringModes(computation.eligibleRows);
    if (genderScopeBlocked && finalResults.rankingScope === "gender") finalResults.rankingScope = "division";
    const longestGroups = window.LB.appFinal.syncFinalTechnicalRows(finalResults, "longestDrive");
    const nearestGroups = window.LB.appFinal.syncFinalTechnicalRows(finalResults, "nearestToPin");
    const lineGroups = window.LB.appFinal.syncFinalTechnicalRows(finalResults, "nearToTheLine");
    const puttGroups = window.LB.appFinal.syncFinalTechnicalRows(finalResults, "longestPutt");
    const hioAwards = window.LB.appFinal.syncFinalHoleInOneRows(finalResults);
    const hioCandidateRows = window.LB.appFinal.getFinalHoleInOneCandidates(computation.allRows);

    // Migration target: move this final-results editor into apps/web/src/features/operator.
    const renderTechnical = (field, title, description, groups, options = {}) => `
      <article class="final-technical-card">
        <div class="final-technical-card-head">
          <div class="final-technical-title">
            <span>${title}</span>
            <span class="final-technical-help" tabindex="0" role="img" aria-label="${window.LB.appUtils.escapeHtml(description)}" data-tooltip="${window.LB.appUtils.escapeHtml(description)}" title="${window.LB.appUtils.escapeHtml(description)}">i</span>
          </div>
          <div class="final-technical-card-controls">
            ${options.showGenderMode ? `<label>Chế độ
              <select data-final-field="technicalGenderMode" aria-label="Chế độ Longest Drive">
                <option value="combined" ${finalResults.technicalGenderMode === "combined" ? "selected" : ""}>Gộp toàn giải</option>
                <option value="separate" ${finalResults.technicalGenderMode === "separate" ? "selected" : ""}>Tách Nam / Nữ</option>
              </select>
            </label>` : ""}
            <label>SL
              <select data-final-count="${field}" aria-label="Số lượng ${title}">
                ${Array.from({ length: 6 }, (_, index) => {
                  const value = index;
                  return `<option value="${value}" ${window.LB.appFinal.normalizeFinalTechnicalCount(finalResults.technicalAwardCounts?.[field]) === value ? "selected" : ""}>${value}</option>`;
                }).join("")}
              </select>
            </label>
          </div>
        </div>
        ${groups.map(group => {
          const awards = finalResults[field].filter(item => item.group === group.key);
          const players = window.LB.appFinal.getFinalPlayersForGroup(computation.eligibleRows, group.key);
          return awards.map((award, index) => `
            <div class="final-technical-row">
              <strong class="final-technical-slot">${window.LB.appUtils.escapeHtml(group.label)} ${awards.length > 1 ? `#${index + 1}` : ""}</strong>
              <label class="final-technical-player"><span>Golfer</span>
                <select data-final-technical="${field}" data-final-group="${group.key}" data-final-index="${index}" data-final-value="playerId">
                  ${window.LB.appFinal.renderFinalPlayerOptions(players, award.playerId)}
                </select>
              </label>
              <label><span>Hố</span><input type="text" inputmode="numeric" placeholder="Số hố" value="${window.LB.appUtils.escapeHtml(award.hole || "")}" data-final-technical="${field}" data-final-group="${group.key}" data-final-index="${index}" data-final-value="hole"></label>
              <label><span>Khoảng cách</span><input type="text" inputmode="decimal" placeholder="Mét" value="${window.LB.appUtils.escapeHtml(award.distance || "")}" data-final-technical="${field}" data-final-group="${group.key}" data-final-index="${index}" data-final-value="distance"></label>
            </div>`).join("");
        }).join("") || `<div class="empty-state">Không trao ${window.LB.appUtils.escapeHtml(title)}.</div>`}
      </article>`;

    const renderHoleInOneAwards = () => `
      <section class="final-hio-section">
        <div class="final-subhead">
          <div>
            <strong>Hole In One</strong>
            <small>Giải xác suất thấp, chỉ bật khi tournament thật sự có golfer HIO.</small>
          </div>
          <label class="final-hio-count-control">SL HIO
            <select data-final-hio-count aria-label="Số lượng Hole In One được trao">
              ${Array.from({ length: 5 }, (_, value) => `
                <option value="${value}" ${window.LB.appFinal.normalizeHoleInOneCount(finalResults.holeInOneCount) === value ? "selected" : ""}>${value}</option>
              `).join("")}
            </select>
          </label>
        </div>
        ${hioAwards.length ? `
          <div class="final-hio-list">
            ${hioAwards.map((award, index) => `
              <article class="final-hio-row">
                <div class="final-hio-badge"><span>HIO</span><strong>#${index + 1}</strong></div>
                <div class="final-hio-fields">
                  <select data-final-hio="${index}" data-final-value="playerId" aria-label="Golfer Hole In One ${index + 1}">
                    ${window.LB.appFinal.renderFinalHoleInOnePlayerOptions(hioCandidateRows, award.playerId)}
                  </select>
                  <input type="text" inputmode="numeric" placeholder="Hố" value="${window.LB.appUtils.escapeHtml(award.hole || "")}" data-final-hio="${index}" data-final-value="hole">
                </div>
                <div class="final-hio-prizes">
                  <div class="final-hio-prize-list">
                    ${window.LB.appFinal.normalizePrizeList(award.prizes, { keepEmpty: true, ensureOne: true }).map((prize, prizeIndex) => `
                      <div class="final-hio-prize-row">
                        <input type="text" placeholder="Phần thưởng ${prizeIndex + 1}" value="${window.LB.appUtils.escapeHtml(prize)}" data-final-hio-prize="${index}" data-final-prize-index="${prizeIndex}">
                        <button type="button" class="danger-icon" data-action="remove-hio-prize" data-final-hio-index="${index}" data-final-prize-index="${prizeIndex}" aria-label="Xóa phần thưởng HIO">×</button>
                      </div>
                    `).join("")}
                  </div>
                  <button type="button" class="secondary-button compact" data-action="add-hio-prize" data-final-hio-index="${index}">+ Phần thưởng</button>
                </div>
              </article>
            `).join("")}
          </div>
        ` : `<div class="empty-state">Không trao Hole In One cho tournament này.</div>`}
      </section>`;

    if (completion.unresolved > 0) {
      const progress = completion.total ? Math.round((completion.completed / completion.total) * 100) : 0;
      root.innerHTML = `
        <div class="final-results-lock">
          <div class="final-lock-icon">!</div>
          <div>
            <strong>Còn ${completion.unresolved} golfer chưa hoàn thành đủ ${completion.expectedHoles} hố</strong>
            <p>${completion.completed}/${completion.total} golfer đã đủ ${completion.expectedHoles} hố. Nhập điểm tiếp hoặc tick DQ/Không xét giải cho golfer không thể hoàn thành. (${completion.eligibleCompleted} golfer hợp lệ đã đủ hố)</p>
          </div>
          <div class="final-lock-progress" role="progressbar" aria-label="Tiến độ hoàn tất golfer" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${progress}">
            <span style="width:${progress}%"></span>
            <b>${progress}% hoàn tất</b>
          </div>
        </div>
        <section class="final-dq-section">
          <div class="final-subhead">
            <div><strong>DQ / Không xét giải</strong><small>Chỉ loại khỏi cơ cấu giải; bảng điểm công khai vẫn giữ nguyên.</small></div>
            <span>${excluded.size} golfer bị loại</span>
          </div>
          <div class="final-dq-toolbar">
            ${window.LB.appPlayer.renderPlayerSearchInput("final-dq-search", finalDqSearchInputValue, "Tìm golfer theo tên hoặc ID", "final-dq")}
            <small>${dqRows.length}/${rows.length} golfer đang hiển thị</small>
          </div>
          <div class="final-dq-list">
            ${dqRows.map(row => `
              <label class="final-dq-item ${excluded.has(row.playerId) ? "is-excluded" : ""}">
                <input type="checkbox" data-final-excluded-player="${window.LB.appUtils.escapeHtml(row.playerId)}" ${excluded.has(row.playerId) ? "checked" : ""}>
                <span><strong>${window.LB.appUtils.escapeHtml(row.name)}</strong><small>${window.LB.appUtils.escapeHtml(row.golferId || row.vgaId || row.playerId || "")} · ${window.LB.appUtils.escapeHtml(window.LB.appPlayer.formatDivisionLabel(window.LB.appPlayer.getPlayerDivision(row)))} · ${window.LB.appFinal.formatFinalRowScore(row)}</small></span>
                <b>${excluded.has(row.playerId) ? "DQ" : "Hợp lệ"}</b>
              </label>`).join("") || `<div class="empty-state">Không tìm thấy golfer phù hợp.</div>`}
          </div>
        </section>
        <div class="final-publish-bar">
          <div><strong>Còn golfer chưa xử lý</strong><small>Cần giải quyết tất cả golfer chưa đủ hố trước khi công bố kết quả.</small></div>
          <button type="button" class="primary-button" data-action="publish-final-results" disabled>Nạp kết quả chung cuộc</button>
        </div>`;
    } else {
      root.innerHTML = `
      <div class="final-control-grid">
        <label>
          Cơ cấu trao hạng
          <select data-final-field="rankingScope">
            <option value="division" ${finalResults.rankingScope === "division" ? "selected" : ""}>Hạng 1–3 theo từng bảng</option>
            <option value="gender" ${finalResults.rankingScope === "gender" ? "selected" : ""} ${genderScopeBlocked ? "disabled" : ""}>Hạng 1–3 Nam / Nữ</option>
          </select>
          ${genderScopeBlocked ? `<small>Không thể gộp Nam/Nữ vì trong cùng giới đang có cả S36 và WHS.</small>` : ""}
        </label>
        <label>
          Cắt âm
          <select data-final-field="netCutLimit">
            <option value="" ${finalResults.netCutLimit === null ? "selected" : ""}>Không cắt âm</option>
            ${FINAL_NET_CUT_LIMITS.map(value => `<option value="${value}" ${finalResults.netCutLimit === value ? "selected" : ""}>${value}</option>`).join("")}
          </select>
          <small>Chỉ áp dụng khi nạp kết quả chung cuộc cho golfer đủ 18 hố.</small>
        </label>
      </div>

      <section class="final-dq-section">
        <div class="final-subhead">
          <div><strong>DQ / Không xét giải</strong><small>Chỉ loại khỏi cơ cấu giải; bảng điểm công khai vẫn giữ nguyên.</small></div>
          <span>${excluded.size} golfer bị loại</span>
        </div>
        <div class="final-dq-toolbar">
          ${window.LB.appPlayer.renderPlayerSearchInput("final-dq-search", finalDqSearchInputValue, "Tìm golfer theo tên hoặc ID", "final-dq")}
          <small>${dqRows.length}/${rows.length} golfer đang hiển thị</small>
        </div>
        <div class="final-dq-list">
          ${dqRows.map(row => `
            <label class="final-dq-item ${excluded.has(row.playerId) ? "is-excluded" : ""}">
              <input type="checkbox" data-final-excluded-player="${window.LB.appUtils.escapeHtml(row.playerId)}" ${excluded.has(row.playerId) ? "checked" : ""}>
              <span><strong>${window.LB.appUtils.escapeHtml(row.name)}</strong><small>${window.LB.appUtils.escapeHtml(row.golferId || row.vgaId || row.playerId || "")} · ${window.LB.appUtils.escapeHtml(window.LB.appPlayer.formatDivisionLabel(window.LB.appPlayer.getPlayerDivision(row)))} · ${window.LB.appFinal.formatFinalRowScore(row)}</small></span>
              <b>${excluded.has(row.playerId) ? "DQ" : "Hợp lệ"}</b>
            </label>`).join("") || `<div class="empty-state">Không tìm thấy golfer phù hợp.</div>`}
        </div>
      </section>

      <section class="final-auto-awards">
        <div class="final-subhead"><div><strong>Kết quả tự động</strong><small>Tính lại ngay khi GO thay đổi DQ hoặc luật cắt âm.</small></div><span>${window.LB.appUtils.escapeHtml(window.LB.appFinal.formatFinalNetCutLabel(finalResults.netCutLimit))} · Countback</span></div>
        <article class="final-best-gross-preview">
          <span>Best Gross</span>
          <strong>${window.LB.appUtils.escapeHtml(computation.bestGross?.name || "Chưa có golfer hợp lệ")}</strong>
          <small>${window.LB.appFinal.formatFinalRowScore(computation.bestGross)}</small>
        </article>
        <div class="final-podium-preview-grid">
          ${computation.podiums.map(group => `
            <article class="final-podium-preview">
              <header><span>${group.scope === "gender" ? "Giới tính" : "Bảng đấu"}</span><strong>${window.LB.appUtils.escapeHtml(group.label)}</strong></header>
              ${[0, 1, 2].map((index) => `
                <div><b>${index + 1}</b><span><strong>${window.LB.appUtils.escapeHtml(group.rows[index]?.name || "—")}</strong><small>${window.LB.appFinal.formatFinalRowScore(group.rows[index])}</small></span></div>`).join("")}
            </article>`).join("") || `<div class="empty-state">Không còn đủ golfer hợp lệ để xếp hạng.</div>`}
        </div>
      </section>

      <section class="final-awards-section panel">
        <div class="panel-title collapsible-panel-title" data-action="toggle-final-awards" role="button" tabindex="0" aria-expanded="true">
          <button type="button" class="panel-collapse-button" data-action="toggle-final-awards" aria-label="Thu gọn Cơ cấu giải thưởng" title="Thu gọn">
            <span class="panel-collapse-chevron" aria-hidden="true"></span>
          </button>
          <h2>Cơ cấu giải thưởng</h2>
        </div>
        <div class="final-awards-body">
          <section class="final-technical-grid">
        ${renderTechnical("longestDrive", "Longest Drive", "Cú phát bóng xa nhất", longestGroups, { showGenderMode: true })}
        ${renderTechnical("nearestToPin", "Nearest to Pin", "Cú đánh gần cờ nhất", nearestGroups)}
        ${renderTechnical("nearToTheLine", "Near to the Line", "Cú đánh gần đường line nhất", lineGroups)}
        ${renderTechnical("longestPutt", "Longest Putt", "Cú gạt bóng thành công xa nhất trên green", puttGroups)}
      </section>

      ${renderHoleInOneAwards()}

      <section class="final-special-section">
        <div class="final-subhead">
          <div><strong>Giải đặc biệt</strong><small>Thêm tên giải, golfer và chú thích hiển thị công khai.</small></div>
          <button type="button" class="secondary-button compact" data-action="add-special-award">+ Thêm giải</button>
        </div>
        <div class="final-special-list">
          ${finalResults.specialAwards.map(award => `
            <div class="final-special-row">
              <input type="text" placeholder="Tên giải" value="${window.LB.appUtils.escapeHtml(award.name || "")}" data-final-special="${window.LB.appUtils.escapeHtml(award.id)}" data-final-value="name">
              <select data-final-special="${window.LB.appUtils.escapeHtml(award.id)}" data-final-value="playerId">${window.LB.appFinal.renderFinalPlayerOptions(computation.eligibleRows, award.playerId)}</select>
              <input type="text" placeholder="Chú thích" value="${window.LB.appUtils.escapeHtml(award.note || "")}" data-final-special="${window.LB.appUtils.escapeHtml(award.id)}" data-final-value="note">
              <button type="button" class="danger-icon" data-action="remove-special-award" data-award-id="${window.LB.appUtils.escapeHtml(award.id)}" aria-label="Xóa giải đặc biệt">×</button>
            </div>`).join("") || `<div class="empty-state">Chưa có giải đặc biệt.</div>`}
        </div>
          </section>
        </div>
      </section>

      <div class="final-publish-bar">
        <div><strong>${finalResults.status === "published" ? "Kết quả đã được công bố" : "Sẵn sàng chốt giải"}</strong><small>${finalResults.publishedAt ? `Lần cuối ${new Date(finalResults.publishedAt).toLocaleString("vi-VN")}` : "Trang live sẽ có thêm tab Kết quả chung cuộc sau khi nạp."}</small></div>
        <div class="final-publish-buttons" style="display: flex; gap: 8px; flex-wrap: wrap;">
          ${finalResults.status === "published" ? `
            <button type="button" class="secondary-button" data-action="print-results-landscape">In ngang (A4)</button>
            <button type="button" class="secondary-button" data-action="print-results-portrait">In dọc (A4)</button>
          ` : ""}
          <button type="button" class="primary-button" data-action="publish-final-results" ${finalResultsPublishing || !computation.bestGross ? "disabled" : ""}>${finalResultsPublishing ? "Đang nạp..." : "Nạp kết quả chung cuộc"}</button>
        </div>
      </div>`;
    }
  }

  function handleFinalResultsInput(target) {
    const finalResults = window.LB.appFinal.getFinalResultsState();
    const field = target.dataset.finalField;
    if (field === "rankingScope") finalResults.rankingScope = target.value === "gender" ? "gender" : "division";
    if (field === "technicalGenderMode") finalResults.technicalGenderMode = target.value === "separate" ? "separate" : "combined";
    if (field === "netCutLimit") finalResults.netCutLimit = normalizeFinalNetCutLimit(target.value);

    const excludedPlayerId = target.dataset.finalExcludedPlayer;
    if (excludedPlayerId) {
      const excluded = new Set(finalResults.excludedPlayerIds);
      target.checked ? excluded.add(excludedPlayerId) : excluded.delete(excludedPlayerId);
      finalResults.excludedPlayerIds = Array.from(excluded);
    }

    const countField = target.dataset.finalCount;
    if (countField && FINAL_TECHNICAL_AWARD_FIELDS.includes(countField)) {
      finalResults.technicalAwardCounts[countField] = window.LB.appFinal.normalizeFinalTechnicalCount(target.value);
      window.LB.appFinal.syncFinalTechnicalRows(finalResults, countField);
    }

    const hioCountField = target.dataset.finalHioCount !== undefined;
    if (hioCountField) {
      finalResults.holeInOneCount = window.LB.appFinal.normalizeHoleInOneCount(target.value);
      window.LB.appFinal.syncFinalHoleInOneRows(finalResults);
    }

    const hioIndex = target.dataset.finalHio;
    if (hioIndex !== undefined) {
      window.LB.appFinal.syncFinalHoleInOneRows(finalResults);
      const award = finalResults.holeInOneAwards[Number(hioIndex) || 0];
      if (award && ["playerId", "hole"].includes(target.dataset.finalValue)) {
        award[target.dataset.finalValue] = target.value;
        if (target.dataset.finalValue === "playerId" && !String(award.hole || "").trim()) {
          const selectedRow = window.LB.appFinal.getFinalAwardRows().find(row => row.playerId === target.value);
          award.hole = window.LB.appFinal.getFinalHoleInOneHoles(selectedRow)[0] || "";
        }
      }
    }

    const hioPrizeIndex = target.dataset.finalHioPrize;
    if (hioPrizeIndex !== undefined) {
      window.LB.appFinal.syncFinalHoleInOneRows(finalResults);
      const award = finalResults.holeInOneAwards[Number(hioPrizeIndex) || 0];
      const prizeIndex = Number(target.dataset.finalPrizeIndex) || 0;
      if (award) {
        award.prizes = window.LB.appFinal.normalizePrizeList(award.prizes, { keepEmpty: true, ensureOne: true });
        award.prizes[prizeIndex] = target.value;
      }
    }

    const technicalField = target.dataset.finalTechnical;
    if (technicalField && FINAL_TECHNICAL_AWARD_FIELDS.includes(technicalField)) {
      window.LB.appFinal.syncFinalTechnicalRows(finalResults, technicalField);
      const groupAwards = finalResults[technicalField].filter(item => item.group === target.dataset.finalGroup);
      const award = groupAwards[Number(target.dataset.finalIndex) || 0];
      if (award) award[target.dataset.finalValue] = target.value;
    }

    const specialId = target.dataset.finalSpecial;
    if (specialId) {
      const award = finalResults.specialAwards.find(item => item.id === specialId);
      if (award) award[target.dataset.finalValue] = target.value;
    }

    window.LB.appFinal.markFinalResultsDraft();
    if (field || excludedPlayerId || countField || hioCountField) renderFinalResultsPanel();
  }

  async function publishFinalResults() {
    if (finalResultsPublishing) return;
    const completion = window.LB.appFinal.getFinalCompletion();
    if (completion.unresolved > 0) {
      alert("Còn " + completion.unresolved + " golfer chưa đủ " + completion.expectedHoles + " hố và chưa được đánh dấu DQ/Không xét giải. Hãy nhập điểm tiếp hoặc tick DQ để loại khỏi kết quả.");
      return;
    }
    if (completion.eligibleCompleted === 0) {
      alert("Không còn golfer hợp lệ để xếp hạng. Cần ít nhất một golfer hoàn thành và không bị DQ.");
      return;
    }
    const finalResults = window.LB.appFinal.getFinalResultsState();
    window.LB.appFinal.syncFinalTechnicalRows(finalResults, "longestDrive");
    window.LB.appFinal.syncFinalTechnicalRows(finalResults, "nearestToPin");
    window.LB.appFinal.syncFinalTechnicalRows(finalResults, "nearToTheLine");
    window.LB.appFinal.syncFinalTechnicalRows(finalResults, "longestPutt");
    window.LB.appFinal.syncFinalHoleInOneRows(finalResults);
    const partialTechnical = [...finalResults.longestDrive, ...finalResults.nearestToPin, ...finalResults.nearToTheLine, ...finalResults.longestPutt]
      .some(award => {
        const hasPlayer = !!award.playerId;
        const hasDetail = !!String(award.hole || "").trim() || !!String(award.distance || "").trim();
        return hasPlayer !== hasDetail;
      });
    if (partialTechnical) {
      alert("Giải kỹ thuật cần đủ golfer và ít nhất số hố hoặc khoảng cách, hoặc để trống toàn bộ.");
      return;
    }
    const incompleteHoleInOne = finalResults.holeInOneAwards.some(award => {
      const prizes = window.LB.appFinal.normalizePrizeList(award.prizes);
      return !(award.playerId && String(award.hole || "").trim() && prizes.length > 0);
    });
    if (incompleteHoleInOne) {
      alert("Hole In One cần đủ golfer, hố và ít nhất một phần thưởng cho từng giải đã chọn.");
      return;
    }
    const hioPlayerIds = new Set(window.LB.appFinal.getFinalHoleInOneCandidates(window.LB.appFinal.getFinalAwardRows()).map(row => row.playerId));
    const invalidHoleInOne = finalResults.holeInOneAwards.some(award => award.playerId && !hioPlayerIds.has(award.playerId));
    if (invalidHoleInOne) {
      alert("Golfer nhận Hole In One phải có ít nhất một hố gross 1 trong điểm GO đã xác nhận.");
      return;
    }
    const partialSpecial = finalResults.specialAwards.some(award => (
      award.name?.trim() || award.playerId || award.note?.trim()
    ) && !(award.name?.trim() && award.playerId));
    if (partialSpecial) {
      alert("Giải đặc biệt cần ít nhất tên giải và golfer.");
      return;
    }

    finalResultsPublishing = true;
    finalResults.status = "published";
    finalResults.publishedAt = new Date().toISOString();
    state().tournament.status = "completed";
    window.LB.storage.saveState();
    renderFinalResultsPanel();
    try {
      const snapshot = buildOperatorLinkSnapshot();
      const result = await publishOperatorLinkSnapshot({ snapshot });
      window.LB.storage.saveState();
      window.LB.appUtils.render();
      if (result.ok) {
        alert("Đã công bố kết quả chung cuộc. Trang live đã mở tab trao giải.");
      } else if (["local_only", "operator_not_linked"].includes(result.reason)) {
        alert("Đã công bố snapshot local. Trang live trên máy này đã mở tab trao giải.");
      } else {
        alert(`Đã lưu kết quả local nhưng chưa đồng bộ được Supabase: ${result.reason || "publish_failed"}`);
      }
    } finally {
      finalResultsPublishing = false;
      renderFinalResultsPanel();
    }
  }

  function renderTs36MatchReview() {
    const root = document.getElementById("ts36-match-review");
    if (!root) return;
    window.LB.appPlayer.syncPlayerIdentities();
    const previousScroll = Array.from(root.querySelectorAll(".match-list")).map(element => element.scrollTop || 0);
    const matches = [...(state().ts36Matches || [])].sort((left, right) => {
      const leftSlot = Number(left?.metadata?.simulator2Slot || left?.raw?.metadata?.simulator2Slot || 0);
      const rightSlot = Number(right?.metadata?.simulator2Slot || right?.raw?.metadata?.simulator2Slot || 0);
      if (leftSlot || rightSlot) return (leftSlot || Number.MAX_SAFE_INTEGER) - (rightSlot || Number.MAX_SAFE_INTEGER);
      const leftTime = Date.parse(left.joinedAt || left.createdAt || "") || 0;
      const rightTime = Date.parse(right.joinedAt || right.createdAt || "") || 0;
      if (leftTime !== rightTime) return leftTime - rightTime;
      return window.LB.appUtils.cleanText(left.displayName).localeCompare(window.LB.appUtils.cleanText(right.displayName), "vi", { numeric: true });
    });
    const selectedId = state().matchReview?.selectedTs36Id || matches[0]?.id || "";
    if (!state().matchReview) state().matchReview = { selectedTs36Id: "", selectedPlayerId: "" };
    if (!state().matchReview.selectedTs36Id && selectedId) state().matchReview.selectedTs36Id = selectedId;
    const selected = matches.find(item => item.id === state().matchReview.selectedTs36Id) || null;
    if (selected && !state().matchReview.selectedPlayerId) {
      state().matchReview.selectedPlayerId = selected.linkedPlayerId || selected.suggestedPlayerId || "";
    }
    const selectedPlayerId = state().matchReview.selectedPlayerId || selected?.linkedPlayerId || selected?.suggestedPlayerId || "";
    const visibleMatches = matches.filter(match => window.LB.appUtils.tourSystemMatchMatchesSearch(match, ts36MatchSearchQuery));
    const pendingReviewCount = matches.filter(match => !window.LB.appTs36.isTourSystemMatchConfirmed(match)).length;
    const visiblePendingReviewCount = visibleMatches.filter(match => !window.LB.appTs36.isTourSystemMatchConfirmed(match)).length;
    const playerRows = state().players
      .filter(player => window.LB.appUtils.playerMatchesSearch(player, rosterMatchSearchQuery))
      .map(player => ({
        player,
        score: selected ? window.LB.appUtils.nameSimilarity(selected.displayName, player.name) : 0,
        idExact: !!selected && window.LB.appUtils.playerMatchesPublicGolfId(player, selected.normalizedVgaId),
        claimedExact: !!selected && window.LB.appPlayer.playerMatchesClaimedPlayer(player, selected.claimedPlayerId),
        linkedDifferent: !!selected && window.LB.appTs36.isPlayerLinkedToDifferentTs36(player, selected)
      }))
      .sort((a, b) => {
        const aExact = a.idExact || a.claimedExact;
        const bExact = b.idExact || b.claimedExact;
        if (aExact !== bExact) return aExact ? -1 : 1;
        if (a.player.id === selectedPlayerId) return -1;
        if (b.player.id === selectedPlayerId) return 1;
        if (a.linkedDifferent !== b.linkedDifferent) return a.linkedDifferent ? 1 : -1;
        return b.score - a.score || a.player.name.localeCompare(b.player.name, "vi");
      });

    root.innerHTML = `
      <div class="match-board">
        <section class="match-column">
          <div class="match-column-head">
            <div class="match-column-head-title">
              <strong>User TS36</strong>
              <span>${visiblePendingReviewCount}/${pendingReviewCount} chưa confirm</span>
            </div>
            ${window.LB.appPlayer.renderPlayerSearchInput("ts36-match-search", ts36MatchSearchInputValue, "Tìm TS36 tên/email/ID", "ts36-match")}
          </div>
          <div class="match-list">
            ${visibleMatches.map(match => {
              const linkedPlayer = state().players.find(player => player.id === match.linkedPlayerId);
              const suggestedPlayer = state().players.find(player => player.id === match.suggestedPlayerId);
              const isConfirmed = window.LB.appTs36.isTourSystemMatchConfirmed(match);
              const linkedLabel = linkedPlayer
                ? `Linked: ${window.LB.appUtils.escapeHtml(linkedPlayer.name)}${isConfirmed ? "" : " · chưa confirm"}`
                : (suggestedPlayer ? `Gợi ý: ${window.LB.appUtils.escapeHtml(suggestedPlayer.name)}` : "Chưa có gợi ý");
              return `
                <button type="button" class="match-row ${match.id === selected?.id ? "active" : ""} ${match.status === "linked" ? "is-linked" : ""} ${isConfirmed ? "is-confirmed" : ""}" data-action="select-ts36-match" data-match-id="${window.LB.appUtils.escapeHtml(match.id)}">
                  <strong>${window.LB.appUtils.escapeHtml(match.displayName || "TS36 user")}</strong>
                  <small>${match.normalizedVgaId ? `ID ${window.LB.appUtils.escapeHtml(match.normalizedVgaId)}` : "Không có ID"}${match.email ? ` · ${window.LB.appUtils.escapeHtml(match.email)}` : ""}${match.pendingScores?.length ? ` · ${match.pendingScores.length} điểm chờ` : ""}</small>
                  <span>${linkedLabel}</span>
                  ${isConfirmed ? `<i class="match-row-check" aria-hidden="true">✓</i>` : ""}
                </button>
              `;
            }).join("") || `<div class="empty-state">${matches.length ? "Không tìm thấy user TS36 phù hợp." : "Chưa có user TS36 cần link."}</div>`}
          </div>
        </section>

        <section class="match-column">
          <div class="match-column-head">
            <div class="match-column-head-title">
              <strong>Danh sách golfer LB Pro</strong>
              <span>${playerRows.length}/${state().players.length} golfer</span>
            </div>
            ${window.LB.appPlayer.renderPlayerSearchInput("roster-match-search", rosterMatchSearchInputValue, "Tìm golfer hoặc ID", "roster-match")}
          </div>
          <div class="match-list">
            ${playerRows.map(({ player, score, idExact, claimedExact, linkedDifferent }) => {
              const relationLabel = idExact
                ? "Trùng ID"
                : claimedExact
                  ? "TS36 đã chọn"
                  : (linkedDifferent ? "Đã link user khác" : (score ? `Tên giống ${Math.round(score * 100)}%` : "Chọn thủ công"));
              return `
              <button type="button" class="match-row ${player.id === selectedPlayerId ? "active" : ""} ${linkedDifferent ? "is-linked-different" : ""}" data-action="select-roster-player" data-player-id="${window.LB.appUtils.escapeHtml(player.id)}">
                <strong>${window.LB.appUtils.escapeHtml(player.name || "Golfer")}</strong>
                <small>${window.LB.appUtils.escapeHtml(window.LB.appPlayer.getPlayerPublicId(player))} · ${window.LB.appUtils.escapeHtml(window.LB.appPlayer.formatDivisionLabel(window.LB.appPlayer.getPlayerDivision(player)) || "Chưa có bảng")} · HCP ${window.LB.appUtils.escapeHtml(player.handicap || 0)}</small>
                <span>${relationLabel}</span>
              </button>
            `;
            }).join("") || `<div class="empty-state">${state().players.length ? "Không tìm thấy golfer phù hợp." : "Import danh sách golfer trước khi link TS36."}</div>`}
          </div>
        </section>
      </div>
      <div class="match-actions">
        <button type="button" class="secondary-button" data-action="accept-suggested-match" data-match-id="${window.LB.appUtils.escapeHtml(selected?.id || "")}" ${selected?.suggestedPlayerId ? "" : "disabled"}>Dùng gợi ý</button>
        <button type="button" class="secondary-button" data-action="reset-suggested-matches" ${matches.length ? "" : "disabled"}>Reset</button>
        <button type="button" class="primary-button" data-action="link-selected-match" ${selected && selectedPlayerId ? "" : "disabled"}>${selected?.linkedPlayerId ? "Confirm link" : "Link user với golfer"}</button>
      </div>
    `;
    Array.from(root.querySelectorAll(".match-list")).forEach((element, index) => {
      element.scrollTop = previousScroll[index] || 0;
    });
  }

  function startOperatorBridgePolling() {
    if (operatorBridgePollTimer || !window.LB.appUtils.getCapabilities().canPollTourSystemScores) return;
    operatorBridgePollTimer = window.setInterval(async () => {
      const now = Date.now();
      let catalogChanged = false;
      const shouldPollCatalog = !operatorBridgeLastCatalogPollAt
        || now - operatorBridgeLastCatalogPollAt >= getOperatorCatalogPollMs()
        || !(state().operator.tournaments || []).length;
      if (shouldPollCatalog) {
        const before = window.LB.appUtils.getOperatorTournamentListSignature();
        await window.LB.appUtils.loadOperatorTournaments(false, { silent: true });
        operatorBridgeLastCatalogPollAt = now;
        catalogChanged = before !== window.LB.appUtils.getOperatorTournamentListSignature();
      }
      if (!state().operator.linkedTournament?.id) {
        if (catalogChanged) renderOperatorTournamentControls();
        return;
      }
      operatorBridgePollTick += 1;
      const shouldPollParticipants = !operatorBridgeLastParticipantPollAt
        || now - operatorBridgeLastParticipantPollAt >= getOperatorParticipantPollMs();
      const participants = shouldPollParticipants
        ? await window.LB.appTs36.importTourSystemParticipants()
        : 0;
      if (shouldPollParticipants) operatorBridgeLastParticipantPollAt = now;
      const scores = await window.LB.appTs36.importTourSystemScores({ silent: true });
      if (participants || scores || catalogChanged) {
        window.LB.storage.saveState();
        window.LB.appPlayer.renderPlayers();
        window.LB.appPlayer.renderFlightConfigPanel();
        renderScoreTable();
        renderLeaderboard();
        renderTs36MatchReview();
        window.LB.appUtils.renderSummary();
        renderOperatorTournamentControls();
      }
    }, getOperatorScorePollMs());
  }

  function restartOperatorBridgePolling() {
    if (operatorBridgePollTimer) {
      window.clearInterval(operatorBridgePollTimer);
      operatorBridgePollTimer = null;
    }
    operatorBridgePollTick = 0;
    operatorBridgeLastCatalogPollAt = 0;
    operatorBridgeLastParticipantPollAt = 0;
    startOperatorBridgePolling();
  }

  function buildOperatorLinkSnapshot(options = {}) {
    window.LB.appUtils.ensureLocalShareSlugFromTournament();
    const snapshot = window.LB.scoring.buildPublicSnapshot(state());
    if (state().simulator?.active === true) {
      const sim = state().simulator || {};
      const liveSeconds = window.LB.scoring.clampNumber(sim.config?.liveSeconds, 1, 120, 5);
      const simulatorRefreshMs = Math.trunc(liveSeconds) * 1000;
      snapshot.simulator = {
        ...(snapshot.simulator || {}),
        id: sim.id || snapshot.simulator?.id || "",
        turn: sim.currentTurn || 0,
        localOnly: true,
        liveSeconds,
        debugRefreshMs: simulatorRefreshMs
      };
      snapshot.sync = {
        ...(snapshot.sync || {}),
        publicRefreshMs: simulatorRefreshMs,
        publicPollMs: simulatorRefreshMs,
        simulatorRefreshMs
      };
    }
    if (state().simulator2?.active === true) {
      const sim2 = state().simulator2 || {};
      const scorePollMs = window.LB.appUtils.clampMs(sim2.scorePollMs || getOperatorScorePollMs(), MIN_OPERATOR_SCORE_POLL_MS, MAX_OPERATOR_SCORE_POLL_MS, 10000);
      const simulatorRefreshMs = window.LB.appUtils.clampMs(
        sim2.snapshotAutoPublishMs || getOperatorSnapshotAutoPublishMs(),
        MIN_OPERATOR_SNAPSHOT_AUTO_PUBLISH_MS,
        MAX_OPERATOR_SCORE_POLL_MS,
        10000
      );
      const publicRefreshMs = Math.min(simulatorRefreshMs, scorePollMs);
      snapshot.simulator = {
        ...(snapshot.simulator || {}),
        id: "simulator2",
        localOnly: true,
        mode: "simulator2",
        running: sim2.running === true,
        openProfiles: sim2.openProfiles || 0,
        updatedAt: new Date().toISOString()
      };
      snapshot.tournament = {
        ...(snapshot.tournament || {}),
        status: "active"
      };
      snapshot.sync = {
        ...(snapshot.sync || {}),
        scorePollMs,
        snapshotAutoPublishMs: simulatorRefreshMs,
        publicRefreshMs,
        publicPollMs: publicRefreshMs,
        simulatorRefreshMs: publicRefreshMs
      };
      delete snapshot.finalResults;
    } else {
      const finalResults = window.LB.appFinal.buildPublishedFinalResults();
      if (finalResults) snapshot.finalResults = finalResults;
    }
    const existingRoster = Array.isArray(state().operator.publishedRosterSnapshot)
      ? state().operator.publishedRosterSnapshot
      : [];
    const shouldIncludeRoster = options.includeRoster || existingRoster.length || state().operator.rosterPublishedAt;
    const publishedRoster = options.includeRoster
      ? (Array.isArray(options.rosterSnapshot) ? options.rosterSnapshot : window.LB.appSnapshot.buildRosterSnapshot())
      : existingRoster;
    if (shouldIncludeRoster) {
      snapshot.roster = publishedRoster;
      snapshot.rosterPublishedAt = options.rosterPublishedAt || state().operator.rosterPublishedAt || new Date().toISOString();
    }
    snapshot.flightConfig = {
      ...(snapshot.flightConfig || {}),
      system36FlightConfig: window.LB.appPlayer.buildSystem36FlightConfig(snapshot.flightConfig || state().flightConfig || {})
    };
    return snapshot;
  }

  async function publishOperatorLinkSnapshot(options = {}) {
    const snapshot = options.snapshot || buildOperatorLinkSnapshot(options);
    const signature = window.LB.appSnapshot.getOperatorSnapshotPublishSignature(snapshot);
    if (options.skipIfUnchanged && signature === operatorSnapshotLastPublishedSignature) {
      return { ok: true, skipped: true, reason: "snapshot_unchanged" };
    }
    const hasPublicScores = window.LB.appUtils.snapshotHasConfirmedPublicScores(snapshot);
    const hasPublishedFinalResults = snapshot.finalResults?.status === "published";
    if (!options.includeRoster && !hasPublicScores && !hasPublishedFinalResults) {
      return { ok: true, skipped: true, reason: "no_confirmed_public_scores" };
    }
    window.LB.storage.saveSnapshot(snapshot, { publish: false });
    window.LB.storage.saveState();
    operatorSnapshotLastPublishedSignature = signature;
    if (window.LB.appUtils.getCapabilities().canUseLocalServices && window.LB.storage.ensureLanSnapshotPublished) {
      await window.LB.storage.ensureLanSnapshotPublished(snapshot);
    }
    if (state().simulator?.active === true) {
      return { ok: false, blocked: true, reason: "local_only", simulatorLocalOnly: true };
    }
    const linked = state().operator.linkedTournament;
    const code = state().operator.privateCode || state().tournament.operatorPrivateCode || "";
    if (!linked?.id || !code) return { ok: false, reason: "operator_not_linked" };

    const cloud = await window.LB.supabaseBridge.publishOperatorSnapshot(linked.id, code, snapshot);
    if (cloud.ok && cloud.data) {
      state().tournament.id = cloud.data.leaderboard_tournament_id || state().tournament.id;
      state().tournament.shareSlug = cloud.data.share_slug || state().tournament.shareSlug;
      state().operator.linkedTournament = {
        ...linked,
        leaderboardTournamentId: state().tournament.id,
        shareSlug: state().tournament.shareSlug
      };
      state().cloud.enabled = true;
      state().cloud.lastSyncAt = new Date().toISOString();
      state().cloud.lastError = "";
      if (state().tournament.shareSlug && state().tournament.shareSlug !== snapshot.shareSlug) {
        const aliasedSnapshot = {
          ...snapshot,
          shareSlug: state().tournament.shareSlug,
          tournament: {
            ...(snapshot.tournament || {}),
            id: state().tournament.id,
            updatedAt: new Date().toISOString()
          }
        };
        window.LB.storage.saveSnapshot(aliasedSnapshot, { publish: false });
        if (window.LB.appUtils.getCapabilities().canUseLocalServices && window.LB.storage.ensureLanSnapshotPublished) {
          await window.LB.storage.ensureLanSnapshotPublished(aliasedSnapshot);
        }
      }
      if (!options.silent) {
        window.LB.appUtils.setOperatorLinkStatus(`Đã link Supabase: ${linked.title} · ${state().tournament.shareSlug}`, "linked");
      }
    } else if (cloud.reason !== "local_only") {
      state().cloud.lastError = cloud.reason || "operator_publish_failed";
    }
    return cloud;
  }

  async function publishRoster(options = {}) {
    if (rosterPublishing) return;
    if (state().simulator?.active === true) {
      if (!options.silent) alert("Simulator local-only, không ghi cloud");
      return { ok: false, reason: "local_only" };
    }
    const linked = state().operator.linkedTournament;
    const code = state().operator.privateCode || state().tournament.operatorPrivateCode || "";
    if (!linked?.id || !code) {
      if (!options.silent) alert("Vào giải bằng private code trước khi nạp danh sách lên bridge.");
      return { ok: false, reason: "operator_not_linked" };
    }
    const pendingReviewPlayers = state().players.filter(player => {
      const review = window.LB.appPlayer.getPlayerProfileReviewState(player);
      return review.division || review.vga || review.handicapIndex || review.courseHandicap;
    });
    if (pendingReviewPlayers.length) {
      if (!options.silent) {
        const preview = pendingReviewPlayers.slice(0, 3).map(player => player.name || "Golfer").join(", ");
        alert(`Còn ${pendingReviewPlayers.length} golfer cần GO kiểm tra/xác nhận trước khi nạp danh sách${preview ? `: ${preview}` : ""}.`);
      }
      return { ok: false, reason: "roster_review_required" };
    }
    const roster = window.LB.appSnapshot.buildRosterSnapshot();
    const isClearingRoster = roster.length === 0;
    if (isClearingRoster && !options.skipConfirm && !confirm("Player-panel đang trống. Xóa roster bridge cũ trên Supabase để TS36 không còn gợi ý golfer của session trước?")) {
      return { ok: false, reason: "cancelled" };
    }
    const rosterPublishedAt = new Date().toISOString();

    rosterPublishing = true;
    window.LB.appUtils.setRosterPublishBusy(true, isClearingRoster ? "clear" : "publish");
    try {
      const cloud = await publishOperatorLinkSnapshot({
        includeRoster: true,
        rosterSnapshot: roster,
        rosterPublishedAt,
        fromSimulator2: options.fromSimulator2 === true
      });
      if (cloud.ok) {
        state().operator.publishedRosterSnapshot = roster;
        state().operator.rosterPublishedAt = rosterPublishedAt;
        state().operator.rosterPublishedCount = roster.length;
        window.LB.storage.saveState();
        window.LB.appUtils.renderSummary();
        renderOperatorTournamentControls();
        if (!options.silent) {
          alert(isClearingRoster
            ? "Đã xóa roster bridge cũ. TS36 sẽ thấy tournament trống cho đến khi GO nạp danh sách mới."
            : `Đã nạp ${roster.length} golfer lên bridge. TS36 sẽ tải roster này một lần để match ID/tên.`);
        }
      } else {
        if (!options.silent) alert(`Chưa nạp được danh sách lên Supabase: ${cloud.reason || "local_only"}`);
      }
      return cloud;
    } finally {
      rosterPublishing = false;
      window.LB.appUtils.setRosterPublishBusy(false);
    }
  }

  function scheduleOperatorSnapshotPublish(delay = getOperatorSnapshotAutoPublishMs()) {
    window.clearTimeout(operatorSnapshotPublishTimer);
    if (state().simulator?.active === true) {
      operatorSnapshotNextPublishAt = 0;
      updateAutoPublishClock();
      return;
    }
    operatorSnapshotNextPublishAt = Date.now() + delay;
    updateAutoPublishClock();
    operatorSnapshotPublishTimer = window.setTimeout(async () => {
      const linked = state().operator.linkedTournament;
      const code = state().operator.privateCode || state().tournament.operatorPrivateCode || "";
      if (!linked?.id || !code) {
        operatorSnapshotNextPublishAt = 0;
        updateAutoPublishClock();
        return;
      }
      if (operatorSnapshotPublishInFlight) {
        scheduleOperatorSnapshotPublish();
        return;
      }
      operatorSnapshotPublishInFlight = true;
      window.LB.appUtils.triggerAutoPublishRefreshEffect();
      try {
        const result = await publishOperatorLinkSnapshot({ silent: true, skipIfUnchanged: true });
        if (!result.skipped) {
          window.LB.storage.saveState();
          window.LB.appUtils.renderSummary();
          renderOperatorTournamentControls();
        }
      } finally {
        operatorSnapshotPublishInFlight = false;
        scheduleOperatorSnapshotPublish();
      }
    }, delay);
  }

  function startOperatorSnapshotCountdownClock() {
    window.clearInterval(operatorSnapshotCountdownTimer);
    operatorSnapshotCountdownTimer = window.setInterval(updateAutoPublishClock, 250);
    updateAutoPublishClock();
  }

  function updateAutoPublishClock() {
    const clock = document.getElementById("auto-publish-clock");
    const label = document.getElementById("auto-publish-label");
    const countdown = document.getElementById("auto-publish-countdown");
    if (!clock || !label || !countdown) return;

    const linked = state().operator.linkedTournament;
    const code = state().operator.privateCode || state().tournament.operatorPrivateCode || "";
    clock.classList.toggle("is-idle", !linked?.id || !code);

    if (operatorSnapshotPublishInFlight) {
      label.textContent = "Refreshing";
      countdown.textContent = "0s";
      return;
    }

    if (!linked?.id || !code) {
      label.textContent = "Auto live";
      countdown.textContent = "--";
      return;
    }

    const nextAt = operatorSnapshotNextPublishAt || Date.now() + getOperatorSnapshotAutoPublishMs();
    const remainingMs = Math.max(0, nextAt - Date.now());
    label.textContent = "Auto live";
    countdown.textContent = `${Math.ceil(remainingMs / 1000)}s`;
  }

  window.promptOcrIdentityMatch = window.LB.appOcr.promptOcrIdentityMatch;

  function getRosterOcrProvider() {
    return window.LB.appUtils.getCapabilities().cloudRuntime
      ? "google_ai_studio"
      : (document.getElementById("roster-ocr-provider")?.value || "paddle_local");
  }

  async function runOcr() {
    const provider = window.LB.appUtils.getCapabilities().cloudRuntime
      ? "gemini_api"
      : (document.getElementById("ocr-provider")?.value || "paddle_local");
    const files = document.getElementById("ocr-files")?.files;
    const fileCount = files?.length || 0;
    
    // Save current editor state
    if (ocrEditorInstance && ocrPreviewIndex >= 0) {
       ocrPreviewStates[ocrPreviewIndex] = ocrEditorInstance.getState();
    }
    
    try {
      setOcrBusy(true, `Đang xử lý ${fileCount} ảnh...`);
      
      const fileArray = Array.from(files || []);
      if (!fileArray.length) throw new Error("Chưa chọn file import.");

      window.LB.lastOcrScorecards = [];
      let completed = 0;
      
      window.LB.appOcr.renderOcrReview([], "scorecards");
      const jsonPanel = document.getElementById("ocr-json-panel");
      if (jsonPanel) jsonPanel.hidden = false;
      const json = document.getElementById("ocr-json");
      if (json) json.value = "[]";

      let applyChain = Promise.resolve();

      const promises = fileArray.map(async (file, index) => {
        try {
          const singleResult = await window.LB.ocr.runOcr([file], provider, { 
            task: "scorecards", 
            context: window.LB.appOcr.buildOcrContext(1),
            editorStates: ocrPreviewStates ? [ocrPreviewStates[index]] : undefined
          });

          const rows = window.LB.ocr.normalizeScorecards(singleResult);
          applyChain = applyChain.then(async () => {
             await window.LB.ocr.applyOcrRowsToState(rows, { onIdentityMismatch: window.LB.appOcr.promptOcrIdentityMatch });
             state().imports.unshift({
               id: `imp-${Date.now().toString(36)}-${index}`,
               type: "scorecards",
               rows: rows.length,
               createdAt: new Date().toISOString()
             });
             window.LB.lastOcrScorecards.push(...rows);
             
             if (json) {
                let currentJson = [];
                try { currentJson = JSON.parse(json.value || "[]"); } catch (e) {}
                const updatedJson = Array.isArray(currentJson) ? currentJson.concat(singleResult) : [currentJson, singleResult];
                json.value = JSON.stringify(updatedJson, null, 2);
             }
             
             window.LB.appOcr.renderOcrReview(window.LB.lastOcrScorecards, "scorecards");
             window.LB.appUtils.persistAndRender();
             
             completed++;
             setOcrBusy(true, `Đã xong ${completed}/${fileCount} ảnh...`);
          }).catch(err => {
             console.error("Lỗi khi áp dụng state ảnh " + file.name, err);
             completed++;
          });
          
          await applyChain;
        } catch (err) {
          console.error("Lỗi khi OCR file " + file.name, err);
          applyChain = applyChain.then(() => {
             completed++;
             setOcrBusy(true, `Đã xong ${completed}/${fileCount} ảnh... (Có lỗi)`);
          });
        }
      });
      
      await Promise.all(promises);
      await applyChain;

      setOcrBusy(
        false,
        window.LB.lastOcrScorecards.length
          ? `OCR xong ${completed}/${fileCount} ảnh và đã nhập ${window.LB.lastOcrScorecards.length} scorecard vào staging. Kiểm tra lại điểm trong phần review.`
          : `OCR xong ${completed}/${fileCount} ảnh nhưng chưa nhận diện được scorecard nào.`
      );
    } catch (err) {
      setOcrBusy(false, err.message || "OCR lỗi.");
      alert(err.message);
    }
  }

  function setOcrBusy(isBusy, message = "") {
    ocrProcessing = !!isBusy;
    const form = document.getElementById("ocr-form");
    const status = document.getElementById("ocr-status");
    const review = document.getElementById("ocr-review");
    form?.classList.toggle("is-processing", ocrProcessing);
    document.body.classList.toggle("is-ocr-busy", ocrProcessing);
    form?.querySelectorAll(".ocr-form-body input, .ocr-form-body select, .ocr-form-body textarea, .ocr-form-body button").forEach(control => {
      if (ocrProcessing) {
        control.dataset.ocrWasDisabled = control.disabled ? "1" : "0";
        control.disabled = true;
      } else if (Object.prototype.hasOwnProperty.call(control.dataset, "ocrWasDisabled")) {
        control.disabled = control.dataset.ocrWasDisabled === "1";
        delete control.dataset.ocrWasDisabled;
      }
    });
    if (review) review.setAttribute("aria-busy", ocrProcessing ? "true" : "false");
    if (status) {
      const detail = message || (ocrProcessing ? "Đang xử lý OCR local..." : "Sẵn sàng OCR.");
      const isError = !!message && !ocrProcessing && /lỗi|error|busy|endpoint|không|chưa/i.test(message);
      const shortLabel = ocrProcessing
        ? "Đang OCR"
        : (isError ? "Có lỗi" : (/OCR xong|đã nhập/i.test(detail) ? "Đã nhập" : "Sẵn sàng"));
      status.dataset.tooltip = detail;
      status.setAttribute("aria-label", detail);
      const short = status.querySelector(".ocr-status-short");
      if (short) short.textContent = shortLabel;
      status.classList.toggle("is-processing", ocrProcessing);
      status.classList.toggle("is-error", isError);
      status.classList.toggle("is-success", !ocrProcessing && !isError && /OCR xong|đã nhập/i.test(detail));
    }
  }

  function setRosterOcrBusy(isBusy, message = "") {
    ocrProcessing = !!isBusy;
    const panel = document.querySelector(".roster-import-panel");
    const status = document.getElementById("roster-ocr-status");
    const review = document.getElementById("roster-ocr-review");
    panel?.classList.toggle("is-processing", ocrProcessing);
    document.body.classList.toggle("is-ocr-busy", ocrProcessing);
    panel?.querySelectorAll("input, select, button").forEach(control => {
      control.disabled = ocrProcessing;
    });
    if (review) review.setAttribute("aria-busy", ocrProcessing ? "true" : "false");
    if (status) {
      status.textContent = message || (ocrProcessing ? "Đang đọc danh sách golfer..." : "Sẵn sàng import danh sách golfer.");
      status.classList.toggle("is-processing", ocrProcessing);
      status.classList.toggle("is-error", !!message && !ocrProcessing && /lỗi|error|busy|endpoint|không/i.test(message));
    }
  }

  function syncOcrFileName(files = ocrPreviewFiles) {
    const label = document.getElementById("ocr-file-name");
    if (!label) return;
    if (!files.length) {
      label.textContent = "Chưa chọn";
      return;
    }
    label.textContent = files.length === 1 ? files[0].name : `${files.length} file`;
    label.title = files.map(file => file.name).join(", ");
  }

  function prepareOcrFiles(fileList) {
    ocrPreviewFiles = Array.from(fileList || []).filter(file => (
      file.type.startsWith("image/") || file.type === "application/pdf"
    ));
    ocrPreviewStates = new Array(ocrPreviewFiles.length).fill(null);
    ocrPreviewIndex = 0;
    syncOcrFileName(ocrPreviewFiles);

    const json = document.getElementById("ocr-json");
    const jsonPanel = document.getElementById("ocr-json-panel");
    const results = document.getElementById("ocr-review-results");
    if (json) json.value = "";
    if (jsonPanel) jsonPanel.hidden = true;
    if (results) results.innerHTML = `<div class="empty-state">Ảnh đã sẵn sàng. Bấm OCR và nhập điểm để đọc scorecard.</div>`;
    window.LB.appUtils.setText("ocr-review-count", "0 dòng");

    if (!ocrPreviewFiles.length) {
      const media = document.getElementById("ocr-review-media");
      if (media) {
        media.hidden = true;
        media.replaceChildren();
      }
      if (ocrEditorInstance) {
         ocrEditorInstance = null;
      }
      setOcrBusy(false, "Chưa chọn ảnh scorecard hợp lệ.");
      return;
    }

    renderOcrFilePreview();
    setOcrBusy(false, `Đã chọn ${ocrPreviewFiles.length} file. Ảnh preview đang được xử lý.`);
  }

  function setOcrPreviewIndex(index) {
    if (!ocrPreviewFiles.length) return;
    if (ocrEditorInstance && ocrPreviewIndex >= 0 && ocrPreviewIndex < ocrPreviewStates.length) {
      ocrPreviewStates[ocrPreviewIndex] = ocrEditorInstance.getState();
    }
    ocrPreviewIndex = Math.max(0, Math.min(ocrPreviewFiles.length - 1, Number(index) || 0));
    renderOcrFilePreview();
  }

  function centerOcrPreview() {
    if (ocrEditorInstance) ocrEditorInstance.fitToView();
  }

  function setOcrPreviewScale(value, options = {}) {
    ocrPreviewScale = Math.max(0.1, Math.min(5, Number(value) || 1));
    const slider = document.getElementById("ocr-preview-zoom");
    if (slider && options.syncSlider !== false) {
      slider.value = String(Math.round(ocrPreviewScale * 100));
    }
    if (ocrEditorInstance?.state) {
      ocrEditorInstance.state.zoom = ocrPreviewScale;
      ocrEditorInstance.render();
    }
  }

  function toggleCropMode() {
    if (!ocrEditorInstance) return;
    const isCrop = ocrEditorInstance.state.mode === 'crop';
    ocrEditorInstance.setMode(isCrop ? 'view' : 'crop');
    const cropBtn = document.querySelector('[data-action="ocr-editor-crop"]');
    if (cropBtn) cropBtn.classList.toggle('active', !isCrop);
  }

  function renderOcrFilePreview() {
    const media = document.getElementById("ocr-review-media");
    const file = ocrPreviewFiles[ocrPreviewIndex];
    if (!media || !file) return;
    const isPdf = file.type === "application/pdf";
    const hasMultiple = ocrPreviewFiles.length > 1;
    media.hidden = false;
    
    media.innerHTML = `
      <div class="ocr-preview-head">
        <div>
          <strong>${window.LB.appUtils.escapeHtml(file.name)}</strong>
          <small id="ocr-preview-pager-info">${ocrPreviewIndex + 1}/${ocrPreviewFiles.length}</small>
        </div>
        ${hasMultiple ? `
          <div class="ocr-preview-pager" aria-label="Chuyển file preview">
            <button type="button" class="icon-button" data-action="ocr-preview-previous" title="File trước" aria-label="File trước" ${ocrPreviewIndex === 0 ? "disabled" : ""}>‹</button>
            <button type="button" class="icon-button" data-action="ocr-preview-next" title="File sau" aria-label="File sau" ${ocrPreviewIndex === ocrPreviewFiles.length - 1 ? "disabled" : ""}>›</button>
          </div>
        ` : ""}
      </div>
      <div id="ocr-preview-stage" class="ocr-preview-stage ${isPdf ? "is-pdf" : ""}">
         ${isPdf ? `<iframe src="${window.LB.appUtils.escapeHtml(URL.createObjectURL(file))}#view=FitH" title="Preview ${window.LB.appUtils.escapeHtml(file.name)}"></iframe>` : ''}
      </div>
      ${isPdf ? "" : `
        <div class="ocr-preview-controls">
          <button type="button" class="icon-button" data-action="ocr-editor-rotate-ccw" title="Xoay Trái" aria-label="Xoay Trái">↺</button>
          <button type="button" class="icon-button" data-action="ocr-editor-rotate-cw" title="Xoay Phải" aria-label="Xoay Phải">↻</button>
          <div class="control-divider"></div>
          <button type="button" class="icon-button" data-action="ocr-editor-crop" title="Cắt ảnh" aria-label="Cắt ảnh">✂</button>
          <button type="button" class="icon-button active" data-action="ocr-editor-enhance" title="Tiền xử lý" aria-label="Tiền xử lý">✨</button>
          <div class="control-divider"></div>
          <button type="button" class="icon-button" data-action="ocr-preview-zoom-fit" title="Vừa khung" aria-label="Vừa khung">1:1</button>
        </div>
      `}
    `;
    
    if (isPdf) {
       ocrEditorInstance = null;
    } else {
       const stage = document.getElementById("ocr-preview-stage");
       ocrEditorInstance = new window.LB.ScorecardEditor(stage);
       setOcrBusy(true, "Đang xử lý ảnh...");
       ocrEditorInstance.loadFile(file).then(() => {
          setOcrBusy(false, "");
          const savedState = ocrPreviewStates[ocrPreviewIndex];
          if (savedState) {
             ocrEditorInstance.setState(savedState);
          }
       }).catch(e => {
          setOcrBusy(false, e.message);
       });
    }
  }

  function exposeLegacyModuleGlobals() {
    const functionBindings = {
      applyMobileDashboardOverviewState,
      applyOfflineCourseSelection,
      applyPlayerSearchQuery,
      buildOperatorLinkSnapshot,
      focusPendingScoreGridCell,
      getFilteredPlayers,
      getOperatorScorePollMs,
      getOperatorSnapshotAutoPublishMs,
      handleClick,
      handleFinalResultsInput,
      handleKeydown,
      handleSearchPointerUp,
      handleWindowScroll,
      hideTouchTooltip,
      markScoreLiveUpdated,
      normalizeFinalNetCutLimit,
      prepareOcrFiles,
      publishOperatorLinkSnapshot,
      renderFinalResultsPanel,
      renderLeaderboard,
      renderOfflineCourseCatalogOptions,
      renderOfflineCourseStatus,
      renderOperatorTournamentControls,
      renderScoreCell,
      renderScoreTable,
      renderSimulatorLocalOnlyState,
      renderTs36MatchReview,
      restartOperatorBridgePolling,
      scheduleOperatorFlightConfigPublish,
      scheduleOperatorSnapshotPublish,
      scheduleScoreFlyHeaderUpdate,
      setOcrPreviewScale,
      setOperatorLiveNotificationMaxAgeMinutes,
      setOperatorLiveNotificationMaxItems,
      setOperatorLiveNotificationRetentionMode,
      setOperatorScorePollSeconds,
      setOperatorSnapshotAutoPublishSeconds,
      setRosterOcrBusy,
      stopUnlinkedRuntimeServices,
      syncOcrFileName,
      syncPlayerSearchField,
      updateAutoPublishClock
    };

    window.LB.appRuntime = functionBindings;
    Object.entries(functionBindings).forEach(([name, value]) => {
      Object.defineProperty(window, name, {
        configurable: true,
        writable: true,
        value
      });
    });

    const stateBindings = {
      finalDqSearchInputValue: {
        get: () => finalDqSearchInputValue,
        set: value => { finalDqSearchInputValue = value; }
      },
      finalDqSearchQuery: {
        get: () => finalDqSearchQuery,
        set: value => { finalDqSearchQuery = value; }
      },
      mobileDashboardDownTravel: {
        get: () => mobileDashboardDownTravel,
        set: value => { mobileDashboardDownTravel = value; }
      },
      mobileDashboardLastScrollY: {
        get: () => mobileDashboardLastScrollY,
        set: value => { mobileDashboardLastScrollY = value; }
      },
      mobileDashboardScrollCooldownUntil: {
        get: () => mobileDashboardScrollCooldownUntil,
        set: value => { mobileDashboardScrollCooldownUntil = value; }
      },
      mobileDashboardUpTravel: {
        get: () => mobileDashboardUpTravel,
        set: value => { mobileDashboardUpTravel = value; }
      },
      mobileLiveOverviewCollapsed: {
        get: () => mobileLiveOverviewCollapsed,
        set: value => { mobileLiveOverviewCollapsed = value; }
      },
      mobileTournamentOverviewCollapsed: {
        get: () => mobileTournamentOverviewCollapsed,
        set: value => { mobileTournamentOverviewCollapsed = value; }
      },
      offlineCourseCatalogNotice: {
        get: () => offlineCourseCatalogNotice,
        set: value => { offlineCourseCatalogNotice = value; }
      },
      pendingScoreGridFocus: {
        get: () => pendingScoreGridFocus,
        set: value => { pendingScoreGridFocus = value; }
      },
      playerSearchPointerActive: {
        get: () => playerSearchPointerActive,
        set: value => { playerSearchPointerActive = value; }
      },
      rosterMatchSearchInputValue: {
        get: () => rosterMatchSearchInputValue,
        set: value => { rosterMatchSearchInputValue = value; }
      },
      rosterMatchSearchQuery: {
        get: () => rosterMatchSearchQuery,
        set: value => { rosterMatchSearchQuery = value; }
      },
      scoreEntrySearchInputValue: {
        get: () => scoreEntrySearchInputValue,
        set: value => { scoreEntrySearchInputValue = value; }
      },
      scoreEntrySearchQuery: {
        get: () => scoreEntrySearchQuery,
        set: value => { scoreEntrySearchQuery = value; }
      },
      scoreFlyHeaderNeedsRebuild: {
        get: () => scoreFlyHeaderNeedsRebuild,
        set: value => { scoreFlyHeaderNeedsRebuild = value; }
      },
      scoreFlyHeaderSourceTable: {
        get: () => scoreFlyHeaderSourceTable,
        set: value => { scoreFlyHeaderSourceTable = value; }
      },
      suppressPanelHeaderToggleUntil: {
        get: () => suppressPanelHeaderToggleUntil,
        set: value => { suppressPanelHeaderToggleUntil = value; }
      },
      touchTooltipTimer: {
        get: () => touchTooltipTimer,
        set: value => { touchTooltipTimer = value; }
      },
      ts36MatchSearchInputValue: {
        get: () => ts36MatchSearchInputValue,
        set: value => { ts36MatchSearchInputValue = value; }
      },
      ts36MatchSearchQuery: {
        get: () => ts36MatchSearchQuery,
        set: value => { ts36MatchSearchQuery = value; }
      }
    };

    Object.entries(stateBindings).forEach(([name, descriptor]) => {
      Object.defineProperty(window, name, {
        configurable: true,
        get: descriptor.get,
        set: descriptor.set
      });
    });
  }

  exposeLegacyModuleGlobals();

  window.LB.app = {
    render: window.LB.appUtils.render,
    renderLight: window.LB.appUtils.renderLight,
    persistAndRender: window.LB.appUtils.persistAndRender,
    showView: window.LB.appUtils.showView,
    applySimulator2RosterPlayers: window.LB.appPlayer.applySimulator2RosterPlayers,
    setSimulator2Mode: window.LB.appUtils.setSimulator2Mode,
    getActiveSimulationMode: window.LB.appUtils.getActiveSimulationMode,
    publishRoster,
    syncOperatorBridgeData: window.LB.appUtils.syncOperatorBridgeData,
    buildOperatorLinkSnapshot,
    publishOperatorLinkSnapshot,
    scheduleOperatorSnapshotPublish,
    renderOperationModeVisibility: window.LB.appUtils.renderOperationModeVisibility,
    validateOperatorTournamentRuntime,
    getRosterOcrProvider,
    unlockTournamentFormInputs,
    getCourseGridLockTitle,
    getRosterImportGateMessage,
    markRosterImportReady,
    finishLinkedTournamentEntry: window.LB.appUtils.finishLinkedTournamentEntry,
    applyOperatorTournamentToState: window.LB.appUtils.applyOperatorTournamentToState
  };

  document.addEventListener("DOMContentLoaded", init);
})();
