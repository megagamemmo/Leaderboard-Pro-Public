(function () {
  const runtimeMode = String(window.ENV?.LB_RUNTIME_MODE || "local").toLowerCase();
  if (!window.LB) return;

  const originalStorage = {
    saveState: window.LB.storage.saveState,
    loadState: window.LB.storage.loadState
  };
  const initialRuntimeState = window.LB.storage.clone(window.LB.state);

  if (runtimeMode !== "cloud") {
    window.LB.runtimeAdapter = {
      mode: "local",
      getAccessToken: async () => "",
      onLinkedTournament: async () => {}
    };
    return;
  }

  localStorage.removeItem(window.LB.STORAGE_KEYS.APP_STATE);

  const AUTH_STORAGE_KEY = String(window.ENV?.AUTH_STORAGE_KEY || "lbpro_operator_auth");
  const PRIVATE_CODE_KEY = "lbpro_cloud_private_code";
  const INSTANCE_ID_KEY = "lbpro_cloud_instance_id";
  const AUTH_DOMAIN = String(window.ENV?.LB_CLOUD_AUTH_DOMAIN || "operator.system36.app");
  const clientKind = String(window.ENV?.LB_RUNTIME_CLIENT || "web");
  const isAuthParent = new URLSearchParams(window.location.search).get("auth") === "parent";
  const instanceId = localStorage.getItem(INSTANCE_ID_KEY) || (
    window.crypto?.randomUUID?.() || `lb-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`
  );
  localStorage.setItem(INSTANCE_ID_KEY, instanceId);

  let supabaseClient = null;
  let privateCode = sessionStorage.getItem(PRIVATE_CODE_KEY) || "";
  let workspaceVersion = 0;
  let saveTimer = null;
  let saveInFlight = false;
  let saveQueued = false;
  let hydrating = false;
  let runtimeReady = false;
  let readOnly = false;
  let leaseToken = "";
  let workspacePollTimer = null;
  let lastSavedSignature = "";
  let saveRetryDelayMs = 1000;
  let pendingSaveSignature = "";
  let pendingSaveIdempotencyKey = "";

  function ensureCloudRosterImportEndpoint() {
    const env = window.ENV || {};
    if (!env.GOOGLE_AI_STUDIO_ENDPOINT && env.SUPABASE_URL) {
      env.GOOGLE_AI_STUDIO_ENDPOINT = `${String(env.SUPABASE_URL).replace(/\/+$/, "")}/functions/v1/leaderboard-roster-import`;
    }
    env.GEMINI_SCORECARD_ENDPOINT = env.GEMINI_SCORECARD_ENDPOINT || "/api/gemini-scorecard-ocr";
    env.GOOGLE_AI_STUDIO_API_KEY = "";
    window.ENV = env;
  }

  ensureCloudRosterImportEndpoint();

  function getClient() {
    if (supabaseClient) return supabaseClient;
    if (!window.supabase || !window.ENV?.SUPABASE_URL || !window.ENV?.SUPABASE_ANON_KEY) return null;
    supabaseClient = window.supabase.createClient(
      window.ENV.SUPABASE_URL,
      window.ENV.SUPABASE_ANON_KEY,
      {
        auth: {
          autoRefreshToken: true,
          persistSession: true,
          detectSessionInUrl: false,
          storageKey: AUTH_STORAGE_KEY
        }
      }
    );
    return supabaseClient;
  }

  function normalizeUsername(value) {
    return String(value || "").trim().toLowerCase().replace(/[^a-z0-9_-]/g, "");
  }

  function usernameToEmail(username) {
    return `${normalizeUsername(username)}@${AUTH_DOMAIN}`;
  }

  function normalizeOperatorPassword(value) {
    return String(value || "").trim().toUpperCase();
  }

  function waitForApp() {
    if (window.LB.app?.render) return Promise.resolve();
    return new Promise(resolve => {
      const timer = window.setInterval(() => {
        if (!window.LB.app?.render) return;
        window.clearInterval(timer);
        resolve();
      }, 25);
    });
  }

  function injectRuntimeStyles() {
    if (document.getElementById("lb-cloud-runtime-styles")) return;
    const style = document.createElement("style");
    style.id = "lb-cloud-runtime-styles";
    style.textContent = `
      .lb-cloud-auth-overlay{position:fixed;inset:0;z-index:10000;display:grid;place-items:center;padding:20px;background:rgba(9,9,11,.96);backdrop-filter:blur(18px)}
      .lb-cloud-auth-card{width:min(440px,100%);padding:26px;border:1px solid #2a2a2f;border-radius:22px;background:#18181b;box-shadow:0 30px 80px rgba(0,0,0,.55)}
      .lb-cloud-auth-card h1{margin:6px 0 8px}.lb-cloud-auth-card p{color:#a1a1aa}.lb-cloud-auth-card form{display:grid;gap:14px;margin-top:22px}
      .lb-cloud-auth-card label{display:grid;gap:7px;color:#d4d4d8}.lb-cloud-auth-card input{min-height:46px;padding:0 13px;border:1px solid #3f3f46;border-radius:10px;background:#09090b;color:#fff;font:inherit}
      .lb-cloud-password-field{display:grid;grid-template-columns:1fr 46px;align-items:stretch}.lb-cloud-password-field input{border-radius:10px 0 0 10px}
      .lb-cloud-password-toggle{min-height:46px!important;border:1px solid #3f3f46!important;border-left:0!important;border-radius:0 10px 10px 0!important;background:#27272a!important;color:#f4f4f5!important;font-size:1rem!important;font-weight:700!important}
      .lb-cloud-auth-card button{min-height:46px;border:0;border-radius:10px;background:#3b6df6;color:#0f172a;font-weight:800;cursor:pointer}
      .lb-cloud-auth-error{min-height:22px;color:#fca5a5}.lb-cloud-runtime-bar{position:sticky;top:0;z-index:9999;display:flex;justify-content:space-between;gap:12px;align-items:center;padding:8px 16px;background:#0f172a;color:#d1fae5;font-size:.82rem}
      .lb-cloud-runtime-bar button{border:1px solid rgba(255,255,255,.28);border-radius:8px;padding:6px 10px;background:transparent;color:inherit}
      body.runtime-read-only main,body.runtime-read-only .app-topbar{filter:saturate(.65);opacity:.78}
      body.runtime-read-only main input,body.runtime-read-only main select,body.runtime-read-only main textarea,body.runtime-read-only main button{pointer-events:none}
      body[data-runtime-mode="cloud"] [data-action="new-tournament"],body[data-runtime-mode="cloud"] .operator-link-panel{display:none!important}
      body[data-runtime-mode="cloud"] #view-settings label:has(#settings-local-ocr-endpoint),
      body[data-runtime-mode="cloud"] #view-settings label:has(#settings-gemini-model),
      body[data-runtime-mode="cloud"] #view-settings label:has(#settings-gemini-key),
      body[data-runtime-mode="cloud"] #view-settings .form-split,
      body[data-runtime-mode="cloud"] #view-settings .settings-toggle,
      body[data-runtime-mode="cloud"] #settings-paddle-status,
      body[data-runtime-mode="cloud"] #settings-gemini-key-preview,
      body[data-runtime-mode="cloud"] #view-settings #settings-form>.panel-title,
      body[data-runtime-mode="cloud"] #view-settings #settings-form>.form-actions,
      body[data-runtime-mode="cloud"] #view-settings .settings-grid>article,
      body[data-runtime-mode="cloud"] #settings-config-path,
      body[data-runtime-mode="cloud"] #settings-key-state,
      body[data-runtime-mode="cloud"] #settings-paddle-state,
      body[data-runtime-mode="cloud"] #settings-service-state{display:none!important}
      body[data-runtime-mode="cloud"] .roster-import-controls.is-cloud-roster-import{grid-template-columns:minmax(220px,1fr) auto}
      @media(max-width:760px){.topbar-tabs{overflow-x:auto}.app-shell{padding:12px}.dashboard-grid{display:block}.summary-panel{margin-top:12px}.lb-cloud-runtime-bar{position:relative}}
      body.has-runtime-bar .app-topbar{top:38px}
      @media(max-width:760px){body.has-runtime-bar .app-topbar{top:0}}
      @media(max-width:760px){body[data-runtime-mode="cloud"] .roster-import-controls.is-cloud-roster-import{grid-template-columns:1fr}body[data-runtime-mode="cloud"] .roster-import-controls.is-cloud-roster-import .roster-import-actions{grid-column:auto}}
    `;
    document.head.appendChild(style);
  }

  function applyMode3Interface() {
    document.body.classList.add("mode3-fixed-tournament");

    const settingsTitle = document.getElementById("settings-title");
    if (settingsTitle) settingsTitle.textContent = "Cấu hình Mode 3";
    const settingsEyebrow = document.querySelector("#view-settings .eyebrow");
    if (settingsEyebrow) settingsEyebrow.textContent = "Mode 3";
    const configState = document.getElementById("settings-config-state");
    if (configState) configState.textContent = "Cloud runtime";
  }

  function setRuntimeBar(message, tone = "ok") {
    let bar = document.getElementById("lb-cloud-runtime-bar");
    if (!bar) {
      bar = document.createElement("div");
      bar.id = "lb-cloud-runtime-bar";
      bar.className = "lb-cloud-runtime-bar";
      bar.innerHTML = `<span data-runtime-message></span><button type="button" data-runtime-signout>Đăng xuất</button>`;
      document.body.prepend(bar);
      document.body.classList.add('has-runtime-bar');
      bar.querySelector("[data-runtime-signout]")?.addEventListener("click", signOut);
    }
    bar.dataset.tone = tone;
    const label = bar.querySelector("[data-runtime-message]");
    if (label) label.textContent = message;
  }

  function setReadOnly(nextReadOnly, message = "") {
    readOnly = Boolean(nextReadOnly);
    document.body.classList.toggle("runtime-read-only", readOnly);
    document.querySelectorAll("main, .app-topbar").forEach(element => {
      if (readOnly) {
        element.setAttribute("inert", "");
        element.setAttribute("aria-disabled", "true");
      } else {
        element.removeAttribute("inert");
        element.removeAttribute("aria-disabled");
      }
    });
    if (message) setRuntimeBar(message, readOnly ? "warning" : "ok");
  }

  function handleAuthRequired(message = "") {
    clearCachedWorkspace();
    if (isAuthParent) {
      window.parent.postMessage({ type: "lb-cloud-auth-required", message }, "*");
    } else {
      createAuthOverlay();
    }
  }

  function createAuthOverlay() {
    let overlay = document.getElementById("lb-cloud-auth-overlay");
    if (overlay) return overlay;
    overlay = document.createElement("div");
    overlay.id = "lb-cloud-auth-overlay";
    overlay.className = "lb-cloud-auth-overlay";
    overlay.innerHTML = `
      <section class="lb-cloud-auth-card">
        <span>Leaderboard Pro · Điều hành linh động</span>
        <h1>Vào bàn điều hành</h1>
        <p>Đăng nhập tài khoản của giải và nhập private code do Admin TourSystem36 cấp.</p>
        <form>
          <label>Tài khoản<input name="username" autocomplete="username" placeholder="VD: goec2a" required></label>
          <label>Mật khẩu
            <span class="lb-cloud-password-field">
              <input name="password" type="password" autocomplete="current-password" placeholder="VD: AB1234" required>
              <button type="button" class="lb-cloud-password-toggle" data-password-toggle aria-label="Hiện mật khẩu" title="Hiện mật khẩu">👁</button>
            </span>
          </label>
          <label>Private code<input name="privateCode" inputmode="numeric" maxlength="4" pattern="[0-9]{4}" required></label>
          <button type="submit">Vào giải</button>
          <div class="lb-cloud-auth-error" role="alert"></div>
        </form>
      </section>
    `;
    document.body.appendChild(overlay);
    overlay.querySelector("form")?.addEventListener("submit", handleLogin);
    overlay.querySelector("[data-password-toggle]")?.addEventListener("click", togglePasswordVisibility);
    return overlay;
  }

  function togglePasswordVisibility(event) {
    const button = event.currentTarget;
    const input = button?.parentElement?.querySelector('input[name="password"]');
    if (!input) return;
    const shouldShow = input.type === "password";
    input.type = shouldShow ? "text" : "password";
    button.setAttribute("aria-label", shouldShow ? "Ẩn mật khẩu" : "Hiện mật khẩu");
    button.setAttribute("title", shouldShow ? "Ẩn mật khẩu" : "Hiện mật khẩu");
  }

  function clearCachedWorkspace() {
    localStorage.removeItem(window.LB.STORAGE_KEYS.APP_STATE);
    if (!window.LB.app?.render) return;
    hydrating = true;
    try {
      window.LB.state = window.LB.storage.clone(initialRuntimeState);
      localStorage.removeItem(window.LB.STORAGE_KEYS.APP_STATE);
      window.LB.app.render();
    } finally {
      hydrating = false;
    }
  }

  function getWorkspaceSignature(payload) {
    try {
      return JSON.stringify(payload || {});
    } catch {
      return "";
    }
  }

  function buildWorkspacePayload() {
    const payload = window.LB.storage.clone(window.LB.state);
    delete payload.simulator;
    delete payload.simulator2;
    return payload;
  }

  function normalizeWorkspaceRow(value) {
    return Array.isArray(value) ? value[0] || null : value || null;
  }

  async function openWorkspace(code = privateCode) {
    const client = getClient();
    if (!client) throw new Error("Supabase chưa được cấu hình.");
    const cleanCode = String(code || "").replace(/\D/g, "").slice(0, 4);
    if (!/^\d{4}$/.test(cleanCode)) throw new Error("Private code phải có 4 số.");

    const { data, error } = await client.rpc("open_operator_tournament_workspace", {
      p_private_code: cleanCode,
      p_client_instance_id: instanceId
    });
    if (error) throw error;
    const row = normalizeWorkspaceRow(data);
    if (!row) throw new Error("Không mở được workspace của giải.");
    privateCode = cleanCode;
    sessionStorage.setItem(PRIVATE_CODE_KEY, cleanCode);
    return row;
  }

  async function acquireLocalFallbackLease() {
    if (clientKind !== "local-fallback") return null;
    const client = getClient();
    const { data, error } = await client.rpc("acquire_operator_tournament_management_lease", {
      p_private_code: privateCode,
      p_client_instance_id: instanceId,
      p_ttl_seconds: 180
    });
    if (error) throw error;
    const row = normalizeWorkspaceRow(data);
    if (!row?.acquired) throw new Error("Bản web hoặc một máy local khác đang giữ quyền điều hành.");
    leaseToken = row.lease_token || "";
    return row;
  }

  async function applyWorkspace(row) {
    await waitForApp();
    hydrating = true;
    try {
      const payload = row.workspace_payload && typeof row.workspace_payload === "object"
        ? row.workspace_payload
        : {};
      if (payload.tournament) {
        localStorage.setItem(window.LB.STORAGE_KEYS.APP_STATE, JSON.stringify(payload));
        originalStorage.loadState();
      } else {
        window.LB.state = window.LB.storage.clone(initialRuntimeState);
      }

      const tournament = {
        id: row.operator_tournament_id,
        title: row.title,
        course_id: row.course_id,
        course_name: row.course_name,
        course_snapshot: row.course_snapshot,
        operator_name: row.operator_name,
        management_mode: "flexible",
        leaderboard_tournament_id: row.leaderboard_tournament_id,
        share_slug: row.share_slug,
        flight_config: row.flight_config
      };
      window.LB.state.operator.privateCode = privateCode;
      window.LB.state.tournament.operatorPrivateCode = privateCode;
      window.LB.app.applyOperatorTournamentToState(tournament);
      workspaceVersion = Number(row.workspace_version) || 0;

      const localLeaseBlocksWeb = Boolean(row.local_lease_active)
        && row.local_lease_holder_instance_id !== instanceId;
      setReadOnly(
        localLeaseBlocksWeb,
        localLeaseBlocksWeb
          ? "Một máy local đang giữ quyền điều hành. Bản web tạm thời chỉ đọc."
          : "Cloud workspace đã kết nối · tự lưu và đồng bộ đa thiết bị"
      );
      originalStorage.saveState();
      window.LB.app.render();
      window.LB.app.finishLinkedTournamentEntry();
      lastSavedSignature = getWorkspaceSignature(buildWorkspacePayload());
      runtimeReady = true;
      if (isAuthParent) {
        window.parent.postMessage({ type: "lb-cloud-runtime-ready" }, "*");
      }
    } finally {
      hydrating = false;
    }
  }

  async function bootstrapWorkspace(code) {
    let row = await openWorkspace(code);
    if (clientKind === "local-fallback") {
      await acquireLocalFallbackLease();
      row = await openWorkspace(code);
    }
    await applyWorkspace(row);
    document.getElementById("lb-cloud-auth-overlay")?.remove();
    startWorkspacePolling();
  }

  async function handleLogin(event) {
    event.preventDefault();
    const form = event.currentTarget;
    const errorBox = form.querySelector(".lb-cloud-auth-error");
    const button = form.querySelector("button[type='submit']");
    const data = new FormData(form);
    const username = normalizeUsername(data.get("username"));
    const password = normalizeOperatorPassword(data.get("password"));
    const code = String(data.get("privateCode") || "");
    if (errorBox) errorBox.textContent = "";
    button.disabled = true;
    button.textContent = "Đang xác thực...";
    try {
      const client = getClient();
      if (!client) {
        throw new Error("Chưa tải được cấu hình Supabase. Vui lòng tải lại trang hoặc báo Admin kiểm tra env-config.js.");
      }
      const { error } = await client.auth.signInWithPassword({
        email: usernameToEmail(username),
        password
      });
      if (error) throw error;
      await bootstrapWorkspace(code);
    } catch (err) {
      if (errorBox) errorBox.textContent = err.message || "Không đăng nhập được.";
    } finally {
      button.disabled = false;
      button.textContent = "Vào giải";
    }
  }

  async function signOut() {
    window.clearInterval(workspacePollTimer);
    if (leaseToken) {
      await getClient()?.rpc("release_operator_tournament_management_lease", {
        p_lease_token: leaseToken,
        p_client_instance_id: instanceId
      }).catch(() => {});
    }
    await getClient()?.auth.signOut({ scope: "local" });
    sessionStorage.removeItem(PRIVATE_CODE_KEY);
    localStorage.removeItem(window.LB.STORAGE_KEYS.APP_STATE);
    window.location.reload();
  }

  function scheduleCloudSave() {
    if (!runtimeReady || hydrating || readOnly) return;
    window.clearTimeout(saveTimer);
    saveTimer = window.setTimeout(saveWorkspace, 700);
  }

  async function saveWorkspace() {
    if (!runtimeReady || hydrating || readOnly) return;
    if (saveInFlight) {
      saveQueued = true;
      return;
    }
    const payload = buildWorkspacePayload();
    const signature = getWorkspaceSignature(payload);
    if (signature === lastSavedSignature) return;
    if (pendingSaveSignature !== signature || !pendingSaveIdempotencyKey) {
      pendingSaveSignature = signature;
      pendingSaveIdempotencyKey = window.crypto?.randomUUID?.() || `${Date.now()}-${Math.random()}`;
    }
    saveInFlight = true;
    try {
      const { data, error } = await getClient().rpc("save_operator_tournament_workspace", {
        p_private_code: privateCode,
        p_payload: payload,
        p_expected_version: workspaceVersion,
        p_idempotency_key: pendingSaveIdempotencyKey,
        p_client_instance_id: instanceId
      });
      if (error) throw error;
      const row = normalizeWorkspaceRow(data);
      if (row?.save_status === "conflict") {
        const serverRow = await openWorkspace(privateCode);
        pendingSaveSignature = "";
        pendingSaveIdempotencyKey = "";
        await applyWorkspace(serverRow);
        setRuntimeBar("Workspace cloud có bản mới hơn · đã tự tải lại");
        return;
      }
      if (row?.save_status === "local_lease_active") {
        setReadOnly(true, "Máy local đã tiếp quản giải. Bản web chuyển sang chỉ đọc.");
        return;
      }
      workspaceVersion = Number(row?.workspace_version) || workspaceVersion;
      lastSavedSignature = signature;
      pendingSaveSignature = "";
      pendingSaveIdempotencyKey = "";
      saveRetryDelayMs = 1000;
      setRuntimeBar("Đã lưu cloud · tự đồng bộ đang bật");
    } catch (err) {
      setRuntimeBar(`Chưa lưu được cloud: ${err.message || "network_error"}`, "warning");
      saveQueued = true;
      saveRetryDelayMs = Math.min(saveRetryDelayMs * 2, 30000);
    } finally {
      saveInFlight = false;
      if (saveQueued) {
        saveQueued = false;
        window.setTimeout(saveWorkspace, saveRetryDelayMs);
      }
    }
  }

  async function refreshWorkspace(force = false) {
    if (!runtimeReady || !privateCode) return;
    try {
      const row = await openWorkspace(privateCode);
      const serverVersion = Number(row.workspace_version) || 0;
      const localLeaseBlocksWeb = Boolean(row.local_lease_active)
        && row.local_lease_holder_instance_id !== instanceId;
      if (localLeaseBlocksWeb) {
        setReadOnly(true, "Một máy local đang giữ quyền điều hành. Bản web tạm thời chỉ đọc.");
      } else if (readOnly) {
        setReadOnly(false, "Cloud workspace đã kết nối · tự lưu và đồng bộ đa thiết bị");
      } else {
        setReadOnly(false);
      }
      if (force || (serverVersion > workspaceVersion && !saveInFlight)) {
        await applyWorkspace(row);
      }
    } catch (err) {
      setRuntimeBar(`Mất kết nối workspace: ${err.message || "network_error"}`, "warning");
    }
  }

  function startWorkspacePolling() {
    window.clearInterval(workspacePollTimer);
    workspacePollTimer = window.setInterval(() => {
      void refreshWorkspace(false);
      if (clientKind === "local-fallback" && leaseToken) void acquireLocalFallbackLease();
    }, 10000);
  }

  async function autoResume() {
    const client = getClient();
    if (!client) {
      handleAuthRequired();
      return;
    }
    const { data } = await client.auth.getSession();
    if (!data.session || !privateCode) {
      handleAuthRequired();
      return;
    }
    try {
      await bootstrapWorkspace(privateCode);
    } catch {
      handleAuthRequired();
    }
  }

  window.LB.storage.saveState = function () {
    originalStorage.saveState();
    scheduleCloudSave();
  };

  window.LB.runtimeAdapter = {
    mode: "cloud",
    getAccessToken: async function () {
      const client = getClient();
      if (!client) return "";
      const { data } = await client.auth.getSession();
      return data?.session?.access_token || "";
    },
    onLinkedTournament: async function () {
      scheduleCloudSave();
    },
    refreshWorkspace,
    signOut
  };

  document.addEventListener("DOMContentLoaded", () => {
    injectRuntimeStyles();
    document.body.dataset.runtimeMode = "cloud";
    applyMode3Interface();
    const scorecardOcrForm = document.getElementById("ocr-form");
    const scorecardFiles = document.getElementById("ocr-files");
    if (scorecardFiles) {
      scorecardFiles.value = "";
      scorecardFiles.accept = "image/png,image/jpeg,image/jpg";
      scorecardFiles.disabled = false;
      scorecardFiles.title = "Mode 3 đọc ảnh scorecard bằng Gemini API key server.";
    }
    const scorecardProvider = document.getElementById("ocr-provider");
    if (scorecardProvider) {
      scorecardProvider.value = "gemini_api";
      Array.from(scorecardProvider.options).forEach(option => {
        option.hidden = option.value !== "gemini_api";
        if (option.value === "gemini_api") option.textContent = "Gemini API key";
      });
      scorecardProvider.disabled = false;
      scorecardProvider.title = "Mode 3 dùng Gemini API key trên server TS36 để đọc scorecard.";
    }
    const scorecardRunButton = scorecardOcrForm?.querySelector('[data-action="run-ocr"]');
    if (scorecardRunButton) {
      scorecardRunButton.disabled = false;
      scorecardRunButton.title = "OCR scorecard bằng Gemini.";
    }
    const scorecardStatus = document.getElementById("ocr-status");
    if (scorecardStatus) {
      scorecardStatus.textContent = "Sẵn sàng đọc scorecard bằng Gemini API key server.";
    }
    const rosterFiles = document.getElementById("roster-ocr-files");
    if (rosterFiles) rosterFiles.accept = ".xlsx,.xlsm,.csv,.tsv";
    const rosterProvider = document.getElementById("roster-ocr-provider");
    const rosterControls = document.querySelector(".roster-import-controls");
    rosterControls?.classList.add("is-cloud-roster-import");
    if (rosterProvider) {
      rosterProvider.value = "google_ai_studio";
      Array.from(rosterProvider.options).forEach(option => {
        option.hidden = option.value !== "google_ai_studio";
        if (option.value === "google_ai_studio") option.textContent = "Excel / CSV LB parser";
      });
      rosterProvider.closest("label")?.setAttribute("hidden", "");
      rosterProvider.closest("label")?.setAttribute("aria-hidden", "true");
      rosterProvider.title = "Mode 3 đọc bảng tính bằng parser đồng bộ với LB local và chỉ dùng AI khi cần nhận diện tên cột.";
    }
    void autoResume();
  });
})();
