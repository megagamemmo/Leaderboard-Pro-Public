export type OperatorSyncStatusInput = {
  linkedTournamentName?: string;
  privateCode?: string;
  scorePollMs?: number;
  participantPollMs?: number;
  catalogPollMs?: number;
  autoPublishSnapshotMs?: number;
  pendingScoreSubmissions?: number;
  confirmedScoresWaitingPublish?: number;
  lastScoreSyncAt?: string;
  lastSnapshotPublishAt?: string;
};

export type OperatorSyncStatusViewModel = {
  linked: boolean;
  headline: string;
  detail: string;
  scorePollSeconds: number;
  participantPollSeconds: number;
  catalogPollSeconds: number;
  autoPublishSeconds: number;
  pendingScoreSubmissions: number;
  confirmedScoresWaitingPublish: number;
  lastScoreSyncLabel: string;
  lastSnapshotPublishLabel: string;
};

const DEFAULT_SCORE_POLL_MS = 10000;
const DEFAULT_BACKGROUND_POLL_MS = 60000;
const DEFAULT_AUTO_PUBLISH_MS = 300000;
const MIN_SCORE_POLL_MS = 3000;
const MIN_AUTO_PUBLISH_MS = 5000;
const MAX_SCORE_POLL_MS = 300000;

function clampMs(value: number | undefined, fallback: number, min = MIN_SCORE_POLL_MS) {
  if (!Number.isFinite(value)) return fallback;
  const next = Math.trunc(Number(value));
  return Math.min(MAX_SCORE_POLL_MS, Math.max(min, next));
}

function toSeconds(ms: number) {
  return Math.max(1, Math.round(ms / 1000));
}

function formatTime(value?: string) {
  if (!value) return "Chưa có";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Chưa có";
  return new Intl.DateTimeFormat("vi-VN", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).format(date);
}

export function buildOperatorSyncStatusViewModel(
  input: OperatorSyncStatusInput,
): OperatorSyncStatusViewModel {
  const scorePollMs = clampMs(input.scorePollMs, DEFAULT_SCORE_POLL_MS);
  const participantPollMs = clampMs(input.participantPollMs, DEFAULT_BACKGROUND_POLL_MS);
  const catalogPollMs = clampMs(input.catalogPollMs, DEFAULT_BACKGROUND_POLL_MS);
  const autoPublishSnapshotMs = clampMs(
    input.autoPublishSnapshotMs,
    DEFAULT_AUTO_PUBLISH_MS,
    MIN_AUTO_PUBLISH_MS,
  );
  const linked = Boolean(input.linkedTournamentName && input.privateCode);
  const scorePollSeconds = toSeconds(scorePollMs);
  const autoPublishSeconds = toSeconds(autoPublishSnapshotMs);
  const pendingScoreSubmissions = Math.max(0, Math.trunc(input.pendingScoreSubmissions || 0));
  const confirmedScoresWaitingPublish = Math.max(
    0,
    Math.trunc(input.confirmedScoresWaitingPublish || 0),
  );

  return {
    linked,
    headline: linked
      ? `Đang liên kết ${input.linkedTournamentName}`
      : "Chưa liên kết TourSystem36",
    detail: linked
      ? `Tự nhận điểm TS36 mỗi ${scorePollSeconds}s. Bảng live tự cập nhật điểm đã confirm mỗi ${autoPublishSeconds}s khi có thay đổi.`
      : "Chọn tournament TS36 và nhập private code để bật bridge.",
    scorePollSeconds,
    participantPollSeconds: toSeconds(participantPollMs),
    catalogPollSeconds: toSeconds(catalogPollMs),
    autoPublishSeconds,
    pendingScoreSubmissions,
    confirmedScoresWaitingPublish,
    lastScoreSyncLabel: formatTime(input.lastScoreSyncAt),
    lastSnapshotPublishLabel: formatTime(input.lastSnapshotPublishAt),
  };
}
