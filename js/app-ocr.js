window.LB = window.LB || {};
window.LB.appOcr = (function() {
  const state = () => window.LB.state;

function promptOcrIdentityMatch(row, division, allPlayers) {
    return new Promise(resolve => {
      const modal = document.getElementById("ocr-identity-modal");
      if (!modal) return resolve("NEW");

      document.getElementById("ocr-match-title-name").textContent = row.name;
      const searchInput = document.getElementById("ocr-match-search");
      const listDiv = document.getElementById("ocr-match-list");
      const btnSkip = document.getElementById("ocr-match-btn-skip");
      const btnNew = document.getElementById("ocr-match-btn-new");

      function renderList(query) {
        listDiv.innerHTML = "";
        const q = query.toLowerCase().trim();
        
        let candidates = allPlayers.filter(p => p.status === 'active');
        if (q) {
          candidates = candidates.filter(p => 
            p.name.toLowerCase().includes(q) || 
            (p.vgaId || "").toLowerCase().includes(q) || 
            (p.golferId || "").toLowerCase().includes(q)
          );
        } else {
          candidates.sort((a, b) => {
            const aSame = (a.division === division || a.flight === division) ? 1 : 0;
            const bSame = (b.division === division || b.flight === division) ? 1 : 0;
            return bSame - aSame;
          });
        }
        
        candidates.forEach(p => {
          const btn = document.createElement("button");
          btn.className = "ocr-match-item";
          if (!q && (p.division === division || p.flight === division)) {
            btn.classList.add("match-recommended");
          }
          btn.innerHTML = `
            <span class="ocr-match-item-name">${window.LB.appUtils.escapeHtml(p.name)}</span>
            <span class="ocr-match-item-meta">${window.LB.appUtils.escapeHtml(p.vgaId || p.golferId || "")} • Bảng ${window.LB.appUtils.escapeHtml(p.division || p.flight || "")}</span>
          `;
          btn.onclick = () => closeModal(p.id);
          listDiv.appendChild(btn);
        });
      }
      
      const closeModal = (result) => {
        btnSkip.onclick = null;
        btnNew.onclick = null;
        searchInput.oninput = null;
        modal.close();
        resolve(result);
      };

      btnSkip.onclick = () => closeModal("SKIP");
      btnNew.onclick = () => closeModal("NEW");
      searchInput.oninput = (e) => renderList(e.target.value);
      
      searchInput.value = "";
      renderList("");
      
      modal.showModal();
    });
  }

async function runRosterImportOcr() {
    const provider = window.LB.app?.getRosterOcrProvider?.() || (
      window.LB.appUtils.getCapabilities().cloudRuntime
      ? "google_ai_studio"
      : (document.getElementById("roster-ocr-provider")?.value || "paddle_local")
    );
    const files = document.getElementById("roster-ocr-files")?.files;
    const fileCount = files?.length || 0;
    try {
      const flightConfigState = window.LB.appPlayer.validateFlightConfig();
      const flights = Array.isArray(state().flightConfig?.flights) ? state().flightConfig.flights : [];
      const s36Count = flights.filter(flight => window.LB.appPlayer.isFlightSystem36(flight, false)).length;
      const requiresSystem36 = Boolean(state().operator?.linkedTournament?.id);
      const ready = window.LB.appPlayer.isFlightConfigReadyForRosterImport();
      if (!flightConfigState.ok || !flights.length || (requiresSystem36 && !s36Count) || !ready) {
        const message = window.LB.app?.getRosterImportGateMessage?.({
          flightConfigState,
          hasFlights: !!flights.length,
          requiresSystem36,
          s36Count,
          ready
        }) || (!flightConfigState.ok
          ? flightConfigState.message
          : (!flights.length
              ? "Cần tạo ít nhất 1 bảng trước khi import danh sách."
              : (requiresSystem36 && !s36Count
                  ? "Tournament đã link TS36 cần có ít nhất 1 bảng S36 trước khi import danh sách."
                  : "Hãy bấm Xác nhận bảng trước khi import danh sách.")));
        setRosterOcrBusy(false, message);
        window.LB.appUtils.showView("dashboard");
        // document.querySelector(".flight-config-panel")?.scrollIntoView({ behavior: "smooth", block: "start" });
        alert(`${message}\n\nHãy kiểm tra Cài đặt bảng đấu rồi import lại.`);
        return;
      }
      setRosterOcrBusy(true, `Đang đọc danh sách golfer${fileCount ? ` từ ${fileCount} file` : ""}. Không đóng tab trong lúc xử lý.`);
      const result = await window.LB.ocr.runOcr(files, provider, { task: "participants", context: window.LB.appOcr.buildOcrContext(fileCount) });
      const rows = window.LB.ocr.normalizeParticipants(result);
      const applied = window.LB.ocr.applyParticipantsToState(rows);
      state().imports.unshift({
        id: `imp-${Date.now().toString(36)}`,
        type: "participants",
        rows: rows.length,
        added: applied.added.length,
        updated: applied.updated.length,
        createdAt: new Date().toISOString()
      });
      window.LB.appUtils.renderRosterImportReview(rows, applied);
      window.LB.appUtils.persistAndRender();
      setRosterOcrBusy(false, rows.length ? `Đã import ${rows.length} golfer vào danh sách.` : "Đã đọc file nhưng chưa nhận được golfer nào.");
    } catch (err) {
      setRosterOcrBusy(false, err.message || "Import danh sách golfer bị lỗi.");
      alert(err.message);
    }
  }

function buildOcrContext(fileCount = 1) {
    const cfg = state().flightConfig || {};
    const linkedTournament = state().operator.linkedTournament || {};
    const operatorTournamentId = linkedTournament.id || state().tournament.operatorTournamentId || "";
    const privateCode = state().operator.privateCode || state().tournament.operatorPrivateCode || "";
    return {
      courseName: state().tournament.courseName || "",
      startHole: state().tournament.startHole || 1,
      maxOpponents: Math.max(1, Math.min(20, (fileCount || 1) * 6)),
      allowFlightJump: !!cfg.allowFlightJump,
      flights: Array.isArray(cfg.flights) ? cfg.flights : [],
      leaderboardBridgeAuth: {
        operatorTournamentId,
        privateCode,
        managementMode: linkedTournament.management_mode || linkedTournament.managementMode || state().tournament.managementMode || ""
      },
      holes: Array.from({ length: 18 }, (_, index) => {
        const hole = window.LB.scoring.getHoleConfig(state(), index + 1);
        return { hole: index + 1, par: hole.par, strokeIndex: hole.strokeIndex };
      })
    };
  }

function detectOcrTask(payload, fallback = "scorecards") {
    if (payload?.task === "participants") return "participants";
    if (payload?.task === "scorecards") return "scorecards";
    if (Array.isArray(payload?.participants) && payload.participants.length) return "participants";
    if (Array.isArray(payload?.scorecards) && payload.scorecards.length) return "scorecards";
    return fallback;
  }

function syncOcrTaskUi() {
    const fileInput = document.getElementById("ocr-files");
    const textArea = document.getElementById("ocr-json");
    if (fileInput) {
      fileInput.accept = "image/*,application/pdf";
    }
    if (textArea) {
      textArea.placeholder = '{"scorecards":[{"name":"Nguyen Van A","gross_scores":{"1":5,"2":4}}]}';
    }
    syncOcrFileName([]);
    window.LB.appUtils.syncRosterImportFileName(document.getElementById("roster-ocr-files")?.files);
  }

function renderOcrReview(rows = [], task = "scorecards") {
    const root = document.getElementById("ocr-review-results") || document.getElementById("ocr-review");
    window.LB.appUtils.setText("ocr-review-count", task === "participants" ? `${rows.length} golfer` : `${rows.length} phiếu`);
    if (!root) return;
    if (task === "participants") {
      root.innerHTML = rows.map(row => `
        <article class="ocr-card">
          <strong>${window.LB.appUtils.escapeHtml(row.name)} ${row.handicap !== "" ? `· HCP ${window.LB.appUtils.escapeHtml(row.handicap)}` : ""}</strong>
          <div class="ocr-meta">
            <span>ID ${window.LB.appUtils.escapeHtml(row.vgaId || "CLW tự cấp")}</span>
            ${row.division ? `<span>Bảng ${window.LB.appUtils.escapeHtml(row.division).replace(/^Bảng\s+/i, "")}</span>` : ""}
            ${row.gender ? `<span>${window.LB.appUtils.escapeHtml(window.LB.appPlayer.getGenderLabel(row.gender))}</span>` : ""}
            ${row.flightGroup ? `<span>Flight ${window.LB.appUtils.escapeHtml(row.flightGroup)}</span>` : ""}
            ${row.startHole ? `<span>Hố xuất phát ${window.LB.appUtils.escapeHtml(row.startHole)}</span>` : ""}
            ${row.caddyNumber ? `<span>Caddy ${window.LB.appUtils.escapeHtml(row.caddyNumber)}</span>` : ""}
            ${row.awardEligible === false ? `<span>KO tính giải</span>` : ""}
            ${row.operationNote ? `<span>${window.LB.appUtils.escapeHtml(row.operationNote)}</span>` : ""}
          </div>
          ${window.LB.appUtils.renderWarnings(row)}
        </article>
      `).join("") || `<div class="empty-state">Chưa có dữ liệu golfer staging.</div>`;
      return;
    }

    root.innerHTML = rows.map((row, rowIndex) => {
      let scoreString = Array.from({ length: 18 }, (_, index) => {
        const score = row.grossScores?.[index + 1] ?? row.grossScores?.[String(index + 1)];
        return score !== undefined && score !== null && score !== "" ? score : "x";
      }).join(" ");
      scoreString = scoreString.replace(/^(x\s+)+/, "").replace(/(\s+x)+$/, "");
      return `
      <article class="ocr-card ${row.ocrReviewRequired ? "is-review-required" : ""}" data-ocr-index="${rowIndex}">
        <div class="ocr-card-head">
          <strong>${window.LB.appUtils.escapeHtml(row.name)} ${row.handicap !== "" ? `· HCP ${window.LB.appUtils.escapeHtml(row.handicap)}` : ""}</strong>
          <span>${Object.keys(row.grossScores || {}).length}/18 hố</span>
        </div>
        <div class="ocr-meta">
          <span>ID ${window.LB.appUtils.escapeHtml(row.vgaId || "CLW tự cấp")}</span>
          ${row.division ? `<span>${window.LB.appUtils.escapeHtml(row.division)}</span>` : ""}
          ${row.flightGroup ? `<span>Flight ${window.LB.appUtils.escapeHtml(row.flightGroup)}</span>` : ""}
        </div>
        <div class="ocr-score-grid">
          ${Array.from({ length: 18 }, (_, index) => {
            const hole = index + 1;
            const score = row.grossScores?.[hole] ?? row.grossScores?.[String(hole)] ?? "";
            const reviewCell = row.scoreReviewCells?.[hole] ?? row.scoreReviewCells?.[String(hole)] ?? null;
            const needsReview = !!reviewCell && (
              reviewCell.gross === null
              || Number(reviewCell.confidence) < 0.72
              || !!reviewCell.warning
            );
            const reviewTitle = reviewCell
              ? [
                reviewCell.raw ? `Raw: ${reviewCell.raw}` : "",
                `Confidence: ${Math.round((Number(reviewCell.confidence) || 0) * 100)}%`,
                reviewCell.warning || ""
              ].filter(Boolean).join(" · ")
              : "";
            return `
              <span class="${score === "" ? "is-empty" : ""} ${needsReview ? "is-review-required" : ""}" ${reviewTitle ? `title="${window.LB.appUtils.escapeHtml(reviewTitle)}"` : ""}>
                <small>H${hole}</small>
                <strong>${score === "" ? "-" : window.LB.appUtils.escapeHtml(score)}</strong>
                ${needsReview ? `<em>${Math.round((Number(reviewCell.confidence) || 0) * 100)}% · kiểm tra</em>` : ""}
              </span>
            `;
          }).join("")}
        </div>
        ${window.LB.appUtils.renderWarnings(row)}
        <div class="ocr-review-actions" style="margin-top: 12px; display: flex; gap: 8px; flex-wrap: wrap;">
          <button type="button" class="primary-button outline" onclick="window.LB.ocr.applySingleOcr(${rowIndex})">Nhập Điểm</button>
        </div>
        <div class="ocr-fallback-container" style="margin-top: 12px; padding: 10px; background: var(--surface-card); border: 1px solid var(--border); border-radius: 4px;">
          <div style="font-size: 0.85rem; color: var(--text-dim); margin-bottom: 8px;">Fallback Chuỗi Điểm (Dùng khi AI đọc lệch cột)</div>
          <div style="display: flex; gap: 8px;">
             <input class="ocr-score-string-fallback" data-index="${rowIndex}" type="text" readonly value="${window.LB.appUtils.escapeHtml(scoreString)}" style="flex: 1; font-family: monospace; font-size: 1rem; padding: 6px; border: 1px solid var(--border); border-radius: 4px; background: var(--bg);">
             <button type="button" class="secondary-button" data-action="copy-ocr-fallback" data-index="${rowIndex}">Copy</button>
          </div>
        </div>
      </article>
    `}).join("") || `<div class="empty-state">Chưa có dữ liệu OCR staging.</div>`;

    if (rows.length === 1 && task === "scorecards") {
      setTimeout(() => {
        if (window.LB.ocr?.findGolferForOcr) window.LB.ocr.findGolferForOcr(0);
      }, 100);
    }
  }

function getLocalOcrEndpoint() {
    const configured = String(window.ENV?.LOCAL_OCR_ENDPOINT || "").trim();
    if (configured) return configured;
    const hostname = String(window.location?.hostname || "").toLowerCase();
    const privateIpv4 = /^10\./.test(hostname)
      || /^192\.168\./.test(hostname)
      || (() => {
        const match = hostname.match(/^172\.(\d+)\./);
        return !!match && Number(match[1]) >= 16 && Number(match[1]) <= 31;
      })();
    const localRuntime = window.location?.protocol === "http:"
      && (["localhost", "127.0.0.1", "[::1]", "::1"].includes(hostname) || privateIpv4);
    return localRuntime ? "http://localhost:8866/ocr" : "";
  }

function getOcrConfigUrl() {
    const endpoint = getLocalOcrEndpoint();
    if (!endpoint) return "";
    try {
      const url = new URL(endpoint, window.location.href);
      const path = url.pathname.replace(/\/ocr\/?$/i, "");
      url.pathname = `${path.replace(/\/$/, "")}/config`;
      url.search = "";
      url.hash = "";
      return url.toString();
    } catch (err) {
      return "";
    }
  }

  return { promptOcrIdentityMatch, runRosterImportOcr, buildOcrContext, detectOcrTask, syncOcrTaskUi, renderOcrReview, getLocalOcrEndpoint, getOcrConfigUrl };
})();
