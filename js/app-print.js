window.LB = window.LB || {};
window.LB.appPrint = (function() {
  const state = () => window.LB.state;

function shouldShowTs36PrintColumn() {
    return Boolean(state().operator?.linkedTournament?.id);
  }

function buildPlayerRosterPrintGroups(options = {}) {
    const showTs36Column = options.showTs36Column !== false;
    const colSpan = showTs36Column ? 13 : 12;
    const players = [...(state().players || [])].sort(window.LB.appPlayer.comparePlayersByFlight);
    const groups = window.LB.appPlayer.groupPlayersForPanel(players);
    let index = 0;

    if (!groups.length) {
      return `
        <tbody class="flight-print-group is-empty">
          <tr>
            <td colspan="${colSpan}" class="empty-print">Chưa có golfer trong tournament.</td>
          </tr>
        </tbody>
      `;
    }

    return groups.map(group => {
      const rows = group.players.map(player => {
        const assignment = window.LB.appPlayer.normalizePlayerFlightAssignment(player);
        const division = window.LB.appPlayer.getPlayerDivision(player) || window.LB.appPlayer.getFlightNameForHandicap(player.handicap, player.gender);
        index += 1;
        return `
          <tr>
            <td class="num">${index}</td>
            <td class="name">${window.LB.appUtils.escapeHtml(player.name || "Golfer")}</td>
            <td>${window.LB.appUtils.escapeHtml(window.LB.appPrint.getPlayerPrintIds(player))}</td>
            <td>${window.LB.appUtils.escapeHtml(window.LB.appPlayer.formatDivisionLabel(division) || "-")}</td>
            <td>${window.LB.appUtils.escapeHtml(assignment.flightGroup || "-")}</td>
            <td>${window.LB.appUtils.escapeHtml(assignment.startHole || "-")}</td>
            <td>${window.LB.appUtils.escapeHtml(window.LB.appPlayer.getGenderLabel(player.gender))}</td>
            <td class="num">${window.LB.appUtils.escapeHtml(window.LB.appPlayer.formatHandicapValue(player.handicapIndex))}</td>
            <td class="num">${window.LB.appUtils.escapeHtml(window.LB.appPlayer.formatHandicapValue(player.courseHandicap ?? player.handicap))}</td>
            <td>${window.LB.appUtils.escapeHtml(window.LB.appPrint.formatPrintValue(player.caddyNumber))}</td>
            <td>${player.awardEligible === false ? "Không" : "Có"}</td>
            ${showTs36Column ? `<td>${window.LB.appUtils.escapeHtml(window.LB.appPrint.getPlayerPrintTs36(player))}</td>` : ""}
            <td class="note">${window.LB.appUtils.escapeHtml(player.operationNote || player.note || "")}</td>
          </tr>
        `;
      }).join("");

      return `
        <tbody class="flight-print-group">
          <tr class="group-row">
            <td colspan="${colSpan}">
              <strong>Flight ${window.LB.appUtils.escapeHtml(group.label)}</strong>
              <span>${group.startHole ? `Hố ${window.LB.appUtils.escapeHtml(group.startHole)} · ` : ""}${group.players.length} golfer</span>
            </td>
          </tr>
          ${rows}
        </tbody>
      `;
    }).join("");
  }

function formatPrintDateTime(value = new Date()) {
    return new Intl.DateTimeFormat("vi-VN", {
      dateStyle: "medium",
      timeStyle: "short"
    }).format(value);
  }

function formatPrintValue(value, fallback = "-") {
    const text = window.LB.appUtils.cleanText(value);
    return text || fallback;
  }

function formatRosterPrintId(value = "") {
    const raw = window.LB.appUtils.cleanText(value).toUpperCase();
    if (!raw) return "";
    const clw = raw.match(/^CLW\s*0*([0-9]+)$/);
    if (clw) return `CLW ${String(clw[1]).padStart(4, "0")}`;
    const vga = raw.match(/^(?:VGA\s*)?([0-9]+)$/);
    if (vga) return `VGA ${vga[1]}`;
    return "";
  }

function getPlayerPrintIds(player = {}) {
    return [
      player.vgaId,
      player.golferId,
      window.LB.appPlayer.getPlayerPublicId(player)
    ].map(window.LB.appPrint.formatRosterPrintId).find(Boolean) || "-";
  }

function getPlayerPrintTs36(player = {}) {
    const match = (state().ts36Matches || []).find(item => (
      item.linkedPlayerId === player.id ||
      (player.tourSystemUserId && item.tourSystemUserId === player.tourSystemUserId)
    ));
    const parts = [
      player.ts36DisplayName || match?.displayName || "",
      player.ts36Email || match?.email || ""
    ].map(window.LB.appUtils.cleanText).filter(Boolean);
    return parts.join(" · ") || "-";
  }

function getPlayerRosterPrintLayout(value = "landscape") {
    const layout = String(value || "").trim().toLowerCase() === "portrait" ? "portrait" : "landscape";
    if (layout === "portrait") {
      return {
        id: "portrait",
        label: "A4 dọc",
        pageSize: "210mm 297mm",
        pageMargin: "12mm 6mm 10mm",
        bodyMargin: "0",
        sheetWidth: "198mm",
        bodyFontSize: "7px",
        bodyLineHeight: "1.25",
        headerGap: "5px",
        headerMargin: "6px",
        headerPadding: "6px",
        eyebrowFontSize: "6px",
        h1FontSize: "14px",
        metaColumns: 4,
        metaGap: "3px",
        metaMinHeight: "27px",
        metaPadding: "3px 4px",
        metaLabelFontSize: "6px",
        metaValueFontSize: "7px",
        cellPadding: "3px 2px",
        thFontSize: "5.5px",
        groupPadding: "4px 5px",
        frameWidth: "794px",
        frameHeight: "1123px",
        columnWidths: ["3%", "14%", "8%", "7%", "5%", "4%", "5%", "5%", "5%", "5%", "6%", "12%", "21%"],
        columnWidthsWithoutTs36: ["3%", "17%", "9%", "8%", "5%", "4%", "5%", "5%", "5%", "5%", "6%", "28%"]
      };
    }
    return {
      id: "landscape",
      label: "A4 ngang",
      pageSize: "297mm 210mm",
      pageMargin: "10mm",
      bodyMargin: "0",
      sheetWidth: "277mm",
      bodyFontSize: "9px",
      bodyLineHeight: "1.35",
      headerGap: "7px",
      headerMargin: "8px",
      headerPadding: "8px",
      eyebrowFontSize: "8px",
      h1FontSize: "19px",
      metaColumns: 7,
      metaGap: "4px",
      metaMinHeight: "31px",
      metaPadding: "4px 5px",
      metaLabelFontSize: "7px",
      metaValueFontSize: "8px",
      cellPadding: "4px 5px",
      thFontSize: "7px",
      groupPadding: "5px 6px",
      frameWidth: "1123px",
      frameHeight: "794px",
      columnWidths: ["2.5%", "18%", "8%", "6%", "4%", "3.5%", "4.5%", "4%", "4%", "4%", "5%", "16%", "20.5%"],
      columnWidthsWithoutTs36: ["2.5%", "22%", "8%", "6.5%", "4.5%", "3.5%", "4.5%", "4.5%", "4.5%", "4.5%", "5.5%", "29.5%"]
    };
  }

function buildPlayerRosterPrintDocument(layoutInput = "landscape") {
    const printLayout = window.LB.appPrint.getPlayerRosterPrintLayout(layoutInput);
    const showTs36Column = window.LB.appPrint.shouldShowTs36PrintColumn();
    const printColumnWidths = showTs36Column ? printLayout.columnWidths : printLayout.columnWidthsWithoutTs36;
    const t = state().tournament || {};
    const players = state().players || [];
    const eligibleCount = players.filter(player => player.awardEligible !== false).length;
    const groups = window.LB.appPlayer.groupPlayersForPanel([...players].sort(window.LB.appPlayer.comparePlayersByFlight));
    const ratings = t.handicapRatings || {};
    const titleParts = [
      t.name || "Tournament",
      t.courseName || "",
      t.operatorName ? `Đơn vị tổ chức: ${t.operatorName}` : ""
    ].map(window.LB.appUtils.cleanText).filter(Boolean);
    const printTitle = titleParts.join(" - ");
    const metaItems = [
      ["Ngày in", window.LB.appPrint.formatPrintDateTime()],
      ["Số golfer", `${players.length} golfer`],
      ["Tính giải", `${eligibleCount} golfer`],
      ["Số flight", `${groups.length} flight`],
      ["Par sân", window.LB.appPlayer.getCourseParTotal()],
      ["CR/Slope Nam", [ratings.male?.courseRating, ratings.male?.slopeRating].filter(Boolean).join(" / ")],
      ["CR/Slope Nữ", [ratings.female?.courseRating, ratings.female?.slopeRating].filter(Boolean).join(" / ")]
    ];

    return `<!doctype html>
      <html lang="vi">
        <head>
          <meta charset="UTF-8">
          <title>${window.LB.appUtils.escapeHtml(printTitle || "Danh sách golfer")}</title>
          <style>
            @page {
              size: ${printLayout.pageSize};
              margin: ${printLayout.pageMargin};
            }

            * {
              box-sizing: border-box;
            }

            body {
              color: #111827;
              font-family: "Segoe UI", Arial, Tahoma, sans-serif;
              font-size: ${printLayout.bodyFontSize};
              line-height: ${printLayout.bodyLineHeight};
              margin: ${printLayout.bodyMargin};
              max-width: ${printLayout.sheetWidth};
              overflow-x: hidden;
              width: ${printLayout.sheetWidth};
            }

            .print-sheet {
              max-width: ${printLayout.sheetWidth};
              overflow: hidden;
              width: ${printLayout.sheetWidth};
            }

            header {
              border-bottom: 2px solid #111827;
              display: grid;
              gap: ${printLayout.headerGap};
              margin-bottom: ${printLayout.headerMargin};
              padding-bottom: ${printLayout.headerPadding};
            }

            .eyebrow {
              color: #047857;
              font-size: ${printLayout.eyebrowFontSize};
              font-weight: 900;
              letter-spacing: 0;
              text-transform: uppercase;
            }

            h1 {
              font-size: ${printLayout.h1FontSize};
              line-height: 1.1;
              margin: 1px 0 0;
            }

            .meta-grid {
              display: grid;
              gap: ${printLayout.metaGap};
              grid-template-columns: repeat(${printLayout.metaColumns}, minmax(0, 1fr));
            }

            .meta-item {
              border: 1px solid #d1d5db;
              border-radius: 4px;
              min-height: ${printLayout.metaMinHeight};
              padding: ${printLayout.metaPadding};
            }

            .meta-item span {
              color: #6b7280;
              display: block;
              font-size: ${printLayout.metaLabelFontSize};
              font-weight: 800;
              margin-bottom: 1px;
            }

            .meta-item strong {
              display: block;
              font-size: ${printLayout.metaValueFontSize};
              font-weight: 900;
              overflow-wrap: anywhere;
            }

            table {
              border-collapse: collapse;
              table-layout: fixed;
              max-width: ${printLayout.sheetWidth};
              width: ${printLayout.sheetWidth};
            }

            thead {
              display: table-header-group;
            }

            tbody.flight-print-group {
              break-inside: avoid;
              page-break-inside: avoid;
            }

            tr {
              break-inside: avoid;
              page-break-inside: avoid;
            }

            th,
            td {
              border: 1px solid #d1d5db;
              overflow-wrap: anywhere;
              padding: ${printLayout.cellPadding};
              vertical-align: top;
              word-break: break-word;
            }

            th {
              background: #111827;
              color: #ffffff;
              font-size: ${printLayout.thFontSize};
              font-weight: 900;
              text-transform: uppercase;
            }

            tbody tr:nth-child(even):not(.group-row) {
              background: #f9fafb;
            }

            .group-row td {
              background: #dcfce7;
              border-color: #86efac;
              color: #064e3b;
              font-weight: 900;
              padding: ${printLayout.groupPadding};
            }

            .group-row span {
              color: #047857;
              float: right;
              font-weight: 800;
            }

            .num {
              text-align: center;
              white-space: nowrap;
            }

            .name {
              font-weight: 900;
            }

            .note {
              color: #374151;
            }

            .empty-print {
              color: #6b7280;
              font-weight: 800;
              padding: 18px;
              text-align: center;
            }
          </style>
        </head>
        <body>
          <main class="print-sheet">
            <header>
              <div>
                <span class="eyebrow">Leaderboard Pro · Danh sách golfer · ${printLayout.label}</span>
                <h1>${window.LB.appUtils.escapeHtml(printTitle || "Tournament")}</h1>
              </div>
              <section class="meta-grid">
                ${metaItems.map(([label, value]) => `
                  <div class="meta-item">
                    <span>${window.LB.appUtils.escapeHtml(label)}</span>
                    <strong>${window.LB.appUtils.escapeHtml(window.LB.appPrint.formatPrintValue(value))}</strong>
                  </div>
                `).join("")}
              </section>
            </header>
            <table>
              <colgroup>
                ${printColumnWidths.map(width => `<col style="width: ${width}">`).join("")}
              </colgroup>
              <thead>
                <tr>
                  <th>#</th>
                  <th>Golfer</th>
                  <th>ID / VGA</th>
                  <th>Bảng</th>
                  <th>Flight</th>
                  <th>Hố</th>
                  <th>Giới tính</th>
                  <th>HCP Index</th>
                  <th>HCP sân</th>
                  <th>Caddy</th>
                  <th>Tính giải</th>
                  ${showTs36Column ? "<th>TS36</th>" : ""}
                  <th>Note</th>
                </tr>
              </thead>
              ${window.LB.appPrint.buildPlayerRosterPrintGroups({ showTs36Column })}
            </table>
          </main>
        </body>
      </html>`;
  }

  return { shouldShowTs36PrintColumn, buildPlayerRosterPrintGroups, formatPrintDateTime, formatPrintValue, formatRosterPrintId, getPlayerPrintIds, getPlayerPrintTs36, getPlayerRosterPrintLayout, buildPlayerRosterPrintDocument };
})();
