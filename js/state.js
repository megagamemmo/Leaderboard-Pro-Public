(function () {
  function createInitialShareSlug(prefix = "LB") {
    return `${prefix}${String(Math.floor(Math.random() * 10000)).padStart(4, "0")}`;
  }

  const holes = Array.from({ length: 18 }, (_, index) => ({
    hole: index + 1,
    par: [4, 5, 4, 3, 4, 4, 5, 3, 4, 4, 5, 4, 3, 4, 4, 5, 3, 4][index],
    strokeIndex: index + 1
  }));
  const defaultOperatorScorePollMs = Math.max(3000, parseInt(window.ENV?.OPERATOR_SCORE_POLL_MS, 10) || 10000);
  const defaultOperatorSnapshotAutoPublishMs = Math.max(5000, parseInt(window.ENV?.OPERATOR_SNAPSHOT_AUTO_PUBLISH_MS, 10) || 300000);

  window.LB = {
    STORAGE_KEYS: {
      APP_STATE: "lbpro_app_state",
      SNAPSHOTS: "lbpro_public_snapshots",
      THEME: "lbpro_theme"
    },
    CREDIT_COSTS: {
      LEADERBOARD_SYNC: 30,
      LEADERBOARD_SYNC_AFTER_OCR: 20
    },
    getRuntimeMode: function () {
      return String(window.ENV?.LB_RUNTIME_MODE || "local").toLowerCase() === "cloud"
        ? "cloud"
        : "local";
    },
    getRuntimeClient: function () {
      return String(window.ENV?.LB_RUNTIME_CLIENT || "local").toLowerCase();
    },
    isLinkedToTS36: function () {
      return Boolean(window.LB.state?.operator?.linkedTournament?.id);
    },
    getOperationMode: function () {
      if (!window.LB.isLinkedToTS36()) return "local";
      const managementMode = String(
        window.LB.state?.operator?.linkedTournament?.managementMode ||
        window.LB.state?.operator?.linkedTournament?.management_mode ||
        "fixed"
      ).toLowerCase();
      return managementMode === "flexible" ? "flexible" : "fixed";
    },
    getCapabilities: function () {
      const runtimeMode = window.LB.getRuntimeMode();
      const runtimeClient = window.LB.getRuntimeClient();
      const operationMode = window.LB.getOperationMode();
      const linked = operationMode !== "local";
      const cloudRuntime = runtimeMode === "cloud";
      return {
        runtimeMode,
        runtimeClient,
        operationMode,
        linked,
        cloudRuntime,
        localFallbackRuntime: cloudRuntime && runtimeClient === "local-fallback",
        canUseBridge: linked,
        canUseLocalServices: runtimeMode === "local",
        canUseSimulator: runtimeMode === "local",
        canPublishRoster: linked,
        canPollTourSystemScores: linked
      };
    },
    state: {
      tournament: {
        id: `local-${Date.now().toString(36)}`,
        name: "Leaderboard Pro Demo",
        operatorName: "",
        courseName: "",
        startHole: 1,
        scoringFormat: "stroke_net",
        handicapRatings: {
          male: { courseRating: "", slopeRating: "" },
          female: { courseRating: "", slopeRating: "" }
        },
        status: "draft",
        shareSlug: createInitialShareSlug("LB"),
        publicRead: true,
        operatorTournamentId: "",
        operatorPrivateCode: "",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      },
      course: {
        holes
      },
      operator: {
        tournaments: [],
        linkedTournament: null,
        privateCode: "",
        scorePollMs: defaultOperatorScorePollMs,
        snapshotAutoPublishMs: defaultOperatorSnapshotAutoPublishMs,
        lastScoreSyncAt: "",
        lastParticipantSyncAt: "",
        scoreSyncCursor: {
          tournamentId: "",
          changeSeq: 0
        },
        liveNotificationRetentionMode: "time",
        liveNotificationMaxAgeMinutes: 45,
        liveNotificationMaxItems: 20,
        rosterPublishedAt: "",
        rosterPublishedCount: 0,
        publishedRosterSnapshot: []
      },
      identity: {
        clwNext: 1
      },
      flightConfig: {
        locked: true,
        source: "toursystem36",
        tournamentFormat: "mixed",
        bestGrossAward: "yes",
        genderMode: "combined",
        allowFlightJump: false,
        rosterImportReady: false,
        fixedFlightName: "",
        flights: [
          { name: "Bảng A", min: 0, max: 12, isSystem36: true, scoringMode: "system36" },
          { name: "Bảng B", min: 13, max: 23, isSystem36: true, scoringMode: "system36" },
          { name: "Bảng C", min: 24, max: 36, isSystem36: true, scoringMode: "system36" }
        ]
      },
      players: [],
      scores: {},
      liveNotifications: [],
      finalResults: {
        status: "draft",
        publishedAt: "",
        rankingScope: "division",
        netCutLimit: null,
        excludedPlayerIds: [],
        technicalGenderMode: "combined",
        technicalAwardCounts: {
          longestDrive: 1,
          nearestToPin: 1,
          nearToTheLine: 1,
          longestPutt: 1
        },
        longestDrive: [],
        nearestToPin: [],
        nearToTheLine: [],
        longestPutt: [],
        holeInOneCount: 0,
        holeInOneAwards: [],
        specialAwards: [],
        publishedSnapshot: null
      },
      imports: [],
      ts36Matches: [],
      matchReview: {
        selectedTs36Id: "",
        selectedPlayerId: ""
      },
      alerts: [],
      cloud: {
        enabled: false,
        lastSyncAt: "",
        lastError: ""
      }
    }
  };
})();
