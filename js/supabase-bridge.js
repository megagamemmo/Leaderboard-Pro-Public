(function () {
  let client = null;

  function getEnv() {
    return window.ENV || {};
  }

  function simulatorWriteBlocked() {
    return window.LB?.state?.simulator?.active === true;
  }

  function localOnlyResult() {
    return { ok: false, blocked: true, reason: "simulator_local_only" };
  }

  function getPublicStateBaseUrl() {
    const env = getEnv();
    return String(
      env.PUBLIC_STATE_BASE_URL ||
      env.PUBLIC_LEADERBOARD_BASE_URL ||
      env.TOUR_SYSTEM_PUBLIC_URL ||
      env.TS36_PUBLIC_URL ||
      ""
    ).replace(/\/+$/, "");
  }

  function getPublicSnapshotPollMs() {
    const env = getEnv();
    const value = Number(env.PUBLIC_SNAPSHOT_POLL_MS || env.PUBLIC_STATE_POLL_MS || 300000);
    return Number.isFinite(value) && value >= 5000 ? Math.min(300000, Math.trunc(value)) : 300000;
  }

  function getLeaderboardBridgeEndpoint() {
    const env = getEnv();
    const explicit = String(env.LEADERBOARD_BRIDGE_ENDPOINT || env.OPERATOR_BRIDGE_ENDPOINT || "").trim();
    if (explicit) return explicit;
    const baseUrl = getPublicStateBaseUrl();
    return baseUrl ? `${baseUrl}/api/leaderboard-bridge` : "";
  }

  function isDirectOperatorBridgeFallbackEnabled() {
    const env = getEnv();
    return /^(1|true|yes)$/i.test(String(env.OPERATOR_BRIDGE_DIRECT_SUPABASE_FALLBACK || ""));
  }

  async function callLeaderboardBridge(action, payload = {}) {
    const endpoint = getLeaderboardBridgeEndpoint();
    if (!endpoint || !window.fetch) return null;

    const response = await window.fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json"
      },
      cache: "no-store",
      body: JSON.stringify({ action, payload })
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok || result.ok === false) {
      const error = new Error(result.error || `leaderboard_bridge_${response.status}`);
      error.bridgeResult = result;
      throw error;
    }
    return result;
  }

  async function callLeaderboardBridgeOrFallback(action, payload, fallback) {
    try {
      const result = await callLeaderboardBridge(action, payload);
      if (result) return result;
    } catch (err) {
      if (!isDirectOperatorBridgeFallbackEnabled()) throw err;
      console.warn("[TS36 Bridge] proxy failed, falling back to direct Supabase:", err);
    }
    return fallback();
  }

  function isDirectPublicSnapshotFallbackEnabled() {
    const env = getEnv();
    return /^(1|true|yes)$/i.test(String(env.PUBLIC_SNAPSHOT_DIRECT_SUPABASE_FALLBACK || ""));
  }

  function getPublicSnapshotEndpoint(slug) {
    const cleanSlug = String(slug || "").trim();
    if (!cleanSlug) return "";
    const env = getEnv();
    const explicit = String(env.PUBLIC_SNAPSHOT_URL || env.PUBLIC_LEADERBOARD_STATE_URL || "").trim();
    if (explicit) {
      if (explicit.includes(":slug")) return explicit.replace(":slug", encodeURIComponent(cleanSlug));
      if (explicit.includes("{slug}")) return explicit.replace("{slug}", encodeURIComponent(cleanSlug));
      return `${explicit.replace(/\/+$/, "")}/${encodeURIComponent(cleanSlug)}`;
    }
    const baseUrl = getPublicStateBaseUrl();
    return baseUrl ? `${baseUrl}/api/tournament-state/${encodeURIComponent(cleanSlug)}` : "";
  }

  function getRevalidateToken() {
    const env = getEnv();
    return String(
      env.PUBLIC_STATE_REVALIDATE_TOKEN ||
      env.LEADERBOARD_REVALIDATE_TOKEN ||
      env.REVALIDATE_TOKEN ||
      ""
    ).trim();
  }

  function getRevalidateEndpoint() {
    const env = getEnv();
    const explicit = String(env.PUBLIC_STATE_REVALIDATE_URL || "").trim();
    if (explicit) return explicit;
    const baseUrl = getPublicStateBaseUrl();
    return baseUrl ? `${baseUrl}/api/revalidate-tournament-state` : "";
  }

  async function revalidatePublicState(slug, metadata = {}) {
    if (simulatorWriteBlocked()) return localOnlyResult();
    const cleanSlug = String(slug || "").trim();
    const endpoint = getRevalidateEndpoint();
    if (!cleanSlug || !endpoint || !window.fetch) {
      return { ok: false, skipped: true, reason: "revalidate_not_configured" };
    }

    try {
      const token = getRevalidateToken();
      const response = await window.fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {})
        },
        body: JSON.stringify({
          slug: cleanSlug,
          source: "leaderboard_pro",
          ...metadata
        })
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        return { ok: false, reason: payload.error || `revalidate_${response.status}` };
      }
      return { ok: true, data: payload };
    } catch (err) {
      console.warn("[Vercel] revalidate public state failed:", err);
      return { ok: false, reason: err.message || "revalidate_failed" };
    }
  }

  function isConfigured() {
    const env = getEnv();
    return !!(window.supabase && env.SUPABASE_URL && env.SUPABASE_ANON_KEY && !/your-project/i.test(env.SUPABASE_URL));
  }

  function getClient() {
    if (client) return client;
    if (!isConfigured()) return null;
    const env = getEnv();
    client = window.supabase.createClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY, {
      auth: {
        storageKey: env.AUTH_STORAGE_KEY || "lbpro_supabase_auth",
        persistSession: true,
        autoRefreshToken: true
      }
    });
    return client;
  }

  async function checkConnection() {
    const supabaseClient = getClient();
    if (!supabaseClient) {
      if (getLeaderboardBridgeEndpoint()) {
        return { ok: true, mode: "bridge", message: "TS36 bridge connected" };
      }
      return { ok: false, mode: "local", message: "Chưa cấu hình Supabase" };
    }

    try {
      const { data, error } = await supabaseClient.auth.getSession();
      if (error) throw error;
      return {
        ok: true,
        mode: data?.session ? "authenticated" : "anonymous",
        message: data?.session ? "Supabase connected" : "Supabase connected (private-code mode)"
      };
    } catch (err) {
      return { ok: false, mode: "error", message: err.message };
    }
  }

  async function publishSnapshot(snapshot) {
    if (simulatorWriteBlocked()) return localOnlyResult();
    const supabaseClient = getClient();
    if (!supabaseClient) return { ok: false, reason: "local_only" };

    try {
      const { error } = await supabaseClient
        .from("leaderboard_public_snapshots")
        .upsert({
          share_slug: snapshot.shareSlug,
          tournament_id: snapshot.tournament.id,
          payload: snapshot,
          is_public: true,
          updated_at: new Date().toISOString()
        }, { onConflict: "share_slug" });
      if (error) throw error;
      const revalidated = await revalidatePublicState(snapshot.shareSlug, {
        tournamentId: snapshot.tournament?.id || ""
      });
      return { ok: true, revalidated };
    } catch (err) {
      console.warn("[Supabase] publish snapshot failed:", err);
      return { ok: false, reason: err.message };
    }
  }

  async function fetchCachedPublicSnapshot(slug) {
    const endpoint = getPublicSnapshotEndpoint(slug);
    if (!endpoint || !window.fetch) return null;

    try {
      const response = await window.fetch(endpoint, {
        headers: { Accept: "application/json" },
        cache: "default"
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) return null;
      return payload.snapshot || payload.data?.snapshot || null;
    } catch (err) {
      console.warn("[Vercel] fetch cached public snapshot failed:", err);
      return null;
    }
  }

  async function fetchPublicSnapshot(slug, options = {}) {
    const cached = await fetchCachedPublicSnapshot(slug);
    if (cached) return cached;
    if (!options.directFallback && !isDirectPublicSnapshotFallbackEnabled()) return null;

    const supabaseClient = getClient();
    if (!supabaseClient || !slug) return null;

    try {
      const { data, error } = await supabaseClient
        .from("leaderboard_public_snapshots")
        .select("payload")
        .eq("share_slug", slug)
        .eq("is_public", true)
        .maybeSingle();
      if (error) throw error;
      return data?.payload || null;
    } catch (err) {
      console.warn("[Supabase] fetch snapshot failed:", err);
      return null;
    }
  }

  async function loadTourSystemSubmissions(tournamentId) {
    const supabaseClient = getClient();
    if (!supabaseClient || !tournamentId) return [];

    try {
      const { data, error } = await supabaseClient
        .from("leaderboard_toursystem_submissions")
        .select("*")
        .eq("tournament_id", tournamentId)
        .order("submitted_at", { ascending: false });
      if (error) throw error;
      return data || [];
    } catch (err) {
      console.warn("[Supabase] load TourSystem submissions failed:", err);
      return [];
    }
  }

  async function listActiveOperatorTournaments() {
    return callLeaderboardBridgeOrFallback("listActiveOperatorTournaments", {}, async () => {
      const supabaseClient = getClient();
      if (!supabaseClient) return [];

      try {
        const { data, error } = await supabaseClient.rpc("list_active_operator_tournaments");
        if (error) throw error;
        return Array.isArray(data) ? data : [];
      } catch (err) {
        console.warn("[Supabase] list operator tournaments failed:", err);
        return [];
      }
    }).then(result => Array.isArray(result?.rows) ? result.rows : Array.isArray(result) ? result : []);
  }

  async function validateOperatorTournament(operatorTournamentId, privateCode) {
    return callLeaderboardBridgeOrFallback("validateOperatorTournament", {
      operatorTournamentId,
      privateCode
    }, async () => {
      const supabaseClient = getClient();
      if (!supabaseClient) return { ok: false, error: "supabase_not_configured" };

      try {
        const { data, error } = await supabaseClient.rpc("validate_operator_tournament_code", {
          p_operator_tournament_id: operatorTournamentId,
          p_private_code: privateCode
        });
        if (error) throw error;
        const row = Array.isArray(data) ? data[0] : data;
        return row ? { ok: true, tournament: row } : { ok: false, error: "not_found" };
      } catch (err) {
        return { ok: false, error: err.message };
      }
    }).catch(err => ({ ok: false, error: err.message }));
  }

  async function publishOperatorSnapshot(operatorTournamentId, privateCode, snapshot) {
    if (simulatorWriteBlocked()) return localOnlyResult();
    return callLeaderboardBridgeOrFallback("publishOperatorSnapshot", {
      operatorTournamentId,
      privateCode,
      snapshot
    }, async () => {
      const supabaseClient = getClient();
      if (!supabaseClient) return { ok: false, reason: "local_only" };

      try {
        const { data, error } = await supabaseClient.rpc("upsert_operator_leaderboard_snapshot", {
          p_operator_tournament_id: operatorTournamentId,
          p_private_code: privateCode,
          p_snapshot: snapshot
        });
        if (error) throw error;
        const row = Array.isArray(data) ? data[0] : data;
        const shareSlug = row?.share_slug || snapshot?.shareSlug || "";
        const revalidated = await revalidatePublicState(shareSlug, {
          operatorTournamentId,
          tournamentId: row?.leaderboard_tournament_id || snapshot?.tournament?.id || ""
        });
        return { ok: true, data: row || null, revalidated };
      } catch (err) {
        console.warn("[Supabase] publish operator snapshot failed:", err);
        return { ok: false, reason: err.message };
      }
    }).catch(err => ({ ok: false, reason: err.message }));
  }

  async function loadOperatorTournamentScoresWithStatus(operatorTournamentId, privateCode) {
    return callLeaderboardBridgeOrFallback("loadOperatorTournamentScores", {
      operatorTournamentId,
      privateCode
    }, async () => {
      const supabaseClient = getClient();
      if (!supabaseClient || !operatorTournamentId || !privateCode) {
        return { ok: false, rows: [], reason: "missing_config" };
      }

      try {
        const { data, error } = await supabaseClient.rpc("list_operator_tournament_scores", {
          p_operator_tournament_id: operatorTournamentId,
          p_private_code: privateCode
        });
        if (error) throw error;
        return { ok: true, rows: Array.isArray(data) ? data : [] };
      } catch (err) {
        console.warn("[Supabase] load operator tournament scores failed:", err);
        return { ok: false, rows: [], reason: err.message };
      }
    }).catch(err => ({ ok: false, rows: [], reason: err.message }));
  }

  function isMissingOperatorScoreChangesRpc(error) {
    const code = String(error?.code || "").toUpperCase();
    const message = String(error?.message || error || "").toLowerCase();
    return code === "PGRST202"
      || code === "42883"
      || message.includes("list_operator_tournament_score_changes")
        && (message.includes("not found") || message.includes("does not exist"));
  }

  async function loadOperatorTournamentScoreChangesWithStatus(
    operatorTournamentId,
    privateCode,
    afterChangeSeq = 0
  ) {
    try {
      const result = await callLeaderboardBridge("loadOperatorTournamentScoreChanges", {
        operatorTournamentId,
        privateCode,
        afterChangeSeq,
        limit: 500
      });
      if (result) {
        return {
          ok: true,
          rows: Array.isArray(result.rows) ? result.rows : [],
          cursor: Math.max(0, Number.parseInt(result.cursor, 10) || 0),
          incremental: true,
          baseline: Number(afterChangeSeq || 0) === 0
        };
      }
    } catch (err) {
      if (!isDirectOperatorBridgeFallbackEnabled()) {
        console.warn("[TS36 Bridge] load operator tournament score changes failed:", err);
        return {
          ok: false,
          rows: [],
          cursor: Math.max(0, Number.parseInt(afterChangeSeq, 10) || 0),
          reason: err.message
        };
      }
      console.warn("[TS36 Bridge] proxy failed, falling back to direct Supabase:", err);
    }

    const supabaseClient = getClient();
    if (!supabaseClient || !operatorTournamentId || !privateCode) {
      return { ok: false, rows: [], reason: "missing_config" };
    }

    const pageSize = 500;
    const initialCursor = Math.max(0, Number.parseInt(afterChangeSeq, 10) || 0);
    let cursor = initialCursor;
    const rows = [];

    try {
      for (let page = 0; page < 100; page += 1) {
        const { data, error } = await supabaseClient.rpc("list_operator_tournament_score_changes", {
          p_operator_tournament_id: operatorTournamentId,
          p_private_code: privateCode,
          p_after_change_seq: cursor,
          p_limit: pageSize
        });
        if (error) {
          if (isMissingOperatorScoreChangesRpc(error)) {
            return {
              ok: false,
              rows: [],
              cursor: initialCursor,
              unsupported: true,
              reason: error.message || "incremental_rpc_unavailable"
            };
          }
          throw error;
        }

        const batch = Array.isArray(data) ? data : [];
        rows.push(...batch);
        if (!batch.length) break;

        const nextCursor = batch.reduce((max, row) => {
          const value = Math.max(0, Number.parseInt(row.change_seq, 10) || 0);
          return Math.max(max, value);
        }, cursor);
        if (nextCursor <= cursor) throw new Error("operator_score_change_cursor_stalled");
        cursor = nextCursor;
        if (batch.length < pageSize) break;
        if (page === 99) throw new Error("operator_score_change_page_limit");
      }

      return {
        ok: true,
        rows,
        cursor,
        incremental: true,
        baseline: initialCursor === 0
      };
    } catch (err) {
      console.warn("[Supabase] load operator tournament score changes failed:", err);
      return {
        ok: false,
        rows: [],
        cursor: initialCursor,
        reason: err.message
      };
    }
  }

  async function loadOperatorTournamentScores(operatorTournamentId, privateCode) {
    const result = await loadOperatorTournamentScoresWithStatus(operatorTournamentId, privateCode);
    return result.rows;
  }

  async function loadOperatorTournamentParticipants(operatorTournamentId, privateCode) {
    return callLeaderboardBridgeOrFallback("loadOperatorTournamentParticipants", {
      operatorTournamentId,
      privateCode
    }, async () => {
      const supabaseClient = getClient();
      if (!supabaseClient || !operatorTournamentId || !privateCode) return [];

      try {
        const { data, error } = await supabaseClient.rpc("list_operator_tournament_participants", {
          p_operator_tournament_id: operatorTournamentId,
          p_private_code: privateCode
        });
        if (error) throw error;
        return Array.isArray(data) ? data : [];
      } catch (err) {
        console.warn("[Supabase] load operator tournament participants failed:", err);
        return [];
      }
    }).then(result => Array.isArray(result?.rows) ? result.rows : Array.isArray(result) ? result : []);
  }

  async function resetOperatorTournamentSuggestedMatches(operatorTournamentId, privateCode) {
    if (simulatorWriteBlocked()) return localOnlyResult();
    return callLeaderboardBridgeOrFallback("resetOperatorTournamentSuggestedMatches", {
      operatorTournamentId,
      privateCode
    }, async () => {
      const supabaseClient = getClient();
      if (!supabaseClient || !operatorTournamentId || !privateCode) {
        return { ok: false, reason: "missing_config" };
      }

      try {
        const { data, error } = await supabaseClient.rpc("reset_operator_tournament_suggested_matches", {
          p_operator_tournament_id: operatorTournamentId,
          p_private_code: privateCode
        });
        if (error) throw error;
        const row = Array.isArray(data) ? data[0] : data;
        return { ok: true, data: row || null };
      } catch (err) {
        console.warn("[Supabase] reset operator suggested matches failed:", err);
        return { ok: false, reason: err.message };
      }
    }).catch(err => ({ ok: false, reason: err.message }));
  }

  async function acceptOperatorTournamentSuggestedMatch(operatorTournamentId, privateCode, tourSystemUserId, leaderboardPlayerId) {
    if (simulatorWriteBlocked()) return localOnlyResult();
    return callLeaderboardBridgeOrFallback("acceptOperatorTournamentSuggestedMatch", {
      operatorTournamentId,
      privateCode,
      tourSystemUserId,
      leaderboardPlayerId
    }, async () => {
      const supabaseClient = getClient();
      if (!supabaseClient || !operatorTournamentId || !privateCode || !tourSystemUserId || !leaderboardPlayerId) {
        return { ok: false, reason: "missing_config" };
      }

      try {
        const { data, error } = await supabaseClient.rpc("accept_operator_tournament_suggested_match", {
          p_operator_tournament_id: operatorTournamentId,
          p_private_code: privateCode,
          p_toursystem_user_id: tourSystemUserId,
          p_leaderboard_player_id: leaderboardPlayerId
        });
        if (error) throw error;
        const row = Array.isArray(data) ? data[0] : data;
        return { ok: true, data: row || null };
      } catch (err) {
        console.warn("[Supabase] accept operator suggested match failed:", err);
        return { ok: false, reason: err.message };
      }
    }).catch(err => ({ ok: false, reason: err.message }));
  }

  async function requestLeaderboardSyncUnlock(tournamentId, sourceOcrUnlocked) {
    if (simulatorWriteBlocked()) return { ok: false, blocked: true, error: "simulator_local_only" };
    const supabaseClient = getClient();
    if (!supabaseClient) {
      return { ok: false, error: "supabase_not_configured" };
    }

    try {
      const { data, error } = await supabaseClient.functions.invoke("leaderboard-sync-unlock", {
        body: {
          tournamentId,
          sourceOcrUnlocked: !!sourceOcrUnlocked
        }
      });
      if (error) throw error;
      return { ok: true, data };
    } catch (err) {
      return { ok: false, error: err.message };
    }
  }

  window.LB.supabaseBridge = {
    getClient,
    checkConnection,
    publishSnapshot,
    fetchPublicSnapshot,
    fetchCachedPublicSnapshot,
    getPublicSnapshotPollMs,
    loadTourSystemSubmissions,
    listActiveOperatorTournaments,
    validateOperatorTournament,
    revalidatePublicState,
    publishOperatorSnapshot,
    loadOperatorTournamentScoreChangesWithStatus,
    loadOperatorTournamentScoresWithStatus,
    loadOperatorTournamentScores,
    loadOperatorTournamentParticipants,
    resetOperatorTournamentSuggestedMatches,
    acceptOperatorTournamentSuggestedMatch,
    requestLeaderboardSyncUnlock
  };
})();
