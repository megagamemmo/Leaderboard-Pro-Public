"use client";

import {
  buildOperatorSyncStatusViewModel,
  type OperatorSyncStatusInput,
} from "@/features/operator/sync-status";

type OperatorSyncStatusProps = {
  status: OperatorSyncStatusInput;
};

export function OperatorSyncStatus({ status }: OperatorSyncStatusProps) {
  const viewModel = buildOperatorSyncStatusViewModel(status);

  return (
    <section aria-label="TourSystem36 sync status" data-operator-sync-status>
      <header>
        <strong>{viewModel.headline}</strong>
        <span>{viewModel.linked ? "Bridge bật" : "Bridge tắt"}</span>
      </header>
      <p>{viewModel.detail}</p>
      <dl>
        <div>
          <dt>Nhận điểm TS36</dt>
          <dd>{viewModel.scorePollSeconds}s</dd>
        </div>
        <div>
          <dt>Cập nhật bảng live</dt>
          <dd>{viewModel.autoPublishSeconds}s</dd>
        </div>
        <div>
          <dt>Roster/catalog</dt>
          <dd>
            {viewModel.participantPollSeconds}s / {viewModel.catalogPollSeconds}s
          </dd>
        </div>
        <div>
          <dt>Chờ xác nhận</dt>
          <dd>{viewModel.pendingScoreSubmissions}</dd>
        </div>
        <div>
          <dt>Chờ lên live</dt>
          <dd>{viewModel.confirmedScoresWaitingPublish}</dd>
        </div>
      </dl>
      <footer>
        <span>Nhận điểm: {viewModel.lastScoreSyncLabel}</span>
        <span>Publish: {viewModel.lastSnapshotPublishLabel}</span>
      </footer>
    </section>
  );
}
