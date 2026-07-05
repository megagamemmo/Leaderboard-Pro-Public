(function () {
  const SNAPSHOT_TTL_MS = 30 * 24 * 60 * 60 * 1000;
  const LAN_PUBLISH_RETRY_DELAYS_MS = [1500, 5000, 15000, 30000, 60000];
  const lanPublishRetryTimers = new Map();

  function clone(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function getSharePrefixSourceText(input = {}) {
    if (typeof input === "string") return input;
    return [
      input.courseName,
      input.tournamentName,
      input.operatorName,
      input.name,
      input.title
    ].find(Boolean) || "";
  }

  function normalizeSharePrefix(input = {}) {
    const sourceText = getSharePrefixSourceText(input);
    const words = String(sourceText || "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toUpperCase()
      .replace(/[^A-Z0-9\s]+/g, " ")
      .trim()
      .split(/\s+/)
      .filter(word => !["GOLF", "COURSE", "CLUB", "RESORT", "COUNTRY", "SAN", "SÂN"].includes(word));
    const letters = words.length >= 2
      ? `${words[0][0]}${words[1][0]}`
      : words[0]?.slice(0, 2);
    const clean = String(letters || "LB").replace(/[^A-Z]/g, "");
    return (clean || "LB").padEnd(2, "X").slice(0, 2);
  }

  function getSnapshotUpdatedAtMs(snapshot = {}) {
    const value =
      snapshot.tournament?.updatedAt ||
      snapshot.tournament?.createdAt ||
      snapshot.updatedAt ||
      snapshot.createdAt ||
      "";
    const time = new Date(value).getTime();
    return Number.isFinite(time) ? time : Date.now();
  }

  function pruneExpiredSnapshots(snapshots = getSnapshotsRaw()) {
    const cutoff = Date.now() - SNAPSHOT_TTL_MS;
    let changed = false;
    const next = {};
    Object.entries(snapshots || {}).forEach(([slug, snapshot]) => {
      if (getSnapshotUpdatedAtMs(snapshot) < cutoff) {
        changed = true;
        return;
      }
      next[slug] = snapshot;
    });
    if (changed) localStorage.setItem(window.LB.STORAGE_KEYS.SNAPSHOTS, JSON.stringify(next));
    return next;
  }

  function generateShareSlug(input = {}) {
    const cleanPrefix = normalizeSharePrefix(input);
    const snapshots = pruneExpiredSnapshots();
    const used = new Set(Object.keys(snapshots).map(slug => String(slug).toUpperCase()));
    const currentSlug = String(window.LB.state?.tournament?.shareSlug || "").trim();
    if (currentSlug) used.add(currentSlug.toUpperCase());
    for (let attempt = 0; attempt < 10000; attempt += 1) {
      const number = Math.floor(Math.random() * 10000);
      const slug = `${cleanPrefix}${String(number).padStart(4, "0")}`;
      if (!used.has(slug.toUpperCase())) return slug;
    }
    return `${cleanPrefix}${String(Date.now()).slice(-4)}`;
  }

  function saveState() {
    const state = window.LB.state;
    state.tournament.updatedAt = new Date().toISOString();
    localStorage.setItem(window.LB.STORAGE_KEYS.APP_STATE, JSON.stringify(state));
  }

  function loadState() {
    try {
      const raw = localStorage.getItem(window.LB.STORAGE_KEYS.APP_STATE);
      if (!raw) return false;
      const parsed = JSON.parse(raw);
      window.LB.state = {
        ...window.LB.state,
        ...parsed,
        tournament: {
          ...window.LB.state.tournament,
          ...(parsed.tournament || {}),
          handicapRatings: {
            ...window.LB.state.tournament.handicapRatings,
            ...((parsed.tournament || {}).handicapRatings || {})
          }
        },
        course: { ...window.LB.state.course, ...(parsed.course || {}) },
        players: Array.isArray(parsed.players) ? parsed.players : [],
        scores: parsed.scores || {},
        liveNotifications: Array.isArray(parsed.liveNotifications) ? parsed.liveNotifications : [],
        finalResults: {
          ...window.LB.state.finalResults,
          ...(parsed.finalResults || {}),
          netCutLimit: parsed.finalResults?.netCutLimit ?? null,
          excludedPlayerIds: Array.isArray(parsed.finalResults?.excludedPlayerIds)
            ? parsed.finalResults.excludedPlayerIds
            : [],
          technicalAwardCounts: {
            ...window.LB.state.finalResults.technicalAwardCounts,
            ...(parsed.finalResults?.technicalAwardCounts || {})
          },
          longestDrive: Array.isArray(parsed.finalResults?.longestDrive) ? parsed.finalResults.longestDrive : [],
          nearestToPin: Array.isArray(parsed.finalResults?.nearestToPin) ? parsed.finalResults.nearestToPin : [],
          nearToTheLine: Array.isArray(parsed.finalResults?.nearToTheLine) ? parsed.finalResults.nearToTheLine : [],
          longestPutt: Array.isArray(parsed.finalResults?.longestPutt) ? parsed.finalResults.longestPutt : [],
          holeInOneCount: Number.isFinite(Number(parsed.finalResults?.holeInOneCount))
            ? Math.min(4, Math.max(0, Math.trunc(Number(parsed.finalResults.holeInOneCount))))
            : 0,
          holeInOneAwards: Array.isArray(parsed.finalResults?.holeInOneAwards) ? parsed.finalResults.holeInOneAwards : [],
          specialAwards: Array.isArray(parsed.finalResults?.specialAwards) ? parsed.finalResults.specialAwards : [],
          publishedSnapshot: parsed.finalResults?.publishedSnapshot || null
        },
        imports: Array.isArray(parsed.imports) ? parsed.imports : [],
        identity: { ...window.LB.state.identity, ...(parsed.identity || {}) },
        ts36Matches: Array.isArray(parsed.ts36Matches) ? parsed.ts36Matches : [],
        matchReview: { ...window.LB.state.matchReview, ...(parsed.matchReview || {}) },
        alerts: Array.isArray(parsed.alerts) ? parsed.alerts : [],
        operator: {
          ...window.LB.state.operator,
          ...(parsed.operator || {}),
          scoreSyncCursor: {
            ...window.LB.state.operator.scoreSyncCursor,
            ...((parsed.operator || {}).scoreSyncCursor || {})
          }
        },
        flightConfig: { ...window.LB.state.flightConfig, ...(parsed.flightConfig || {}) },
        cloud: { ...window.LB.state.cloud, ...(parsed.cloud || {}) }
      };
      return true;
    } catch (err) {
      console.warn("[Storage] Failed to load state:", err);
      return false;
    }
  }

  function resetState() {
    const base = clone(window.LB.state);
    const now = Date.now().toString(36);
    base.tournament = {
      ...base.tournament,
      id: `local-${now}`,
      name: "Tournament mới",
      operatorName: "",
      courseName: "",
      status: "draft",
      handicapRatings: {
        male: { courseRating: "", slopeRating: "" },
        female: { courseRating: "", slopeRating: "" }
      },
      shareSlug: generateShareSlug({ tournamentName: "Tournament mới" }),
      operatorTournamentId: "",
      operatorPrivateCode: "",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    base.operator = {
      tournaments: [],
      linkedTournament: null,
      privateCode: "",
      scorePollMs: window.LB.state.operator?.scorePollMs || 10000,
      snapshotAutoPublishMs: window.LB.state.operator?.snapshotAutoPublishMs || 300000,
      lastScoreSyncAt: "",
      lastParticipantSyncAt: "",
      scoreSyncCursor: {
        tournamentId: "",
        changeSeq: 0
      },
      rosterPublishedAt: "",
      rosterPublishedCount: 0,
      liveNotificationRetentionMode: window.LB.state.operator?.liveNotificationRetentionMode || "time",
      liveNotificationMaxAgeMinutes: window.LB.state.operator?.liveNotificationMaxAgeMinutes || 45,
      liveNotificationMaxItems: window.LB.state.operator?.liveNotificationMaxItems || 20,
      publishedRosterSnapshot: []
    };
    base.players = [];
    base.scores = {};
    base.liveNotifications = [];
    base.finalResults = {
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
    };
    base.imports = [];
    base.ts36Matches = [];
    base.matchReview = {
      selectedTs36Id: "",
      selectedPlayerId: ""
    };
    base.identity = {
      clwNext: 1
    };
    base.alerts = [];
    window.LB.state = base;
    saveState();
  }

  function getSnapshotsRaw() {
    try {
      return JSON.parse(localStorage.getItem(window.LB.STORAGE_KEYS.SNAPSHOTS) || "{}");
    } catch (err) {
      return {};
    }
  }

  function getSnapshots() {
    return pruneExpiredSnapshots(getSnapshotsRaw());
  }

  function saveSnapshot(snapshot, options = {}) {
    const snapshots = pruneExpiredSnapshots();
    snapshots[snapshot.shareSlug] = snapshot;
    localStorage.setItem(window.LB.STORAGE_KEYS.SNAPSHOTS, JSON.stringify(snapshots));
    if (options.publish !== false) void ensureLanSnapshotPublished(snapshot);
    return snapshot;
  }

  function removeSnapshot(slug, options = {}) {
    const snapshots = pruneExpiredSnapshots();
    delete snapshots[slug];
    localStorage.setItem(window.LB.STORAGE_KEYS.SNAPSHOTS, JSON.stringify(snapshots));
    clearLanSnapshotRetry(slug);
    if (options.publish !== false) void deleteLanSnapshot(slug, { simulatorOnly: options.simulatorOnly === true });
  }

  function getSnapshot(slug) {
    const snapshots = getSnapshots();
    const key = String(slug || "").trim();
    return snapshots[key] || snapshots[key.toUpperCase()] || snapshots[key.toLowerCase()] || null;
  }

  function isSimulatorSnapshot(snapshot = {}) {
    return Boolean(
      snapshot?.simulator?.localOnly === true ||
      snapshot?.tournament?.operatorName === "LB Simulator" ||
      /^SIM Blind Competition\b/i.test(String(snapshot?.tournament?.name || ""))
    );
  }

  function removeSimulatorSnapshotsFromLocalStorage() {
    const snapshots = pruneExpiredSnapshots();
    let deleted = 0;
    Object.entries(snapshots || {}).forEach(([slug, snapshot]) => {
      if (!isSimulatorSnapshot(snapshot)) return;
      delete snapshots[slug];
      clearLanSnapshotRetry(slug);
      deleted += 1;
    });
    if (deleted) localStorage.setItem(window.LB.STORAGE_KEYS.SNAPSHOTS, JSON.stringify(snapshots));
    return deleted;
  }

  function getLanSnapshotBaseUrl() {
    const explicit = String(window.ENV?.LOCAL_SNAPSHOT_SERVER_URL || "").trim().replace(/\/+$/, "");
    if (explicit) return explicit;
    const protocol = window.location.protocol === "https:" ? "https:" : "http:";
    const host = window.location.hostname || "localhost";
    return `${protocol}//${host}:4333`;
  }

  function getLanSnapshotUrl(slug) {
    const key = String(slug || "").trim();
    return key ? `${getLanSnapshotBaseUrl()}/snapshots/${encodeURIComponent(key)}` : "";
  }

  function appendQuery(target, query) {
    return target && query ? `${target}${target.includes("?") ? "&" : "?"}${query}` : target;
  }

  async function deleteLanSnapshot(slug, options = {}) {
    const key = String(slug || "").trim();
    if (!key || !window.fetch) return false;
    const query = options.simulatorOnly ? "simulatorOnly=1" : "";
    const sameOriginEndpoint = appendQuery(`/api/local-public-snapshot/${encodeURIComponent(key)}`, query);
    const lanEndpoint = appendQuery(getLanSnapshotUrl(key), query);
    const remove = async target => {
      if (!target) return false;
      try {
        const response = await window.fetch(target, { method: "DELETE", cache: "no-store" });
        return response.ok;
      } catch (err) {
        return false;
      }
    };
    const sameOriginDeleted = await remove(sameOriginEndpoint);
    if (lanEndpoint && lanEndpoint !== sameOriginEndpoint) void remove(lanEndpoint);
    return sameOriginDeleted;
  }

  async function cleanupSimulatorSnapshots(options = {}) {
    const localDeleted = removeSimulatorSnapshotsFromLocalStorage();
    if (options.publish === false || !window.fetch) return { localDeleted, serverDeleted: 0 };
    const sameOriginEndpoint = "/api/local-public-snapshot/__simulator__?scope=simulator";
    const lanEndpoint = `${getLanSnapshotBaseUrl()}/snapshots/__simulator__?scope=simulator`;
    const remove = async target => {
      try {
        const response = await window.fetch(target, { method: "DELETE", cache: "no-store" });
        const payload = await response.json().catch(() => ({}));
        return response.ok ? (parseInt(payload.deleted, 10) || 0) : 0;
      } catch (err) {
        return 0;
      }
    };
    const serverDeleted = await remove(sameOriginEndpoint);
    if (lanEndpoint && lanEndpoint !== sameOriginEndpoint) void remove(lanEndpoint);
    return { localDeleted, serverDeleted };
  }

  async function publishLanSnapshot(snapshot) {
    const endpoint = getLanSnapshotUrl(snapshot?.shareSlug);
    const slug = String(snapshot?.shareSlug || "").trim();
    if (!slug || !window.fetch) return false;
    const sameOriginEndpoint = `/api/local-public-snapshot/${encodeURIComponent(slug)}`;
    const body = JSON.stringify({ snapshot });
    const publish = async target => {
      if (!target) return false;
      for (let attempt = 0; attempt < 3; attempt += 1) {
        try {
          const response = await window.fetch(target, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body
          });
          if (response.ok) return true;
        } catch (err) {
          // Retry transient LAN/startup failures below.
        }
        if (attempt < 2) {
          await new Promise(resolve => window.setTimeout(resolve, 180 * (attempt + 1)));
        }
      }
      return false;
    };
    const sameOriginPublished = await publish(sameOriginEndpoint);
    if (sameOriginPublished) {
      if (endpoint && endpoint !== sameOriginEndpoint) void publish(endpoint);
      return true;
    }
    return publish(endpoint);
  }

  function clearLanSnapshotRetry(slug) {
    const key = String(slug || "").trim();
    const timer = lanPublishRetryTimers.get(key);
    if (timer) window.clearTimeout(timer);
    lanPublishRetryTimers.delete(key);
  }

  function scheduleLanSnapshotRetry(snapshot, attempt = 0) {
    const slug = String(snapshot?.shareSlug || "").trim();
    if (!slug || attempt >= LAN_PUBLISH_RETRY_DELAYS_MS.length || lanPublishRetryTimers.has(slug)) return;
    const delay = LAN_PUBLISH_RETRY_DELAYS_MS[attempt];
    const timer = window.setTimeout(async () => {
      lanPublishRetryTimers.delete(slug);
      const latestSnapshot = getSnapshot(slug) || snapshot;
      const published = await ensureLanSnapshotPublished(latestSnapshot, attempt + 1);
      if (!published && attempt + 1 < LAN_PUBLISH_RETRY_DELAYS_MS.length) {
        scheduleLanSnapshotRetry(latestSnapshot, attempt + 1);
      }
    }, delay);
    lanPublishRetryTimers.set(slug, timer);
  }

  async function ensureLanSnapshotPublished(snapshot, retryAttempt = 0) {
    const published = await publishLanSnapshot(snapshot);
    const slug = String(snapshot?.shareSlug || "").trim();
    if (published) {
      clearLanSnapshotRetry(slug);
      return true;
    }
    scheduleLanSnapshotRetry(snapshot, retryAttempt);
    return false;
  }

  async function fetchLanSnapshot(slug) {
    const endpoint = getLanSnapshotUrl(slug);
    if (!endpoint || !window.fetch) return null;
    try {
      const response = await window.fetch(endpoint, {
        headers: { Accept: "application/json" },
        cache: "no-store"
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || !payload?.ok) return null;
      return payload.snapshot || null;
    } catch (err) {
      return null;
    }
  }

  function initTheme(toggleId = "theme-toggle") {
    const saved = localStorage.getItem(window.LB.STORAGE_KEYS.THEME) || "dark";
    document.documentElement.setAttribute("data-theme", saved);
    const toggle = document.getElementById(toggleId);
    if (toggle) {
      toggle.addEventListener("click", () => {
        const current = document.documentElement.getAttribute("data-theme") || "dark";
        const next = current === "dark" ? "light" : "dark";
        document.documentElement.setAttribute("data-theme", next);
        localStorage.setItem(window.LB.STORAGE_KEYS.THEME, next);
      });
    }
  }

  window.LB.storage = {
    clone,
    saveState,
    loadState,
    resetState,
    generateShareSlug,
    getSharePrefix: normalizeSharePrefix,
    getSnapshots,
    saveSnapshot,
    removeSnapshot,
    getSnapshot,
    publishLanSnapshot,
    deleteLanSnapshot,
    cleanupSimulatorSnapshots,
    ensureLanSnapshotPublished,
    fetchLanSnapshot,
    initTheme
  };
})();
