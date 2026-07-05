(function () {
  let activeDivision = "";
  let latestSnapshot = null;
  let refreshTimer = null;

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

  function stripAccents(value = "") {
    return cleanText(value).normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  }

  function keyText(value = "") {
    return stripAccents(value).toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  }

  function formatDivisionLabel(value = "") {
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

  async function init() {
    window.LB.storage.initTheme("share-theme-toggle");
    const slug = new URLSearchParams(window.location.search).get("t") || "";
    if (!slug) {
      renderMissing("Thiếu mã tournament trên link live.");
      return;
    }

    let snapshot = window.LB.storage.getSnapshot(slug);
    if (snapshot) window.LB.storage.publishLanSnapshot(snapshot);
    if (!snapshot) snapshot = await window.LB.storage.fetchLanSnapshot(slug);
    if (!snapshot) snapshot = await window.LB.supabaseBridge.fetchPublicSnapshot(slug);
    if (!snapshot) {
      renderMissing("Chưa tìm thấy public snapshot. Chờ GO link tournament và auto-publish điểm confirmed.");
      return;
    }

    latestSnapshot = snapshot;
    renderSnapshot(snapshot);
    document.getElementById("share-root")?.addEventListener("click", event => {
      const target = event.target.closest("[data-share-division]");
      if (!target) return;
      const nextDivision = target.dataset.shareDivision || "";
      activeDivision = activeDivision === nextDivision ? "" : nextDivision;
      renderSnapshot(latestSnapshot || snapshot);
    });
    startCdnSnapshotPolling(slug);
  }

  function getSnapshotSignature(snapshot) {
    return JSON.stringify([
      snapshot?.tournament?.updatedAt || "",
      snapshot?.leaderboard?.length || 0,
      snapshot?.metrics || {},
      snapshot?.divisionLeaderboards?.map(item => [
        item.division,
        item.scoringMode || "",
        item.isSystem36Division === true,
        item.rows?.length || 0
      ]) || []
    ]);
  }

  function getSnapshotPublicRefreshMs(snapshot) {
    const simulatorRefreshMs = Number(snapshot?.sync?.simulatorRefreshMs || snapshot?.simulator?.debugRefreshMs);
    if (Number.isFinite(simulatorRefreshMs) && simulatorRefreshMs >= 1000) {
      return Math.min(300000, Math.trunc(simulatorRefreshMs));
    }
    const value = Number(
      snapshot?.sync?.publicRefreshMs ||
      snapshot?.sync?.publicPollMs ||
      snapshot?.sync?.snapshotAutoPublishMs ||
      (window.LB.supabaseBridge.getPublicSnapshotPollMs
        ? window.LB.supabaseBridge.getPublicSnapshotPollMs()
        : 300000)
    );
    return Number.isFinite(value) && value >= 5000 ? Math.min(300000, Math.trunc(value)) : 300000;
  }

  function startCdnSnapshotPolling(slug) {
    const refresh = async () => {
      const nextSnapshot = await window.LB.storage.fetchLanSnapshot(slug)
        || await window.LB.supabaseBridge.fetchPublicSnapshot(slug);
      if (!nextSnapshot) {
        refreshTimer = setTimeout(refresh, getSnapshotPublicRefreshMs(latestSnapshot));
        return;
      }
      const before = getSnapshotSignature(latestSnapshot);
      const after = getSnapshotSignature(nextSnapshot);
      latestSnapshot = nextSnapshot;
      if (before !== after) renderSnapshot(latestSnapshot);
      refreshTimer = setTimeout(refresh, getSnapshotPublicRefreshMs(latestSnapshot));
    };
    clearTimeout(refreshTimer);
    refreshTimer = setTimeout(refresh, getSnapshotPublicRefreshMs(latestSnapshot));
  }

  function renderMissing(message) {
    const root = document.getElementById("share-root");
    if (root) root.innerHTML = `<div class="empty-state">${escapeHtml(message)}</div>`;
  }

  function renderSnapshot(snapshot) {
    document.getElementById("share-title").textContent = snapshot.tournament?.name || "Leaderboard Pro";
    document.getElementById("share-meta").textContent = [
      snapshot.tournament?.courseName,
      snapshot.tournament?.operatorName,
      snapshot.tournament?.updatedAt ? `Cập nhật ${new Date(snapshot.tournament.updatedAt).toLocaleTimeString("vi-VN")}` : ""
    ].filter(Boolean).join(" · ");

    const root = document.getElementById("share-root");
    if (!root) return;
    const rows = snapshot.leaderboard || [];
    const divisionRows = Array.isArray(snapshot.divisionLeaderboards) ? snapshot.divisionLeaderboards : [];
    const divisions = divisionRows.length
      ? divisionRows.map(item => item.division).filter(Boolean)
      : Array.from(new Set(rows.map(row => row.division || row.flight).filter(Boolean)));
    if (activeDivision && !divisions.includes(activeDivision)) activeDivision = "";
    const visibleRows = activeDivision
      ? (divisionRows.find(item => item.division === activeDivision)?.rows || rows.filter(row => (row.division || row.flight) === activeDivision))
      : rows;
    const courseHoles = Array.isArray(snapshot.course?.holes) ? snapshot.course.holes : [];
    const getPar = hole => courseHoles.find(item => Number(item.hole) === hole)?.par || 4;
    if (!visibleRows.length) {
      renderMissing("Leaderboard chưa có điểm confirmed.");
      return;
    }

    const previousRows = captureLeaderboardRowPositions(root);
    root.innerHTML = `
      ${divisions.length ? `
        <div class="leaderboard-tabs" role="tablist" aria-label="Bảng đấu leaderboard">
          ${divisions.map(division => `
            <button type="button" class="${division === activeDivision ? "active" : ""}" data-share-division="${escapeHtml(division)}">${escapeHtml(formatDivisionLabel(division))}</button>
          `).join("")}
        </div>
      ` : ""}
      <table class="leaderboard-table">
        <thead>
          <tr>
            <th>#</th>
            <th>Golfer</th>
            <th>Holes</th>
            <th>Gross</th>
            <th>Net</th>
            <th>+/-</th>
            <th>Scores</th>
          </tr>
        </thead>
        <tbody>
          ${visibleRows.map(row => `
            <tr data-leaderboard-row data-row-key="${escapeHtml(getLeaderboardRowKey(row))}" data-rank="${row.rank}">
              <td class="leaderboard-rank">${row.rank}</td>
              <td class="leaderboard-name"><strong>${escapeHtml(row.name)}</strong><small>${escapeHtml(formatDivisionLabel(row.division || row.flight) || "Chưa có bảng")}</small></td>
              <td>${row.holesPlayed}/18</td>
              <td>${row.gross || "-"}</td>
              <td>${Number.isFinite(row.net) ? String(row.net).replace(/\\.0$/, "") : "-"}</td>
              <td>${Number.isFinite(row.toPar) ? window.LB.scoring.formatDiff(row.toPar) : "-"}</td>
              <td><div class="leaderboard-score-strip">${Array.from({ length: 18 }, (_, index) => {
                const hole = index + 1;
                const score = row.holeScores?.[hole];
                return `<span class="${score ? "is-filled" : ""}"><small>H${hole} P${getPar(hole)}</small><b>${score || "-"}</b></span>`;
              }).join("")}</div></td>
            </tr>
          `).join("")}
        </tbody>
      </table>
    `;
    animateLeaderboardRows(root, previousRows);
  }

  function getLeaderboardRowKey(row = {}) {
    return cleanText(row.playerId || row.golferId || row.vgaId || row.name || "");
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

  document.addEventListener("DOMContentLoaded", init);
})();
