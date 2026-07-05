window.LB = window.LB || {};
window.LB.appSnapshot = (function() {
  const state = () => window.LB.state;

function getOperatorSnapshotAutoPublishSeconds() {
    return Math.round(getOperatorSnapshotAutoPublishMs() / 1000);
  }

function getRosterScoreRestoreKeys(player = {}) {
    window.LB.appPlayer.ensurePlayerIdentity(player);
    return Array.from(new Set([
      window.LB.appUtils.cleanText(player.id),
      window.LB.appUtils.normalizeVgaId(player.golferId || ""),
      window.LB.appUtils.normalizeVgaId(player.vgaId || ""),
      window.LB.appUtils.normalizeVgaId(player.ts36VgaId || ""),
      window.LB.appUtils.keyText(player.name || "")
    ].filter(Boolean)));
  }

function buildScoreRestoreIndex(players = state().players, scores = state().scores) {
    const index = new Map();
    (players || []).forEach(player => {
      const scoreMap = scores?.[player.id];
      if (!scoreMap || typeof scoreMap !== "object" || !Object.keys(scoreMap).length) return;
      window.LB.appSnapshot.getRosterScoreRestoreKeys(player).forEach(key => {
        if (!index.has(key)) index.set(key, scoreMap);
      });
    });
    return index;
  }

function getRestorableSnapshotRows() {
    const rows = [];
    const appendRows = snapshot => {
      if (Array.isArray(snapshot?.leaderboard)) rows.push(...snapshot.leaderboard);
      if (Array.isArray(snapshot?.divisionLeaderboards)) {
        snapshot.divisionLeaderboards.forEach(group => {
          if (Array.isArray(group?.rows)) rows.push(...group.rows);
        });
      }
    };
    const finalSnapshot = state().finalResults?.publishedSnapshot;
    appendRows(finalSnapshot);
    const slug = window.LB.appUtils.cleanText(state().tournament?.shareSlug || "");
    const localSnapshot = slug && window.LB.storage?.getSnapshot ? window.LB.storage.getSnapshot(slug) : null;
    appendRows(localSnapshot);
    return rows;
  }

function buildSnapshotScoreRestoreIndex() {
    const index = new Map();
    window.LB.appSnapshot.getRestorableSnapshotRows().forEach(row => {
      const holeScores = row?.holeScores || row?.scores || {};
      const entries = Object.entries(holeScores)
        .map(([hole, gross]) => [window.LB.scoring.clampInt(hole, 1, 18, 0), window.LB.scoring.clampInt(gross, 1, 30, 0)])
        .filter(([hole, gross]) => hole && gross);
      if (!entries.length) return;
      const scoreMap = Object.fromEntries(entries.map(([hole, gross]) => [String(hole), {
        operatorGross: gross,
        confirmedGross: gross,
        source: "manual",
        conflictStatus: "ok",
        ocrPending: false,
        restoredFromSnapshot: true,
        updatedAt: row.updatedAt || row.confirmedAt || new Date().toISOString()
      }]));
      [
        window.LB.appUtils.cleanText(row.playerId || ""),
        window.LB.appUtils.normalizeVgaId(row.golferId || ""),
        window.LB.appUtils.normalizeVgaId(row.vgaId || ""),
        window.LB.appUtils.keyText(row.name || "")
      ].filter(Boolean).forEach(key => {
        if (!index.has(key)) index.set(key, scoreMap);
      });
    });
    return index;
  }

function restoreMissingScoreMapsFromSnapshots() {
    const snapshotIndex = window.LB.appSnapshot.buildSnapshotScoreRestoreIndex();
    if (!snapshotIndex.size) return 0;
    let restored = 0;
    state().players.forEach(player => {
      const current = state().scores?.[player.id];
      if (current && Object.keys(current).length) return;
      const scoreMap = window.LB.appUtils.findRestorableScoreMap(player, [snapshotIndex]);
      if (!Object.keys(scoreMap).length) return;
      if (!state().scores) state().scores = {};
      state().scores[player.id] = scoreMap;
      restored += 1;
    });
    if (restored) window.LB.storage.saveState();
    return restored;
  }

function buildRosterSnapshot() {
    window.LB.appPlayer.syncPlayerIdentities();
    window.LB.appUtils.recomputeCaddyDuplicates();
    return state().players.map((player, index) => {
      const assignment = window.LB.appPlayer.normalizePlayerFlightAssignment(player);
      const playerHandicap = window.LB.appPlayer.getPlayerCourseHandicapValue(player);
      const division = window.LB.appPlayer.getPlayerDivision(player) || (window.LB.appPlayer.hasNumericPlayerValue(playerHandicap) ? window.LB.appPlayer.getFlightNameForHandicap(playerHandicap, player.gender) : "");
      const divisionConfig = window.LB.appPlayer.getFlightConfigByName(division);
      const isSystem36Division = window.LB.appPlayer.isDivisionSystem36(division);
      const publicId = window.LB.appPlayer.getPlayerPublicId(player);
      return {
        id: player.id,
        playerId: player.id,
        golferId: publicId,
        vgaId: player.vgaId || "",
        name: player.name || "Golfer",
        displayName: player.name || "Golfer",
        handicap: window.LB.appPlayer.hasNumericPlayerValue(playerHandicap)
          ? window.LB.scoring.clampNumber(playerHandicap, -10, 54, 0)
          : "",
        handicapIndex: player.handicapIndex ?? "",
        gender: player.gender || "",
        division,
        divisionGender: divisionConfig?.gender || "",
        scoringMode: isSystem36Division ? "system36" : "handicap",
        isSystem36Division,
        isSystem36: isSystem36Division,
        flight: division,
        flightGroup: assignment.flightGroup || "",
        group: assignment.flightGroup || "",
        startHole: assignment.startHole || "",
        caddyNumber: player.caddyNumber || "",
        awardEligible: player.awardEligible !== false,
        order: index + 1,
        updatedAt: new Date().toISOString()
      };
    });
  }

function getOperatorSnapshotPublishSignature(snapshot = {}) {
    const rows = (snapshot.leaderboard || []).map(row => ({
      playerId: row.playerId,
      golferId: row.golferId,
      name: row.name,
      division: row.division,
      scoringMode: row.scoringMode,
      rank: row.rank,
      holesPlayed: row.holesPlayed,
      gross: row.gross,
      net: row.net,
      system36Net: row.system36Net,
      holeScores: row.holeScores || {}
    }));
    const divisions = (snapshot.divisionLeaderboards || []).map(group => ({
      division: group.division,
      scoringMode: group.scoringMode || "",
      isSystem36Division: group.isSystem36Division === true,
      rows: (group.rows || []).map(row => ({
        playerId: row.playerId,
        rank: row.rank,
        holesPlayed: row.holesPlayed,
        gross: row.gross,
        net: row.net,
        system36Net: row.system36Net,
        holeScores: row.holeScores || {}
      }))
    }));
    return JSON.stringify({
      tournament: {
        id: snapshot.tournament?.id || "",
        name: snapshot.tournament?.name || "",
        operatorName: snapshot.tournament?.operatorName || "",
        courseName: snapshot.tournament?.courseName || "",
        startHole: snapshot.tournament?.startHole || "",
        scoringFormat: snapshot.tournament?.scoringFormat || ""
      },
      course: snapshot.course || {},
      flightConfig: snapshot.flightConfig || null,
      finalResults: snapshot.finalResults || null,
      sync: snapshot.sync || {},
      liveNotifications: Array.isArray(snapshot.liveNotifications)
        ? snapshot.liveNotifications.map(item => ({
          id: item.id,
          fingerprint: item.fingerprint,
          createdAt: item.createdAt,
          tone: item.tone,
          severity: item.severity,
          playerName: item.playerName,
          division: item.division,
          hole: item.hole,
          strokes: item.strokes,
          holeDiff: item.holeDiff,
          rankBefore: item.rankBefore,
          rankAfter: item.rankAfter
        }))
        : [],
      roster: snapshot.roster || [],
      rows,
      divisions
    });
  }

  return { getOperatorSnapshotAutoPublishSeconds, getRosterScoreRestoreKeys, buildScoreRestoreIndex, getRestorableSnapshotRows, buildSnapshotScoreRestoreIndex, restoreMissingScoreMapsFromSnapshots, buildRosterSnapshot, getOperatorSnapshotPublishSignature };
})();
