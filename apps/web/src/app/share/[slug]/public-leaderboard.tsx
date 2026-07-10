"use client";

import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type MouseEvent,
  type PointerEvent,
  type TouchEvent,
} from "react";
import type {
  PublicFinalResults,
  PublicLiveNotification,
  PublicLeaderboardPlayer,
  PublicLeaderboardState,
} from "@/lib/contracts/public-leaderboard";
import {
  buildPublicLeaderboardDivisionLeaderboards,
  rankPublicLeaderboardRows,
  recalculateSystem36PublicLeaderboardRow,
} from "@/lib/contracts/leaderboard-ranking";
import { useAwardAssetUrls, type AwardAssetId } from "./award-assets";
import styles from "./public-leaderboard.module.css";

type PublicLeaderboardProps = {
  slug: string;
  initialSnapshot: PublicLeaderboardState | null;
  initialUpdatedAt?: string;
  initialError?: string;
};

type PublicLeaderboardApiResponse = {
  ok: boolean;
  snapshot?: PublicLeaderboardState;
  updatedAt?: string;
};

type RowPosition = {
  rank: string;
  rect: DOMRect;
};

const LOCAL_SNAPSHOT_KEY = "lbpro_public_snapshots";
const THEME_STORAGE_KEY = "lbpro_share_theme";
const LANGUAGE_STORAGE_KEY = "lbpro_share_language";
const DEFAULT_REFRESH_MS = 300_000;
const MISSING_SNAPSHOT_REFRESH_MS = 5_000;
const MIN_REFRESH_MS = 5_000;
const MAX_REFRESH_MS = 300_000;
const SHARE_THEMES = [
  { id: "tour_green", label: "Tour Green", shortLabel: "Tour", swatchClass: "themeSwatchTour" },
  { id: "broadcast_blue", label: "Broadcast Blue", shortLabel: "TV", swatchClass: "themeSwatchBroadcast" },
  { id: "championship_gold", label: "Championship Gold", shortLabel: "Gold", swatchClass: "themeSwatchGold" },
  { id: "daylight_score", label: "Daylight Emerald", shortLabel: "Day", swatchClass: "themeSwatchDay" },
  { id: "sky_score", label: "Sky Broadcast", shortLabel: "Sky", swatchClass: "themeSwatchSky" },
  { id: "mint_score", label: "Mint Tour", shortLabel: "Mint", swatchClass: "themeSwatchMint" },
  { id: "ruby_score", label: "Ruby Score", shortLabel: "Ruby", swatchClass: "themeSwatchRuby" },
  { id: "mono_contrast", label: "Mono Contrast", shortLabel: "Mono", swatchClass: "themeSwatchMono" },
  { id: "foundation_slate", label: "Foundation Slate", shortLabel: "Slate", swatchClass: "themeSwatchSlate" },
  { id: "prometheus_desert", label: "Prometheus Desert", shortLabel: "Desert", swatchClass: "themeSwatchDesert" },
  { id: "refire_teal", label: "ReFire Teal", shortLabel: "Teal", swatchClass: "themeSwatchTealR" },
  { id: "moon_phases", label: "Moon Phases", shortLabel: "Moon", swatchClass: "themeSwatchMoon" },
  { id: "icon_vivid", label: "Iconic Vivid", shortLabel: "Vivid", swatchClass: "themeSwatchVivid" },
  { id: "dark_cyan", label: "Dark Cyan", shortLabel: "Cyan", swatchClass: "themeSwatchCyan" },
  { id: "solarin_dark", label: "Solarin Dark", shortLabel: "Solar", swatchClass: "themeSwatchSolar" },
  { id: "type_navy", label: "Type Navy", shortLabel: "Navy", swatchClass: "themeSwatchNavy" },
  { id: "nature_sky", label: "Nature Sky", shortLabel: "Nature", swatchClass: "themeSwatchNature" },
] as const;
const SHARE_LANGUAGES = [
  { id: "vi", label: "Tiếng Việt", shortLabel: "VI", locale: "vi-VN" },
  { id: "en", label: "English", shortLabel: "EN", locale: "en-US" },
  { id: "ko", label: "한국어", shortLabel: "KR", locale: "ko-KR" },
  { id: "zh", label: "中文", shortLabel: "CN", locale: "zh-CN" },
  { id: "ja", label: "日本語", shortLabel: "JP", locale: "ja-JP" },
] as const;

type ShareThemeId = (typeof SHARE_THEMES)[number]["id"];
type ShareLanguageId = (typeof SHARE_LANGUAGES)[number]["id"];
type ShareView = "leaderboard" | "final";
type ScoreDisplayMode = "gross" | "overpar";
type ScoreTooltip = {
  key: string;
  text: string;
  x: number;
  y: number;
  placement: "above" | "below";
};
type LiveNotificationTone = "ace" | "brilliant" | "damage" | "rank";
type LiveNotificationTrend = "up" | "down" | "steady";
type LiveNotificationRetentionMode = "time" | "count";
type LiveNotificationItem = PublicLiveNotification;
type LiveNotificationConfig = {
  displayMs: number;
  maxAgeMs: number;
  maxItems: number;
  retentionMode: LiveNotificationRetentionMode;
};
type LiveTickerCopy = {
  ariaLabel: string;
  liveLabel: string;
  pausedLabel: string;
  idleCategory: string;
  emptyTitle: string;
  emptyDetail: string;
  pauseAria: string;
  resumeAria: string;
  category: Record<LiveNotificationTone, string>;
  headline: (item: LiveNotificationItem) => string;
  detail: (item: LiveNotificationItem, now: number) => string;
  rankMove: (from: number, to: number) => string;
  rankStable: string;
  timeAgo: (timestamp: number, now: number) => string;
  eventCount: (count: number) => string;
  settingsAria: string;
  settingsTitle: string;
  retentionTime: string;
  retentionCount: string;
  keepMinutesLabel: string;
  keepItemsLabel: string;
  minutesUnit: string;
  itemsUnit: string;
  clearEvents: string;
};

const DEFAULT_THEME_ID: ShareThemeId = "tour_green";
const DEFAULT_LANGUAGE_ID: ShareLanguageId = "vi";
const LIVE_NOTIFICATION_DEFAULT_DISPLAY_MS = 3_800;
const LIVE_NOTIFICATION_DEFAULT_MAX_AGE_MS = 45 * 60 * 1000;
const LIVE_NOTIFICATION_DEFAULT_MAX_ITEMS = 20;
const LIVE_NOTIFICATION_DEFAULT_RETENTION_MODE: LiveNotificationRetentionMode = "time";
const LIVE_NOTIFICATION_MIN_DISPLAY_MS = 2_400;
const LIVE_NOTIFICATION_MAX_DISPLAY_MS = 8_000;
const LIVE_NOTIFICATION_MIN_AGE_MS = 60_000;
const LIVE_NOTIFICATION_MAX_AGE_MS = 6 * 60 * 60 * 1000;
const LIVE_NOTIFICATION_MIN_AGE_MINUTES = 1;
const LIVE_NOTIFICATION_MAX_AGE_MINUTES = 360;
const LIVE_NOTIFICATION_MIN_ITEMS = 4;
const LIVE_NOTIFICATION_MAX_ITEMS = 48;
const LIVE_NOTIFICATION_MIN_SEVERITY = 45;
const LIVE_NOTIFICATION_DAMAGE_PHRASES = [
  "trượt chân",
  "sảy chân",
  "mất nhịp",
  "hụt bước",
  "chững lại",
  "vấp nhịp",
];
const LIVE_NOTIFICATION_BRILLIANT_PHRASES = [
  "xuất thần",
  "bứt phá",
  "tỏa sáng",
  "lên tiếng",
  "ghi dấu",
  "bùng nổ",
];
const LIVE_NOTIFICATION_ACE_PHRASES = [
  "ghi dấu khoảnh khắc hiếm",
  "tạo dấu ấn đặc biệt",
  "làm bùng sáng bảng điểm",
];
const LIVE_NOTIFICATION_RANK_PHRASES = [
  "làm đổi hạng",
  "kéo bảng điểm chuyển động",
  "tạo biến động thứ hạng",
];

function pickLiveNotificationPhrase(values: string[], seed: string) {
  let hash = 0;
  for (let index = 0; index < seed.length; index += 1) {
    hash = (hash * 31 + seed.charCodeAt(index)) | 0;
  }
  return values[Math.abs(hash) % values.length] || values[0] || "";
}

function getLiveNotificationHeadlinePhrase(tone: LiveNotificationTone, seed: string) {
  if (tone === "ace") return pickLiveNotificationPhrase(LIVE_NOTIFICATION_ACE_PHRASES, seed);
  if (tone === "damage") return pickLiveNotificationPhrase(LIVE_NOTIFICATION_DAMAGE_PHRASES, seed);
  if (tone === "rank") return pickLiveNotificationPhrase(LIVE_NOTIFICATION_RANK_PHRASES, seed);
  return pickLiveNotificationPhrase(LIVE_NOTIFICATION_BRILLIANT_PHRASES, seed);
}

type ShareCopy = {
  locale: string;
  noUpdatedData: string;
  noScore: string;
  noGolfer: string;
  cutFrom: string;
  noDivision: string;
  rankLabel: (rank: number) => string;
  holeLabel: (hole: number | string) => string;
  noAwardDetail: string;
  technicalCategories: Record<
    "longestDrive" | "nearestToPin" | "nearToTheLine" | "longestPutt",
    { label: string; subtitle: string }
  >;
  groupLabel: (group: string) => string;
  finalResults: string;
  finalAnnouncement: string;
  championsTitle: string;
  noAwardRecipient: string;
  podiumAria: string;
  podiumRankAlt: (rank: number) => string;
  podiumRank: (rank: number) => string;
  podiumDotsLabel: string;
  viewPodium: (label: string) => string;
  holeInOnePrizeLabel: string;
  rareMoment: string;
  technicalAwardsLabel: string;
  technicalAwardsTitle: string;
  specialRecognitionLabel: string;
  specialAwardsTitle: string;
  emptyTitle: string;
  snapshotNotFound: string;
  publicDataUnavailable: string;
  officialLeaderboard: string;
  themePickerAria: string;
  themeAria: (label: string) => string;
  languagePickerAria: string;
  finalStatus: string;
  syncStatus: string;
  liveStatus: string;
  leaderboardEnded: string;
  usingLatestData: string;
  confirmedScores: string;
  updatedAtPrefix: string;
  finalLeaderboardAria: string;
  refreshingDataAria: string;
  autoRefreshAria: (seconds: number) => string;
  statusLabel: string;
  finishedStatus: string;
  loadingStatus: string;
  refreshAfter: string;
  publicContentAria: string;
  leaderboardTab: string;
  holeScoresTab: string;
  finalTab: string;
  championsAwardsTab: string;
  divisionPickerAria: string;
  golferCount: (count: number) => string;
  allGolfers: string;
  scoreToggleAria: (mode: ScoreDisplayMode) => string;
  scoreToggleTitle: string;
  leaderboardTableAria: string;
  rankHeader: string;
  golferHeader: string;
  resultHeader: string;
  scoresHeader: string;
  golferFallback: string;
  groupPrefix: (group: string | number) => string;
  bestShort: string;
  thru: string;
  toParShort: string;
  scoreTooltip: (hole: number, par: number, score: unknown, term: string) => string;
  emptyScoreTooltip: (hole: number, par: number) => string;
  footerNote: string;
};

const SHARE_COPY: Record<ShareLanguageId, ShareCopy> = {
  vi: {
    locale: "vi-VN",
    noUpdatedData: "Chưa có dữ liệu cập nhật",
    noScore: "Chưa có điểm",
    noGolfer: "Không có golfer",
    cutFrom: "cắt từ",
    noDivision: "Chưa có bảng",
    rankLabel: (rank) => `Hạng ${rank}`,
    holeLabel: (hole) => `Hố ${hole}`,
    noAwardDetail: "Chưa ghi hố/khoảng cách",
    technicalCategories: {
      longestDrive: { label: "Longest Drive", subtitle: "Cú phát bóng xa nhất" },
      nearestToPin: { label: "Nearest to Pin", subtitle: "Gần cờ nhất" },
      nearToTheLine: { label: "Near to the Line", subtitle: "Gần line nhất" },
      longestPutt: { label: "Longest Putt", subtitle: "Cú gạt bóng thành công xa nhất trên green" },
    },
    groupLabel: (group) => (group === "male" ? "Nam" : group === "female" ? "Nữ" : "Toàn giải"),
    finalResults: "Kết quả chung cuộc",
    finalAnnouncement: "Trân trọng công bố",
    championsTitle: "Champions of the Tournament",
    noAwardRecipient: "Chưa có người nhận giải",
    podiumAria: "Podium các bảng đấu",
    podiumRankAlt: (rank) => `Hạng ${rank}`,
    podiumRank: (rank) => `Hạng ${rank}`,
    podiumDotsLabel: "Vị trí bảng đấu",
    viewPodium: (label) => `Xem ${label}`,
    holeInOnePrizeLabel: "Phần thưởng Hole In One",
    rareMoment: "Rare Moment",
    technicalAwardsLabel: "Technical Awards",
    technicalAwardsTitle: "Giải kỹ thuật",
    specialRecognitionLabel: "Special Recognition",
    specialAwardsTitle: "Giải đặc biệt",
    emptyTitle: "Chưa tải được bảng xếp hạng",
    snapshotNotFound: "Tournament chưa có snapshot công khai.",
    publicDataUnavailable: "Không thể kết nối dữ liệu công khai lúc này.",
    officialLeaderboard: "Bảng xếp hạng chính thức",
    themePickerAria: "Chọn theme trang xem",
    themeAria: (label) => `Theme ${label}`,
    languagePickerAria: "Chọn ngôn ngữ",
    finalStatus: "Final",
    syncStatus: "Sync",
    liveStatus: "Live",
    leaderboardEnded: "Bảng đã kết thúc",
    usingLatestData: "Đang dùng dữ liệu gần nhất",
    confirmedScores: "Điểm đã xác nhận",
    updatedAtPrefix: "Cập nhật",
    finalLeaderboardAria: "Bảng xếp hạng đã kết thúc",
    refreshingDataAria: "Đang làm mới dữ liệu",
    autoRefreshAria: (seconds) => `Tự làm mới sau ${seconds} giây`,
    statusLabel: "Trạng thái",
    finishedStatus: "Đã kết thúc",
    loadingStatus: "Đang tải",
    refreshAfter: "Làm mới sau",
    publicContentAria: "Nội dung công khai",
    leaderboardTab: "Bảng xếp hạng",
    holeScoresTab: "Điểm từng hố",
    finalTab: "Kết quả chung cuộc",
    championsAwardsTab: "Champions & awards",
    divisionPickerAria: "Chọn bảng đấu",
    golferCount: (count) => `${count} golfer`,
    allGolfers: "Tất cả golfer",
    scoreToggleAria: (mode) => `Đổi chế độ xem điểm, hiện tại là ${mode === "gross" ? "Gross" : "Over par"}`,
    scoreToggleTitle: "Đổi Gross / +/-",
    leaderboardTableAria: "Bảng xếp hạng golfer",
    rankHeader: "Hạng",
    golferHeader: "Golfer",
    resultHeader: "Thành tích",
    scoresHeader: "Điểm từng hố",
    golferFallback: "Golfer",
    groupPrefix: (group) => `Nhóm ${group}`,
    bestShort: "Best",
    thru: "Thru",
    toParShort: "HS",
    scoreTooltip: (hole, par, score, term) => `Hố ${hole} · Par ${par} · Gross ${score} · ${term}`,
    emptyScoreTooltip: (hole, par) => `Hố ${hole} · Par ${par} · Chưa có điểm`,
    footerNote: "Kết quả đã được Ban Tổ Chức double-check và xác nhận.",
  },
  en: {
    locale: "en-US",
    noUpdatedData: "No update data yet",
    noScore: "No score yet",
    noGolfer: "No golfer",
    cutFrom: "cut from",
    noDivision: "No division",
    rankLabel: (rank) => `Rank ${rank}`,
    holeLabel: (hole) => `Hole ${hole}`,
    noAwardDetail: "No hole/distance recorded",
    technicalCategories: {
      longestDrive: { label: "Longest Drive", subtitle: "Longest tee shot" },
      nearestToPin: { label: "Nearest to Pin", subtitle: "Closest to the pin" },
      nearToTheLine: { label: "Near to the Line", subtitle: "Closest to the line" },
      longestPutt: { label: "Longest Putt", subtitle: "Longest made putt on the green" },
    },
    groupLabel: (group) => (group === "male" ? "Men" : group === "female" ? "Women" : "Overall"),
    finalResults: "Final results",
    finalAnnouncement: "Official announcement",
    championsTitle: "Champions of the Tournament",
    noAwardRecipient: "No award recipient yet",
    podiumAria: "Division podiums",
    podiumRankAlt: (rank) => `Rank ${rank}`,
    podiumRank: (rank) => `Rank ${rank}`,
    podiumDotsLabel: "Division position",
    viewPodium: (label) => `View ${label}`,
    holeInOnePrizeLabel: "Hole In One prizes",
    rareMoment: "Rare Moment",
    technicalAwardsLabel: "Technical Awards",
    technicalAwardsTitle: "Technical awards",
    specialRecognitionLabel: "Special Recognition",
    specialAwardsTitle: "Special awards",
    emptyTitle: "Leaderboard could not be loaded",
    snapshotNotFound: "This tournament has no public snapshot yet.",
    publicDataUnavailable: "Public data is unavailable right now.",
    officialLeaderboard: "Official leaderboard",
    themePickerAria: "Choose display theme",
    themeAria: (label) => `Theme ${label}`,
    languagePickerAria: "Choose language",
    finalStatus: "Final",
    syncStatus: "Sync",
    liveStatus: "Live",
    leaderboardEnded: "Leaderboard has finished",
    usingLatestData: "Using latest available data",
    confirmedScores: "Confirmed scores",
    updatedAtPrefix: "Updated",
    finalLeaderboardAria: "Leaderboard has finished",
    refreshingDataAria: "Refreshing data",
    autoRefreshAria: (seconds) => `Auto refresh in ${seconds} seconds`,
    statusLabel: "Status",
    finishedStatus: "Finished",
    loadingStatus: "Loading",
    refreshAfter: "Refresh in",
    publicContentAria: "Public content",
    leaderboardTab: "Leaderboard",
    holeScoresTab: "Hole scores",
    finalTab: "Final results",
    championsAwardsTab: "Champions & awards",
    divisionPickerAria: "Choose division",
    golferCount: (count) => `${count} golfers`,
    allGolfers: "All golfers",
    scoreToggleAria: (mode) => `Change score view, currently ${mode === "gross" ? "Gross" : "Over par"}`,
    scoreToggleTitle: "Switch Gross / +/-",
    leaderboardTableAria: "Golfer leaderboard",
    rankHeader: "Rank",
    golferHeader: "Golfer",
    resultHeader: "Result",
    scoresHeader: "Hole scores",
    golferFallback: "Golfer",
    groupPrefix: (group) => `Group ${group}`,
    bestShort: "Best",
    thru: "Thru",
    toParShort: "To par",
    scoreTooltip: (hole, par, score, term) => `Hole ${hole} · Par ${par} · Gross ${score} · ${term}`,
    emptyScoreTooltip: (hole, par) => `Hole ${hole} · Par ${par} · No score yet`,
    footerNote: "Results have been double-checked and confirmed by the Organizing Committee.",
  },
  ko: {
    locale: "ko-KR",
    noUpdatedData: "업데이트 데이터 없음",
    noScore: "점수 없음",
    noGolfer: "골퍼 없음",
    cutFrom: "컷 기준",
    noDivision: "디비전 없음",
    rankLabel: (rank) => `${rank}위`,
    holeLabel: (hole) => `${hole}번 홀`,
    noAwardDetail: "홀/거리 기록 없음",
    technicalCategories: {
      longestDrive: { label: "Longest Drive", subtitle: "최장 드라이브" },
      nearestToPin: { label: "Nearest to Pin", subtitle: "핀에 가장 가까움" },
      nearToTheLine: { label: "Near to the Line", subtitle: "라인에 가장 가까움" },
      longestPutt: { label: "Longest Putt", subtitle: "그린 위 최장 성공 퍼트" },
    },
    groupLabel: (group) => (group === "male" ? "남자" : group === "female" ? "여자" : "전체"),
    finalResults: "최종 결과",
    finalAnnouncement: "공식 발표",
    championsTitle: "대회 챔피언",
    noAwardRecipient: "수상자 없음",
    podiumAria: "디비전 포디움",
    podiumRankAlt: (rank) => `${rank}위`,
    podiumRank: (rank) => `${rank}위`,
    podiumDotsLabel: "디비전 위치",
    viewPodium: (label) => `${label} 보기`,
    holeInOnePrizeLabel: "홀인원 상품",
    rareMoment: "Rare Moment",
    technicalAwardsLabel: "Technical Awards",
    technicalAwardsTitle: "기술상",
    specialRecognitionLabel: "Special Recognition",
    specialAwardsTitle: "특별상",
    emptyTitle: "리더보드를 불러올 수 없습니다",
    snapshotNotFound: "이 대회에는 아직 공개 스냅샷이 없습니다.",
    publicDataUnavailable: "현재 공개 데이터에 연결할 수 없습니다.",
    officialLeaderboard: "공식 리더보드",
    themePickerAria: "표시 테마 선택",
    themeAria: (label) => `테마 ${label}`,
    languagePickerAria: "언어 선택",
    finalStatus: "Final",
    syncStatus: "Sync",
    liveStatus: "Live",
    leaderboardEnded: "리더보드 종료",
    usingLatestData: "최근 데이터 사용 중",
    confirmedScores: "확정 점수",
    updatedAtPrefix: "업데이트",
    finalLeaderboardAria: "리더보드가 종료되었습니다",
    refreshingDataAria: "데이터 새로고침 중",
    autoRefreshAria: (seconds) => `${seconds}초 후 자동 새로고침`,
    statusLabel: "상태",
    finishedStatus: "종료",
    loadingStatus: "로딩 중",
    refreshAfter: "새로고침",
    publicContentAria: "공개 콘텐츠",
    leaderboardTab: "리더보드",
    holeScoresTab: "홀별 점수",
    finalTab: "최종 결과",
    championsAwardsTab: "챔피언 & 수상",
    divisionPickerAria: "디비전 선택",
    golferCount: (count) => `${count}명`,
    allGolfers: "전체 골퍼",
    scoreToggleAria: (mode) => `점수 보기 변경, 현재 ${mode === "gross" ? "Gross" : "Over par"}`,
    scoreToggleTitle: "Gross / +/- 전환",
    leaderboardTableAria: "골퍼 리더보드",
    rankHeader: "순위",
    golferHeader: "골퍼",
    resultHeader: "결과",
    scoresHeader: "홀별 점수",
    golferFallback: "골퍼",
    groupPrefix: (group) => `조 ${group}`,
    bestShort: "Best",
    thru: "완료",
    toParShort: "+/-",
    scoreTooltip: (hole, par, score, term) => `${hole}번 홀 · Par ${par} · Gross ${score} · ${term}`,
    emptyScoreTooltip: (hole, par) => `${hole}번 홀 · Par ${par} · 점수 없음`,
    footerNote: "결과는 조직위원회가 이중 확인하고 확정했습니다.",
  },
  zh: {
    locale: "zh-CN",
    noUpdatedData: "暂无更新时间",
    noScore: "暂无成绩",
    noGolfer: "暂无球员",
    cutFrom: "由此截断",
    noDivision: "暂无组别",
    rankLabel: (rank) => `第 ${rank} 名`,
    holeLabel: (hole) => `${hole} 号洞`,
    noAwardDetail: "未记录球洞/距离",
    technicalCategories: {
      longestDrive: { label: "Longest Drive", subtitle: "最远开球" },
      nearestToPin: { label: "Nearest to Pin", subtitle: "最近旗杆" },
      nearToTheLine: { label: "Near to the Line", subtitle: "最接近线" },
      longestPutt: { label: "Longest Putt", subtitle: "果岭上最长推进" },
    },
    groupLabel: (group) => (group === "male" ? "男子" : group === "female" ? "女子" : "全场"),
    finalResults: "最终成绩",
    finalAnnouncement: "正式公布",
    championsTitle: "赛事冠军",
    noAwardRecipient: "暂无获奖者",
    podiumAria: "各组领奖台",
    podiumRankAlt: (rank) => `第 ${rank} 名`,
    podiumRank: (rank) => `第 ${rank} 名`,
    podiumDotsLabel: "组别位置",
    viewPodium: (label) => `查看 ${label}`,
    holeInOnePrizeLabel: "一杆进洞奖品",
    rareMoment: "Rare Moment",
    technicalAwardsLabel: "Technical Awards",
    technicalAwardsTitle: "技术奖",
    specialRecognitionLabel: "Special Recognition",
    specialAwardsTitle: "特别奖",
    emptyTitle: "无法加载排行榜",
    snapshotNotFound: "该赛事尚无公开快照。",
    publicDataUnavailable: "目前无法连接公开数据。",
    officialLeaderboard: "官方排行榜",
    themePickerAria: "选择显示主题",
    themeAria: (label) => `主题 ${label}`,
    languagePickerAria: "选择语言",
    finalStatus: "Final",
    syncStatus: "Sync",
    liveStatus: "Live",
    leaderboardEnded: "排行榜已结束",
    usingLatestData: "正在使用最新可用数据",
    confirmedScores: "已确认成绩",
    updatedAtPrefix: "更新于",
    finalLeaderboardAria: "排行榜已结束",
    refreshingDataAria: "正在刷新数据",
    autoRefreshAria: (seconds) => `${seconds} 秒后自动刷新`,
    statusLabel: "状态",
    finishedStatus: "已结束",
    loadingStatus: "加载中",
    refreshAfter: "刷新倒计时",
    publicContentAria: "公开内容",
    leaderboardTab: "排行榜",
    holeScoresTab: "逐洞成绩",
    finalTab: "最终成绩",
    championsAwardsTab: "冠军与奖项",
    divisionPickerAria: "选择组别",
    golferCount: (count) => `${count} 位球员`,
    allGolfers: "全部球员",
    scoreToggleAria: (mode) => `切换成绩显示，当前为 ${mode === "gross" ? "Gross" : "Over par"}`,
    scoreToggleTitle: "切换 Gross / +/-",
    leaderboardTableAria: "球员排行榜",
    rankHeader: "排名",
    golferHeader: "球员",
    resultHeader: "成绩",
    scoresHeader: "逐洞成绩",
    golferFallback: "球员",
    groupPrefix: (group) => `组 ${group}`,
    bestShort: "Best",
    thru: "完成",
    toParShort: "+/-",
    scoreTooltip: (hole, par, score, term) => `${hole} 号洞 · Par ${par} · Gross ${score} · ${term}`,
    emptyScoreTooltip: (hole, par) => `${hole} 号洞 · Par ${par} · 暂无成绩`,
    footerNote: "结果已由组委会复核并确认。",
  },
  ja: {
    locale: "ja-JP",
    noUpdatedData: "更新データはまだありません",
    noScore: "スコア未入力",
    noGolfer: "ゴルファーなし",
    cutFrom: "カット前",
    noDivision: "ディビジョンなし",
    rankLabel: (rank) => `${rank}位`,
    holeLabel: (hole) => `${hole}番ホール`,
    noAwardDetail: "ホール/距離の記録なし",
    technicalCategories: {
      longestDrive: { label: "Longest Drive", subtitle: "最長ドライブ" },
      nearestToPin: { label: "Nearest to Pin", subtitle: "ニアピン" },
      nearToTheLine: { label: "Near to the Line", subtitle: "ラインに最も近い" },
      longestPutt: { label: "Longest Putt", subtitle: "グリーン上の最長成功パット" },
    },
    groupLabel: (group) => (group === "male" ? "男子" : group === "female" ? "女子" : "総合"),
    finalResults: "最終結果",
    finalAnnouncement: "公式発表",
    championsTitle: "大会チャンピオン",
    noAwardRecipient: "受賞者はまだいません",
    podiumAria: "各ディビジョンの表彰台",
    podiumRankAlt: (rank) => `${rank}位`,
    podiumRank: (rank) => `${rank}位`,
    podiumDotsLabel: "ディビジョン位置",
    viewPodium: (label) => `${label}を見る`,
    holeInOnePrizeLabel: "ホールインワン賞品",
    rareMoment: "Rare Moment",
    technicalAwardsLabel: "Technical Awards",
    technicalAwardsTitle: "技術賞",
    specialRecognitionLabel: "Special Recognition",
    specialAwardsTitle: "特別賞",
    emptyTitle: "リーダーボードを読み込めません",
    snapshotNotFound: "この大会にはまだ公開スナップショットがありません。",
    publicDataUnavailable: "現在、公開データに接続できません。",
    officialLeaderboard: "公式リーダーボード",
    themePickerAria: "表示テーマを選択",
    themeAria: (label) => `テーマ ${label}`,
    languagePickerAria: "言語を選択",
    finalStatus: "Final",
    syncStatus: "Sync",
    liveStatus: "Live",
    leaderboardEnded: "リーダーボードは終了しました",
    usingLatestData: "最新データを表示中",
    confirmedScores: "確定スコア",
    updatedAtPrefix: "更新",
    finalLeaderboardAria: "リーダーボードは終了しました",
    refreshingDataAria: "データ更新中",
    autoRefreshAria: (seconds) => `${seconds}秒後に自動更新`,
    statusLabel: "状態",
    finishedStatus: "終了",
    loadingStatus: "読み込み中",
    refreshAfter: "次の更新",
    publicContentAria: "公開コンテンツ",
    leaderboardTab: "リーダーボード",
    holeScoresTab: "ホール別スコア",
    finalTab: "最終結果",
    championsAwardsTab: "チャンピオン & 賞",
    divisionPickerAria: "ディビジョンを選択",
    golferCount: (count) => `${count}名`,
    allGolfers: "全ゴルファー",
    scoreToggleAria: (mode) => `スコア表示を変更、現在は ${mode === "gross" ? "Gross" : "Over par"}`,
    scoreToggleTitle: "Gross / +/- を切替",
    leaderboardTableAria: "ゴルファーリーダーボード",
    rankHeader: "順位",
    golferHeader: "ゴルファー",
    resultHeader: "結果",
    scoresHeader: "ホール別スコア",
    golferFallback: "ゴルファー",
    groupPrefix: (group) => `組 ${group}`,
    bestShort: "Best",
    thru: "完了",
    toParShort: "+/-",
    scoreTooltip: (hole, par, score, term) => `${hole}番ホール · Par ${par} · Gross ${score} · ${term}`,
    emptyScoreTooltip: (hole, par) => `${hole}番ホール · Par ${par} · スコア未入力`,
    footerNote: "結果は大会組織委員会が再確認し、確定しています。",
  },
};

function getLiveNotificationTime(item: LiveNotificationItem) {
  return item.snapshotTime || item.createdAt || Date.now();
}

function formatLiveNotificationClock(timestamp: number, locale: string) {
  return new Date(timestamp).toLocaleTimeString(locale, {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatLiveNotificationDetail(
  item: LiveNotificationItem,
  now: number,
  copy: LiveTickerCopy,
  locale: string,
) {
  const timestamp = getLiveNotificationTime(item);
  const rank =
    item.rankBefore && item.rankAfter
      ? copy.rankMove(item.rankBefore, item.rankAfter)
      : copy.rankStable;
  return [
    formatLiveNotificationClock(timestamp, locale),
    item.division,
    `Gross ${item.strokes}`,
    formatDiff(item.holeDiff),
    rank,
    `(${copy.timeAgo(timestamp, now)})`,
  ].filter(Boolean).join(" · ");
}

function formatLiveNotificationAgo(timestamp: number, now: number, language: ShareLanguageId) {
  const seconds = Math.max(0, Math.floor((now - timestamp) / 1000));
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  if (language === "vi") {
    if (minutes < 1) return "cách đây <1 phút";
    if (hours < 1) return `cách đây ${minutes} phút`;
    return `cách đây ${hours} giờ`;
  }
  if (language === "ko") {
    if (minutes < 1) return "1분 미만 전";
    if (hours < 1) return `${minutes}분 전`;
    return `${hours}시간 전`;
  }
  if (language === "zh") {
    if (minutes < 1) return "不到1分钟前";
    if (hours < 1) return `${minutes}分钟前`;
    return `${hours}小时前`;
  }
  if (language === "ja") {
    if (minutes < 1) return "1分未満前";
    if (hours < 1) return `${minutes}分前`;
    return `${hours}時間前`;
  }
  if (minutes < 1) return "<1 min ago";
  if (hours < 1) return `${minutes} min ago`;
  return `${hours}h ago`;
}

const LIVE_TICKER_COPY: Record<ShareLanguageId, LiveTickerCopy> = {
  vi: {
    ariaLabel: "Ticker sự kiện nổi bật",
    liveLabel: "MỚI",
    pausedLabel: "TẠM DỪNG",
    idleCategory: "Điểm live",
    emptyTitle: "Bảng điểm đang cập nhật",
    emptyDetail: "Điểm đã xác nhận từ Ban Tổ Chức",
    pauseAria: "Tạm dừng ticker sự kiện",
    resumeAria: "Tiếp tục ticker sự kiện",
    category: {
      ace: "Cú đánh hiếm",
      brilliant: "Xuất thần",
      damage: "Cảnh báo",
      rank: "Đổi hạng",
    },
    headline: (item) => {
      const score = `Ghi điểm ${formatDiff(item.holeDiff)}`;
      if (item.tone === "rank") {
        return `${item.playerName} ${item.headlinePhrase} trong ${item.division} ở H${item.hole}. ${score}`;
      }
      return `${item.playerName} ${item.headlinePhrase} ở H${item.hole}. ${score}`;
    },
    detail: (item, now) => formatLiveNotificationDetail(item, now, LIVE_TICKER_COPY.vi, "vi-VN"),
    rankMove: (from, to) => `hạng trong bảng ${from} → ${to}`,
    rankStable: "không đổi hạng",
    timeAgo: (timestamp, now) => formatLiveNotificationAgo(timestamp, now, "vi"),
    eventCount: (count) => `${count} sự kiện`,
    settingsAria: "Cài đặt ticker sự kiện",
    settingsTitle: "Giữ sự kiện",
    retentionTime: "Theo thời gian",
    retentionCount: "Theo số lượng",
    keepMinutesLabel: "Giữ trong",
    keepItemsLabel: "Giữ tối đa",
    minutesUnit: "phút",
    itemsUnit: "sự kiện",
    clearEvents: "Xóa sự kiện",
  },
  en: {
    ariaLabel: "Featured event ticker",
    liveLabel: "NEW",
    pausedLabel: "PAUSED",
    idleCategory: "Live scoring",
    emptyTitle: "Live scores are updating",
    emptyDetail: "Confirmed scores from tournament operations",
    pauseAria: "Pause event ticker",
    resumeAria: "Resume event ticker",
    category: {
      ace: "Rare shot",
      brilliant: "Brilliant",
      damage: "Alert",
      rank: "Rank move",
    },
    headline: (item) => {
      if (item.tone === "ace") return `${item.playerName} creates a rare moment on H${item.hole}`;
      if (item.tone === "damage") return `${item.playerName} takes a heavy score on H${item.hole}`;
      if (item.tone === "rank") return `${item.playerName} shakes up the standings`;
      return `${item.playerName} makes ${item.term} on H${item.hole}`;
    },
    detail: (item, now) => formatLiveNotificationDetail(item, now, LIVE_TICKER_COPY.en, "en-US"),
    rankMove: (from, to) => `rank ${from} → ${to}`,
    rankStable: "rank unchanged",
    timeAgo: (timestamp, now) => formatLiveNotificationAgo(timestamp, now, "en"),
    eventCount: (count) => `${count} events`,
    settingsAria: "Event ticker settings",
    settingsTitle: "Keep events",
    retentionTime: "By time",
    retentionCount: "By count",
    keepMinutesLabel: "Keep for",
    keepItemsLabel: "Keep max",
    minutesUnit: "min",
    itemsUnit: "events",
    clearEvents: "Clear events",
  },
  ko: {
    ariaLabel: "주요 이벤트 티커",
    liveLabel: "NEW",
    pausedLabel: "PAUSED",
    idleCategory: "라이브 스코어",
    emptyTitle: "라이브 스코어 업데이트 중",
    emptyDetail: "운영진이 확정한 스코어",
    pauseAria: "이벤트 티커 일시정지",
    resumeAria: "이벤트 티커 다시 시작",
    category: {
      ace: "희귀 샷",
      brilliant: "하이라이트",
      damage: "경고",
      rank: "순위 변동",
    },
    headline: (item) => {
      if (item.tone === "ace") return `${item.playerName} H${item.hole}에서 특별한 순간`;
      if (item.tone === "damage") return `${item.playerName} H${item.hole}에서 큰 타수`;
      if (item.tone === "rank") return `${item.playerName} 순위표에 변동 발생`;
      return `${item.playerName} H${item.hole} ${item.term}`;
    },
    detail: (item, now) => formatLiveNotificationDetail(item, now, LIVE_TICKER_COPY.ko, "ko-KR"),
    rankMove: (from, to) => `${from}위 → ${to}위`,
    rankStable: "순위 유지",
    timeAgo: (timestamp, now) => formatLiveNotificationAgo(timestamp, now, "ko"),
    eventCount: (count) => `${count}개 이벤트`,
    settingsAria: "이벤트 티커 설정",
    settingsTitle: "이벤트 보관",
    retentionTime: "시간 기준",
    retentionCount: "개수 기준",
    keepMinutesLabel: "보관 시간",
    keepItemsLabel: "최대 보관",
    minutesUnit: "분",
    itemsUnit: "개",
    clearEvents: "이벤트 삭제",
  },
  zh: {
    ariaLabel: "重点事件滚动条",
    liveLabel: "NEW",
    pausedLabel: "PAUSED",
    idleCategory: "实时计分",
    emptyTitle: "实时成绩更新中",
    emptyDetail: "赛事运营确认的成绩",
    pauseAria: "暂停事件滚动条",
    resumeAria: "继续事件滚动条",
    category: {
      ace: "罕见一击",
      brilliant: "高光",
      damage: "警报",
      rank: "排名变化",
    },
    headline: (item) => {
      if (item.tone === "ace") return `${item.playerName} 在 H${item.hole} 打出罕见时刻`;
      if (item.tone === "damage") return `${item.playerName} 在 H${item.hole} 遭遇重分`;
      if (item.tone === "rank") return `${item.playerName} 改变排行榜走势`;
      return `${item.playerName} 在 H${item.hole} 打出 ${item.term}`;
    },
    detail: (item, now) => formatLiveNotificationDetail(item, now, LIVE_TICKER_COPY.zh, "zh-CN"),
    rankMove: (from, to) => `排名 ${from} → ${to}`,
    rankStable: "排名不变",
    timeAgo: (timestamp, now) => formatLiveNotificationAgo(timestamp, now, "zh"),
    eventCount: (count) => `${count} 条事件`,
    settingsAria: "事件滚动设置",
    settingsTitle: "保留事件",
    retentionTime: "按时间",
    retentionCount: "按数量",
    keepMinutesLabel: "保留",
    keepItemsLabel: "最多",
    minutesUnit: "分钟",
    itemsUnit: "条",
    clearEvents: "清除事件",
  },
  ja: {
    ariaLabel: "注目イベントティッカー",
    liveLabel: "NEW",
    pausedLabel: "PAUSED",
    idleCategory: "ライブスコア",
    emptyTitle: "ライブスコア更新中",
    emptyDetail: "大会運営が確認したスコア",
    pauseAria: "イベントティッカーを一時停止",
    resumeAria: "イベントティッカーを再開",
    category: {
      ace: "レアショット",
      brilliant: "ハイライト",
      damage: "アラート",
      rank: "順位変動",
    },
    headline: (item) => {
      if (item.tone === "ace") return `${item.playerName} が H${item.hole} で特別な一打`;
      if (item.tone === "damage") return `${item.playerName} が H${item.hole} で重いスコア`;
      if (item.tone === "rank") return `${item.playerName} が順位表を動かしました`;
      return `${item.playerName} が H${item.hole} で ${item.term}`;
    },
    detail: (item, now) => formatLiveNotificationDetail(item, now, LIVE_TICKER_COPY.ja, "ja-JP"),
    rankMove: (from, to) => `${from}位 → ${to}位`,
    rankStable: "順位変動なし",
    timeAgo: (timestamp, now) => formatLiveNotificationAgo(timestamp, now, "ja"),
    eventCount: (count) => `${count}件`,
    settingsAria: "イベントティッカー設定",
    settingsTitle: "イベント保持",
    retentionTime: "時間",
    retentionCount: "件数",
    keepMinutesLabel: "保持時間",
    keepItemsLabel: "最大件数",
    minutesUnit: "分",
    itemsUnit: "件",
    clearEvents: "イベント削除",
  },
};

function normalizeRefreshMs(value: unknown, fallback = DEFAULT_REFRESH_MS, min = MIN_REFRESH_MS) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(MAX_REFRESH_MS, Math.max(min, Math.trunc(parsed)));
}

function isSimulatorSnapshot(snapshot: PublicLeaderboardState | null) {
  return Boolean(
    snapshot?.simulator?.localOnly === true ||
      snapshot?.tournament?.operatorName === "LB Simulator" ||
      /^SIM Blind Competition\b/i.test(snapshot?.tournament?.name || ""),
  );
}

function getSnapshotRefreshMs(snapshot: PublicLeaderboardState | null) {
  if (!snapshot) return MISSING_SNAPSHOT_REFRESH_MS;
  const simulatorRefreshMs =
    snapshot?.sync?.simulatorRefreshMs ??
    snapshot?.simulator?.debugRefreshMs ??
    (snapshot?.simulator?.liveSeconds ? Number(snapshot.simulator.liveSeconds) * 1000 : undefined);
  if (simulatorRefreshMs) return normalizeRefreshMs(simulatorRefreshMs, DEFAULT_REFRESH_MS, 1_000);
  return normalizeRefreshMs(
    snapshot?.sync?.publicRefreshMs ??
      snapshot?.sync?.publicPollMs ??
      snapshot?.sync?.snapshotAutoPublishMs,
  );
}

function getExpectedHoleCount(snapshot: PublicLeaderboardState | null) {
  return snapshot?.course?.holes?.length || 18;
}

function isScoredHole(value: unknown) {
  return value !== null && value !== "" && Number.isFinite(Number(value));
}

function isRowComplete(row: PublicLeaderboardPlayer, expectedHoleCount: number) {
  if (row.holesPlayed >= expectedHoleCount) return true;
  const scores = row.holeScores || {};
  return Array.from({ length: expectedHoleCount }, (_, index) => index + 1).every((hole) =>
    isScoredHole(scores[String(hole)] ?? scores[hole]),
  );
}

function isLeaderboardComplete(snapshot: PublicLeaderboardState | null) {
  if (!snapshot?.leaderboard?.length) return false;
  const expectedHoleCount = getExpectedHoleCount(snapshot);
  return snapshot.leaderboard.every((row) => isRowComplete(row, expectedHoleCount));
}

function isLeaderboardFinal(snapshot: PublicLeaderboardState | null) {
  if (!snapshot) return false;
  return snapshot.finalResults?.status === "published" || isLeaderboardComplete(snapshot);
}

function shouldStopAutoRefresh(snapshot: PublicLeaderboardState | null) {
  if (snapshot?.finalResults?.status !== "published") return false;
  const updatedAt = new Date(snapshot.tournament.updatedAt || "").getTime();
  if (Number.isFinite(updatedAt) && Date.now() - updatedAt < 4 * 60 * 60 * 1000) {
    return false;
  }
  return true;
}

function formatCountdown(seconds: number) {
  const safeSeconds = Math.max(0, Math.trunc(seconds));
  const minutes = Math.floor(safeSeconds / 60);
  const remainingSeconds = safeSeconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(remainingSeconds).padStart(2, "0")}`;
}

function isShareThemeId(value: string | null): value is ShareThemeId {
  return SHARE_THEMES.some((theme) => theme.id === value);
}

function isShareLanguageId(value: string | null): value is ShareLanguageId {
  return SHARE_LANGUAGES.some((language) => language.id === value);
}

function formatUpdatedAt(value: string | undefined, copy: ShareCopy) {
  if (!value) return copy.noUpdatedData;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return copy.noUpdatedData;
  return new Intl.DateTimeFormat(copy.locale, {
    hour: "2-digit",
    minute: "2-digit",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(date);
}

function formatNumber(value?: number) {
  return Number.isFinite(value) ? String(value).replace(/\.0$/, "") : "-";
}

function formatDiff(value?: number) {
  if (!Number.isFinite(value)) return "-";
  return Number(value) > 0 ? `+${value}` : String(value);
}

function formatHoleToPar(score: unknown, par: number) {
  const numericScore = Number(score);
  const numericPar = Number(par);
  if (!Number.isFinite(numericScore) || !Number.isFinite(numericPar) || numericScore <= 0 || numericPar <= 0) {
    return "";
  }
  const diff = numericScore - numericPar;
  if (diff === 0) return "0";
  return diff > 0 ? `+${diff}` : String(diff);
}

function formatHoleScoreTerm(score: unknown, par: number, copy: ShareCopy) {
  const numericScore = Number(score);
  const numericPar = Number(par);
  if (!Number.isFinite(numericScore) || !Number.isFinite(numericPar)) return copy.noScore;

  const strokes = Math.trunc(numericScore);
  const holePar = Math.trunc(numericPar);
  if (strokes <= 0 || holePar <= 0) return copy.noScore;

  const diff = strokes - holePar;
  if (strokes === 1) {
    return "HIO";
  }

  const bogeyTerms: Record<number, string> = {
    1: "Bogey",
    2: "Double",
    3: "Triple",
    4: "Quadruple",
    5: "Quintuple",
    6: "Sextuple",
    7: "Septuple",
    8: "Octuple",
  };
  if (strokes === holePar * 2 && diff > 0) {
    return "Double par";
  }

  const scoringTerms: Record<number, string> = {
    [-4]: "Condor",
    [-3]: "Albatross",
    [-2]: "Eagle",
    [-1]: "Birdie",
    0: "Par",
    ...bogeyTerms,
  };
  return scoringTerms[diff] || `${diff > 0 ? "+" : ""}${diff}`;
}

function getPlayerNetMetric(row: PublicLeaderboardPlayer, isSystem36: boolean) {
  if (row.scoringMode === "stroke_gross") return row.gross;
  return isSystem36 ? row.system36Net : row.net;
}

function getPlayerHandicapMetric(row: PublicLeaderboardPlayer, isSystem36: boolean) {
  return isSystem36 ? row.system36Handicap : row.handicap;
}

function getLeaderboardToPar(row: PublicLeaderboardPlayer, isSystem36: boolean) {
  const net = Number(getPlayerNetMetric(row, isSystem36));
  const gross = Number(row.gross);
  const grossToPar = Number(row.toPar);
  if (![net, gross, grossToPar].every(Number.isFinite) || row.holesPlayed <= 0) {
    return undefined;
  }

  const parPlayed = gross - grossToPar;
  return net - parPlayed;
}

function getFinalNetCutLimit(finalResults: PublicFinalResults) {
  const value = Number(finalResults.netCutLimit);
  if (!Number.isFinite(value)) return null;
  const limit = Math.trunc(value);
  return limit <= -1 && limit >= -8 ? limit : null;
}

function getFinalPodiumScoreLine(
  player: PublicLeaderboardPlayer | null,
  isSystem36: boolean,
  finalResults: PublicFinalResults,
  copy: ShareCopy,
) {
  if (!player) return copy.noGolfer;

  const rawNet = Number(getPlayerNetMetric(player, isSystem36));
  const rawToPar = getLeaderboardToPar(player, isSystem36);
  const cutLimit = getFinalNetCutLimit(finalResults);
  const cutApplied = Boolean(
    cutLimit !== null &&
      finalResults.netCutAppliedPlayerIds?.includes(player.playerId) &&
      Number.isFinite(rawNet) &&
      Number.isFinite(rawToPar),
  );
  const appliedCutLimit = cutApplied && cutLimit !== null ? cutLimit : undefined;
  const finalNet = appliedCutLimit !== undefined ? rawNet + (appliedCutLimit - Number(rawToPar)) : rawNet;
  const finalToPar = appliedCutLimit ?? rawToPar;
  const cutNote = cutApplied ? ` · ${copy.cutFrom} ${formatDiff(rawToPar)}` : "";

  return `Gross ${formatNumber(player.gross)} · Net ${formatNumber(finalNet)} · ${copy.toParShort} ${formatDiff(finalToPar)}${cutNote}`;
}

function getDivision(row: PublicLeaderboardPlayer, copy: ShareCopy) {
  return String(row.division || row.flight || copy.noDivision).trim();
}

function getRowKey(row: PublicLeaderboardPlayer) {
  return String(row.playerId || row.golferId || row.name || "").trim();
}

function getScoreKey(row: PublicLeaderboardPlayer, hole: number) {
  return `${getRowKey(row)}:${hole}`;
}

function getScoreValue(row: PublicLeaderboardPlayer, hole: number) {
  const scores = row.holeScores || {};
  return scores[String(hole)] ?? scores[hole] ?? null;
}

function getFrontBackGross(row: PublicLeaderboardPlayer, holes: { hole: number; par: number }[]) {
  let front = 0;
  let back = 0;
  let frontPlayed = 0;
  let backPlayed = 0;
  for (const { hole } of holes) {
    const val = Number(getScoreValue(row, hole));
    if (Number.isFinite(val) && val > 0) {
      if (hole <= 9) { front += val; frontPlayed++; }
      else { back += val; backPlayed++; }
    }
  }
  return {
    front: frontPlayed > 0 ? front : null,
    back: backPlayed > 0 ? back : null,
  };
}

function getDefaultDivision(snapshot: PublicLeaderboardState | null) {
  return snapshot?.divisionLeaderboards?.reduce(
    (largest, item) => (item.rows.length > largest.rows.length ? item : largest),
    snapshot.divisionLeaderboards[0],
  )?.division || "";
}

function getLocalSnapshot(slug: string) {
  try {
    const snapshots = JSON.parse(localStorage.getItem(LOCAL_SNAPSHOT_KEY) || "{}") as Record<
      string,
      PublicLeaderboardState
    >;
    return snapshots[slug] || snapshots[slug.toUpperCase()] || snapshots[slug.toLowerCase()] || null;
  } catch {
    return null;
  }
}

function getLanSnapshotUrl(slug: string) {
  if (typeof window === "undefined") return "";
  const cleanSlug = slug.trim();
  if (!cleanSlug) return "";
  const configured = (window as typeof window & {
    ENV?: { LOCAL_SNAPSHOT_SERVER_URL?: string };
  }).ENV?.LOCAL_SNAPSHOT_SERVER_URL?.trim().replace(/\/+$/, "");
  const hostname = window.location.hostname.toLowerCase();
  const privateIpv4 = /^10\./.test(hostname)
    || /^192\.168\./.test(hostname)
    || (() => {
      const match = hostname.match(/^172\.(\d+)\./);
      return !!match && Number(match[1]) >= 16 && Number(match[1]) <= 31;
    })();
  const localRuntime = window.location.protocol === "http:"
    && window.location.port === "4222"
    && (
      hostname === "localhost"
      || hostname === "127.0.0.1"
      || hostname === "[::1]"
      || hostname === "::1"
      || privateIpv4
    );
  if (!configured && !localRuntime) return "";
  const baseUrl = configured || `${window.location.protocol}//${window.location.hostname}:4333`;
  return `${baseUrl}/snapshots/${encodeURIComponent(cleanSlug)}`;
}

async function fetchLanSnapshot(slug: string) {
  const endpoint = getLanSnapshotUrl(slug);
  if (!endpoint) return null;
  try {
    const response = await fetch(endpoint, {
      headers: { Accept: "application/json" },
      cache: "no-store",
    });
    const payload = (await response.json().catch(() => ({}))) as {
      ok?: boolean;
      snapshot?: PublicLeaderboardState;
    };
    if (!response.ok || !payload.ok || !payload.snapshot) return null;
    return payload.snapshot;
  } catch {
    return null;
  }
}

function publishLanSnapshot(snapshot: PublicLeaderboardState | null) {
  const endpoint = getLanSnapshotUrl(snapshot?.shareSlug || "");
  if (!endpoint || !snapshot) return;
  const body = JSON.stringify({ snapshot });
  void fetch(`/api/local-public-snapshot/${encodeURIComponent(snapshot.shareSlug)}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body,
  }).catch(() => {});
  void fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body,
  }).catch(() => {});
}

function getSnapshotUpdatedAtMs(snapshot: PublicLeaderboardState | null, fallback?: string) {
  const value = fallback || snapshot?.tournament?.updatedAt;
  if (!value) return 0;
  const time = new Date(value).getTime();
  return Number.isFinite(time) ? time : 0;
}

function isSnapshotNewer(
  candidate: PublicLeaderboardState | null,
  current: PublicLeaderboardState | null,
  candidateUpdatedAt?: string,
) {
  return getSnapshotUpdatedAtMs(candidate, candidateUpdatedAt) > getSnapshotUpdatedAtMs(current);
}

function getChangedScoreKeys(
  previous: PublicLeaderboardState | null,
  next: PublicLeaderboardState,
) {
  const changed = new Set<string>();
  if (!previous) return changed;
  const previousRows = new Map(previous.leaderboard.map((row) => [getRowKey(row), row]));
  next.leaderboard.forEach((row) => {
    const previousRow = previousRows.get(getRowKey(row));
    if (!previousRow) return;
    for (let hole = 1; hole <= 18; hole += 1) {
      if (getScoreValue(previousRow, hole) !== getScoreValue(row, hole)) {
        changed.add(getScoreKey(row, hole));
      }
    }
  });
  return changed;
}

function getPlacementRank(row: PublicLeaderboardPlayer) {
  if (typeof row.placementRank === "number") return row.placementRank;
  if (typeof row.rank === "number") return row.rank;
  const match = String(row.rank).match(/\d+/);
  return match ? parseInt(match[0], 10) : 0;
}

function clampInteger(value: unknown, fallback: number, min: number, max: number) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, Math.trunc(parsed)));
}

function getLiveNotificationConfig(snapshot: PublicLeaderboardState | null): LiveNotificationConfig {
  return {
    displayMs: clampInteger(
      snapshot?.sync?.liveNotificationDisplayMs,
      LIVE_NOTIFICATION_DEFAULT_DISPLAY_MS,
      LIVE_NOTIFICATION_MIN_DISPLAY_MS,
      LIVE_NOTIFICATION_MAX_DISPLAY_MS,
    ),
    maxAgeMs: clampInteger(
      snapshot?.sync?.liveNotificationMaxAgeMs,
      LIVE_NOTIFICATION_DEFAULT_MAX_AGE_MS,
      LIVE_NOTIFICATION_MIN_AGE_MS,
      LIVE_NOTIFICATION_MAX_AGE_MS,
    ),
    maxItems: clampInteger(
      snapshot?.sync?.liveNotificationMaxItems,
      LIVE_NOTIFICATION_DEFAULT_MAX_ITEMS,
      LIVE_NOTIFICATION_MIN_ITEMS,
      LIVE_NOTIFICATION_MAX_ITEMS,
    ),
    retentionMode:
      snapshot?.sync?.liveNotificationRetentionMode === "count"
        ? "count"
        : LIVE_NOTIFICATION_DEFAULT_RETENTION_MODE,
  };
}

function getLiveNotificationCourseHoles(snapshot: PublicLeaderboardState | null) {
  return snapshot?.course?.holes?.length
    ? snapshot.course.holes
    : Array.from({ length: 18 }, (_, index) => ({ hole: index + 1, par: 4 }));
}

function getCoursePar(holes: { hole: number; par: number }[], hole: number) {
  return holes.find((item) => item.hole === hole)?.par || 4;
}

function getScoredHoleDiffs(
  row: PublicLeaderboardPlayer | null | undefined,
  holes: { hole: number; par: number }[],
  excludeHole?: number,
) {
  if (!row) return [];
  return holes
    .filter(({ hole }) => hole !== excludeHole)
    .map(({ hole, par }) => {
      const score = Number(getScoreValue(row, hole));
      return Number.isFinite(score) && score > 0 ? score - par : null;
    })
    .filter((value): value is number => value !== null);
}

function average(values: number[]) {
  if (!values.length) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function getPlayerExpectedHoleDiff(row: PublicLeaderboardPlayer) {
  const isSystem36 = row.scoringMode === "system36" || row.isSystem36Division === true;
  const handicap = Number(getPlayerHandicapMetric(row, isSystem36) ?? row.handicapIndex ?? row.courseHandicap);
  if (!Number.isFinite(handicap)) return 1;
  return Math.max(-0.2, Math.min(3.4, handicap / 18));
}

function getPlayerFormBaseline(
  previousRow: PublicLeaderboardPlayer | null | undefined,
  nextRow: PublicLeaderboardPlayer,
  holes: { hole: number; par: number }[],
  hole: number,
) {
  const previousDiffs = getScoredHoleDiffs(previousRow, holes, hole);
  if (previousDiffs.length >= 3) return average(previousDiffs);
  const nextDiffs = getScoredHoleDiffs(nextRow, holes, hole);
  if (nextDiffs.length >= 3) return average(nextDiffs);
  return getPlayerExpectedHoleDiff(nextRow);
}

function getLiveNotificationNetCutLimit(snapshot: PublicLeaderboardState | null) {
  return snapshot?.finalResults?.status === "published" ? snapshot.finalResults.netCutLimit : undefined;
}

function buildLiveNotificationRankedLeaderboards(snapshot: PublicLeaderboardState | null) {
  const holes = getLiveNotificationCourseHoles(snapshot);
  const netCutLimit = getLiveNotificationNetCutLimit(snapshot);
  if (snapshot?.divisionLeaderboards?.length) {
    return snapshot.divisionLeaderboards.map((item) => ({
      ...item,
      rows: rankPublicLeaderboardRows(item.rows, holes, netCutLimit),
    }));
  }
  return buildPublicLeaderboardDivisionLeaderboards(snapshot?.leaderboard || [], holes, netCutLimit);
}

function getRankMap(snapshot: PublicLeaderboardState | null) {
  const rankMap = new Map<string, number>();
  buildLiveNotificationRankedLeaderboards(snapshot).forEach((leaderboard) => {
    leaderboard.rows.forEach((row) => {
      const key = getRowKey(row);
      const rank = getPlacementRank(row);
      if (key && rank > 0) rankMap.set(key, rank);
    });
  });
  return rankMap;
}

function makeLiveNotificationId(fingerprint: string, createdAt: number) {
  return `${fingerprint}:${createdAt}`;
}

function getLiveNotificationTone(input: {
  score: number;
  holeDiff: number;
  rankDelta: number;
  severity: number;
}): LiveNotificationTone {
  if (input.score === 1) return "ace";
  if (input.holeDiff < 0) return "brilliant";
  if (input.holeDiff > 1) return "damage";
  if (Math.abs(input.rankDelta) >= 2 || input.severity >= 68) return "rank";
  return "brilliant";
}

function scoreLiveNotification(input: {
  score: number;
  holeDiff: number;
  baselineDiff: number;
  expectedDiff: number;
  rankBefore?: number;
  rankAfter?: number;
  handicapDiff: number;
}) {
  const rankDelta = input.rankBefore && input.rankAfter ? input.rankBefore - input.rankAfter : 0;
  const rankImpact = Math.abs(rankDelta);
  const movedIntoTopThree = Boolean(input.rankBefore && input.rankAfter && input.rankBefore > 3 && input.rankAfter <= 3);
  const droppedFromTopThree = Boolean(input.rankBefore && input.rankAfter && input.rankBefore <= 3 && input.rankAfter > 3);
  const leaderChanged = Boolean(input.rankBefore && input.rankAfter && (input.rankBefore === 1 || input.rankAfter === 1) && input.rankBefore !== input.rankAfter);
  const isLowHandicap = input.handicapDiff <= 0.9;
  const isHighBaseline = input.baselineDiff >= 2.7;
  let severity = 0;

  if (input.score === 1) severity += 120;
  if (input.holeDiff <= -3) severity += 96;
  else if (input.holeDiff === -2) severity += 78;
  else if (input.holeDiff === -1) severity += input.baselineDiff >= 1.1 ? 56 : 36;

  if (input.holeDiff >= 5 && !isHighBaseline) severity += 74;
  else if (input.holeDiff >= 4 && input.baselineDiff <= 2.5) severity += 62;
  else if (input.holeDiff >= 3 && (isLowHandicap || input.baselineDiff <= 1.55 || rankImpact >= 2)) severity += 54;

  if (input.holeDiff - input.baselineDiff >= 2.5 && input.baselineDiff <= 2.3) severity += 18;
  if (input.holeDiff - input.expectedDiff >= 2.7 && input.expectedDiff <= 1.2) severity += 18;
  if (rankImpact >= 4) severity += 48;
  else if (rankImpact >= 2) severity += 30;
  else if (rankImpact === 1 && (movedIntoTopThree || droppedFromTopThree || leaderChanged)) severity += 22;
  if (movedIntoTopThree || droppedFromTopThree) severity += 28;
  if (leaderChanged) severity += 34;

  return {
    rankDelta,
    severity,
  };
}

function buildLiveNotificationsFromSnapshotChange(
  previous: PublicLeaderboardState | null,
  next: PublicLeaderboardState,
  nextUpdatedAt?: string,
) {
  if (!previous?.leaderboard?.length) return [];
  const holes = getLiveNotificationCourseHoles(next);
  const previousRows = new Map(previous.leaderboard.map((row) => [getRowKey(row), row]));
  const previousRankMap = getRankMap(previous);
  const nextRankMap = getRankMap(next);
  const createdAt = Date.now();
  const snapshotStamp = getSnapshotUpdatedAtMs(next, nextUpdatedAt) || createdAt;
  const events: LiveNotificationItem[] = [];

  next.leaderboard.forEach((row) => {
    const rowKey = getRowKey(row);
    const previousRow = previousRows.get(rowKey);
    if (!rowKey || !previousRow) return;

    holes.forEach(({ hole }) => {
      const previousScore = getScoreValue(previousRow, hole);
      const nextScore = getScoreValue(row, hole);
      if (previousScore === nextScore) return;
      const score = Number(nextScore);
      if (!Number.isFinite(score) || score <= 0) return;

      const par = getCoursePar(holes, hole);
      const holeDiff = score - par;
      const rankBefore = previousRankMap.get(rowKey);
      const rankAfter = nextRankMap.get(rowKey);
      const expectedDiff = getPlayerExpectedHoleDiff(row);
      const baselineDiff = getPlayerFormBaseline(previousRow, row, holes, hole);
      const { rankDelta, severity } = scoreLiveNotification({
        score,
        holeDiff,
        baselineDiff,
        expectedDiff,
        rankBefore,
        rankAfter,
        handicapDiff: expectedDiff,
      });

      if (severity < LIVE_NOTIFICATION_MIN_SEVERITY) return;

      const isSystem36 = row.scoringMode === "system36" || row.isSystem36Division === true;
      const term = formatHoleScoreTerm(score, par, SHARE_COPY.vi);
      const tone = getLiveNotificationTone({ score, holeDiff, rankDelta, severity });
      const fingerprint = [
        rowKey,
        `h${hole}`,
        `s${score}`,
        `r${rankBefore || 0}-${rankAfter || 0}`,
        snapshotStamp,
      ].join(":");

      events.push({
        id: makeLiveNotificationId(fingerprint, createdAt),
        fingerprint,
        createdAt,
        snapshotTime: snapshotStamp,
        tone,
        trend: rankDelta > 0 ? "up" : rankDelta < 0 ? "down" : "steady",
        severity,
        playerName: row.name || SHARE_COPY.vi.golferFallback,
        division: getDivision(row, SHARE_COPY.vi),
        hole,
        par,
        strokes: score,
        holeDiff,
        term,
        headlinePhrase: getLiveNotificationHeadlinePhrase(tone, fingerprint),
        holesPlayed: row.holesPlayed,
        gross: row.gross,
        net: getPlayerNetMetric(row, isSystem36),
        rankBefore,
        rankAfter,
      });
    });
  });

  return events.sort((left, right) => right.severity - left.severity || right.createdAt - left.createdAt).slice(0, 6);
}

function sortLiveNotifications(items: LiveNotificationItem[]) {
  return [...items].sort(
    (left, right) =>
      (right.createdAt || 0) - (left.createdAt || 0) ||
      (right.severity || 0) - (left.severity || 0),
  );
}

function normalizeLiveNotifications(value: unknown): LiveNotificationItem[] {
  if (!Array.isArray(value)) return [];
  return sortLiveNotifications(
    value
      .filter((item): item is Partial<LiveNotificationItem> => Boolean(item && typeof item === "object"))
      .map((item) => {
        const createdAt = Number(item.createdAt) || Date.now();
        const snapshotTime = Number(item.snapshotTime) || createdAt;
        return {
          id: String(item.id || item.fingerprint || `${item.playerName || "event"}:${createdAt}`),
          fingerprint: String(item.fingerprint || item.id || `${item.playerName || "event"}:${createdAt}`),
          createdAt,
          snapshotTime,
          tone: item.tone === "ace" || item.tone === "damage" || item.tone === "rank" ? item.tone : "brilliant",
          trend: item.trend === "up" || item.trend === "down" ? item.trend : "steady",
          severity: Number(item.severity) || 0,
          playerName: String(item.playerName || SHARE_COPY.vi.golferFallback),
          division: String(item.division || SHARE_COPY.vi.noDivision),
          hole: Number(item.hole) || 0,
          par: Number(item.par) || 4,
          strokes: Number(item.strokes) || 0,
          holeDiff: Number(item.holeDiff) || 0,
          term: String(item.term || ""),
          headlinePhrase: String(item.headlinePhrase || getLiveNotificationHeadlinePhrase("brilliant", String(item.fingerprint || item.id || createdAt))),
          holesPlayed: Number(item.holesPlayed) || 0,
          gross: typeof item.gross === "number" ? item.gross : undefined,
          net: typeof item.net === "number" ? item.net : undefined,
          rankBefore: typeof item.rankBefore === "number" ? item.rankBefore : undefined,
          rankAfter: typeof item.rankAfter === "number" ? item.rankAfter : undefined,
        };
      }),
  );
}

function pruneLiveNotifications(
  items: LiveNotificationItem[],
  config: LiveNotificationConfig,
  preserveIds = new Set<string>(),
) {
  const now = Date.now();
  const deduped = new Map<string, LiveNotificationItem>();
  sortLiveNotifications(items).forEach((item) => {
    const key = item.fingerprint || item.id;
    if (key && !deduped.has(key)) deduped.set(key, item);
  });
  const sourceItems = Array.from(deduped.values());
  const freshItems =
    config.retentionMode === "time"
      ? sourceItems.filter(
          (item) => preserveIds.has(item.id) || now - (item.createdAt || item.snapshotTime) <= config.maxAgeMs,
        )
      : sourceItems;
  const maxItems = config.retentionMode === "count" ? config.maxItems : LIVE_NOTIFICATION_MAX_ITEMS;
  const limited: LiveNotificationItem[] = [];
  freshItems.forEach((item) => {
    if (limited.length < maxItems || preserveIds.has(item.id)) {
      limited.push(item);
    }
  });
  return limited;
}

function getNextLiveNotificationId(items: LiveNotificationItem[], currentId: string | null) {
  if (!items.length) return null;
  if (!currentId) return items[0].id;
  const currentIndex = items.findIndex((item) => item.id === currentId);
  if (currentIndex < 0) return items[0].id;
  return items[(currentIndex + 1) % items.length]?.id || items[0].id;
}

function getValidQueuedLiveNotificationId(queue: string[], items: LiveNotificationItem[]) {
  const validIds = new Set(items.map((item) => item.id));
  while (queue.length) {
    const nextId = queue.shift() || "";
    if (validIds.has(nextId)) return nextId;
  }
  return null;
}

function getSnapshotLiveNotifications(snapshot: PublicLeaderboardState | null) {
  return normalizeLiveNotifications(snapshot?.liveNotifications);
}

function getInitialLiveNotifications(snapshot: PublicLeaderboardState | null) {
  return pruneLiveNotifications(getSnapshotLiveNotifications(snapshot), getLiveNotificationConfig(snapshot));
}

function LiveEventTicker({
  copy,
  item,
  itemCount,
  now,
  locked,
  paused,
  onHoverChange,
  onToggleLocked,
}: {
  copy: LiveTickerCopy;
  item: LiveNotificationItem | null;
  itemCount: number;
  now: number;
  locked: boolean;
  paused: boolean;
  onHoverChange: (paused: boolean) => void;
  onToggleLocked: () => void;
}) {
  const label = paused ? copy.pausedLabel : item ? copy.liveLabel : "LIVE";
  const title = item ? copy.headline(item) : copy.emptyTitle;
  const detail = item ? copy.detail(item, now) : copy.emptyDetail;
  const tone = item?.tone || "brilliant";

  return (
    <section className={styles.liveEventTickerShell} aria-label={copy.ariaLabel}>
      <button
        aria-label={locked ? copy.resumeAria : copy.pauseAria}
        aria-live="polite"
        aria-pressed={locked}
        className={styles.liveEventTicker}
        data-paused={paused ? "true" : undefined}
        data-tone={tone}
        onBlur={() => onHoverChange(false)}
        onClick={onToggleLocked}
        onFocus={() => onHoverChange(true)}
        onPointerEnter={(event) => {
          if (event.pointerType === "mouse") onHoverChange(true);
        }}
        onPointerLeave={(event) => {
          if (event.pointerType === "mouse") onHoverChange(false);
        }}
        title={locked ? copy.resumeAria : copy.pauseAria}
        type="button"
      >
        <span className={styles.liveTickerStatus}>
          <i aria-hidden="true" />
          <strong>{label}</strong>
        </span>
        <span className={styles.liveTickerBadge}>{item ? copy.category[item.tone] : copy.idleCategory}</span>
        <span className={styles.liveTickerViewport}>
          <span className={styles.liveTickerLine} key={item?.id || "idle"}>
            <strong>{title}</strong>
            <span>{detail}</span>
          </span>
        </span>
        <span className={styles.liveTickerMeta}>{copy.eventCount(itemCount)}</span>
      </button>
    </section>
  );
}

function getAwardPresentation(input: {
  isBestGross: boolean;
  awardPlacementRank?: number;
  copy: ShareCopy;
}): {
  assetId: AwardAssetId;
  label: string;
} | null {
  if (input.isBestGross) {
    return { assetId: "bestGross", label: "Best Gross" };
  }
  if (input.awardPlacementRank === 1) return { assetId: "rank1", label: input.copy.rankLabel(1) };
  if (input.awardPlacementRank === 2) return { assetId: "rank2", label: input.copy.rankLabel(2) };
  if (input.awardPlacementRank === 3) return { assetId: "rank3", label: input.copy.rankLabel(3) };
  return null;
}

function getFinalPlayer(snapshot: PublicLeaderboardState, playerId?: string) {
  if (!playerId) return null;
  const player = snapshot.leaderboard.find((row) => row.playerId === playerId) || null;
  return player
    ? recalculateSystem36PublicLeaderboardRow(player, snapshot.course?.holes || [])
    : null;
}

function formatAwardDetail(award: { hole?: string; distance?: string }, copy: ShareCopy) {
  const hole = String(award.hole || "").trim();
  const distance = String(award.distance || "").trim();
  const details = [];
  if (hole) details.push(/^\d+$/.test(hole) ? copy.holeLabel(hole) : hole);
  if (distance) details.push(/^\d+(?:[.,]\d+)?$/.test(distance) ? `${distance} m` : distance);
  return details.length ? details.join(" · ") : copy.noAwardDetail;
}

function FinalResultsView({
  snapshot,
  finalResults,
  awardAssetUrls,
  copy,
}: {
  snapshot: PublicLeaderboardState;
  finalResults: PublicFinalResults;
  awardAssetUrls: Record<AwardAssetId, string | null>;
  copy: ShareCopy;
}) {
  const bestGross = getFinalPlayer(snapshot, finalResults.bestGrossPlayerId);
  const technicalAwardCategories = [
    { key: "longestDrive", icon: "↗", awards: finalResults.longestDrive },
    { key: "nearestToPin", icon: "◎", awards: finalResults.nearestToPin },
    { key: "nearToTheLine", icon: "╱", awards: finalResults.nearToTheLine || [] },
    { key: "longestPutt", icon: "•", awards: finalResults.longestPutt || [] },
  ] as const;
  const visibleTechnicalAwardCategories = technicalAwardCategories.filter((category) => category.awards.length > 0);
  const hasTechnicalAwards = visibleTechnicalAwardCategories.length > 0;
  const holeInOneAwards = (finalResults.holeInOneAwards || []).filter(
    (award) => award.playerId && award.hole && award.prizes?.length,
  );
  const hasHoleInOneAwards = holeInOneAwards.length > 0;
  const isBestGrossSystem36 = bestGross
    ? bestGross.scoringMode === "system36" || bestGross.isSystem36Division === true
    : false;
  const bestGrossNet = bestGross ? getPlayerNetMetric(bestGross, isBestGrossSystem36) : undefined;
  const bestGrossToPar = bestGross
    ? getLeaderboardToPar(bestGross, isBestGrossSystem36)
    : undefined;
  const bestGrossNameLength = [...(bestGross?.name || "")].length;
  const bestGrossShift = Math.max(88, Math.min(122, 100 + (bestGrossNameLength - 14) * 1.45));
  const finalHeroStyle = {
    "--best-gross-shift": `-${bestGrossShift}%`,
    "--best-gross-shift-overshoot": `-${bestGrossShift + 15}%`,
    "--best-gross-shift-settle": `-${bestGrossShift - 4}%`,
  } as CSSProperties;
  const podiumSlots = [
    { rank: 2, field: "rank2PlayerId" as const, assetId: "rank2" as const },
    { rank: 1, field: "rank1PlayerId" as const, assetId: "rank1" as const },
    { rank: 3, field: "rank3PlayerId" as const, assetId: "rank3" as const },
  ];
  const [activePodiumIndex, setActivePodiumIndex] = useState(0);
  const [podiumSwipeDirection, setPodiumSwipeDirection] = useState<"next" | "prev">("next");
  const [podiumHoverNavSide, setPodiumHoverNavSide] = useState<"prev" | "next" | "none">("none");
  const [podiumDotsFlashKey, setPodiumDotsFlashKey] = useState(0);
  const podiumDragStartRef = useRef<{ x: number; y: number; pointerId: number } | null>(null);
  const podiumDragSuppressClickRef = useRef(false);
  const podiumCount = finalResults.podiums.length;
  const activePodium = finalResults.podiums[activePodiumIndex] || finalResults.podiums[0];
  const activePodiumSlots = activePodium
    ? podiumSlots.filter((slot) => getFinalPlayer(snapshot, activePodium[slot.field]))
    : [];
  const hasMultiplePodiums = podiumCount > 1;

  useEffect(() => {
    if (podiumCount === 0) return;
    setActivePodiumIndex((current) => Math.min(current, podiumCount - 1));
  }, [podiumCount]);

  const showPodium = (direction: "next" | "prev") => {
    if (podiumCount <= 1) return;
    setPodiumSwipeDirection(direction);
    setActivePodiumIndex((current) =>
      direction === "next"
        ? (current + 1) % podiumCount
        : (current - 1 + podiumCount) % podiumCount,
    );
    setPodiumDotsFlashKey((current) => current + 1);
  };

  const handlePodiumCarouselClick = (event: MouseEvent<HTMLDivElement>) => {
    if (!hasMultiplePodiums) return;

    if (podiumDragSuppressClickRef.current) {
      podiumDragSuppressClickRef.current = false;
      return;
    }

    const target = event.target as HTMLElement;
    if (target.closest("[data-podium-card='true']") || target.closest("[data-podium-dots='true']")) {
      return;
    }

    const rect = event.currentTarget.getBoundingClientRect();
    const clickX = event.clientX - rect.left;
    const sideZoneWidth = Math.min(52, rect.width * 0.1);
    if (clickX <= sideZoneWidth) {
      showPodium("prev");
    } else if (clickX >= rect.width - sideZoneWidth) {
      showPodium("next");
    }
  };

  const handlePodiumPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (!hasMultiplePodiums) return;

    const target = event.target as HTMLElement;
    if (target.closest("[data-podium-dots='true']")) return;

    podiumDragStartRef.current = { x: event.clientX, y: event.clientY, pointerId: event.pointerId };
    podiumDragSuppressClickRef.current = false;
    event.currentTarget.setPointerCapture?.(event.pointerId);
  };

  const handlePodiumPointerUp = (event: PointerEvent<HTMLDivElement>) => {
    const dragStart = podiumDragStartRef.current;
    podiumDragStartRef.current = null;
    if (!hasMultiplePodiums || !dragStart || dragStart.pointerId !== event.pointerId) return;

    event.currentTarget.releasePointerCapture?.(event.pointerId);
    const deltaX = event.clientX - dragStart.x;
    const deltaY = event.clientY - dragStart.y;
    const isIntentionalSwipe = Math.abs(deltaX) >= 54 && Math.abs(deltaX) > Math.abs(deltaY) * 1.25;
    if (!isIntentionalSwipe) return;

    podiumDragSuppressClickRef.current = true;
    showPodium(deltaX < 0 ? "next" : "prev");
  };

  const handlePodiumPointerCancel = (event: PointerEvent<HTMLDivElement>) => {
    podiumDragStartRef.current = null;
    event.currentTarget.releasePointerCapture?.(event.pointerId);
  };

  const handlePodiumCarouselMouseMove = (event: MouseEvent<HTMLDivElement>) => {
    if (!hasMultiplePodiums) return;

    const rect = event.currentTarget.getBoundingClientRect();
    const hoverX = event.clientX - rect.left;
    const sideZoneWidth = Math.min(52, rect.width * 0.1);
    const nextSide = hoverX <= sideZoneWidth ? "prev" : hoverX >= rect.width - sideZoneWidth ? "next" : "none";
    setPodiumHoverNavSide((current) => (current === nextSide ? current : nextSide));
  };

  return (
    <section className={styles.finalResults} aria-label={copy.finalResults}>
      <header className={styles.finalHero} style={finalHeroStyle}>
        <div className={styles.finalHeroCopy}>
          <span>{copy.finalAnnouncement}</span>
          <h2>{copy.championsTitle}</h2>
        </div>
        <article className={styles.bestGrossChampion}>
          {awardAssetUrls.bestGross ? (
            <img alt="Best Gross" height="160" src={awardAssetUrls.bestGross} width="160" />
          ) : null}
          <div>
            <span>Best Gross</span>
            <strong>{bestGross?.name || "—"}</strong>
            <small>
              {bestGross
                ? `Gross ${formatNumber(bestGross.gross)} · Net ${formatNumber(bestGrossNet)} · ${copy.toParShort} ${formatDiff(bestGrossToPar)}`
                : copy.noAwardRecipient}
            </small>
          </div>
        </article>
      </header>

      <section className={styles.finalPodiumArena} aria-label={copy.podiumAria}>
        {activePodium ? (
          <div
            className={styles.finalPodiumCarousel}
            data-hover-nav={podiumHoverNavSide}
            data-swipe-direction={podiumSwipeDirection}
            onClick={handlePodiumCarouselClick}
            onMouseLeave={() => setPodiumHoverNavSide("none")}
            onMouseMove={handlePodiumCarouselMouseMove}
            onPointerCancel={handlePodiumPointerCancel}
            onPointerDown={handlePodiumPointerDown}
            onPointerUp={handlePodiumPointerUp}
          >
            {hasMultiplePodiums ? (
              <button
                aria-hidden="true"
                className={`${styles.podiumNavButton} ${styles.podiumNavPrev}`}
                tabIndex={-1}
                type="button"
              >
                ‹
              </button>
            ) : null}

            <section
              className={styles.finalPodiumGroup}
              key={activePodium.key}
              aria-label={`Podium ${activePodium.label}`}
            >
              <div className={styles.podiumStage} data-count={activePodiumSlots.length}>
                {activePodiumSlots.map((slot) => {
                  const player = getFinalPlayer(snapshot, activePodium[slot.field]);
                  const isPlayerSystem36 = player
                    ? player.scoringMode === "system36" || player.isSystem36Division === true
                    : false;
                  return (
                    <div className={styles[`podiumRank${slot.rank}`]} data-podium-card="true" key={slot.rank}>
                      <svg
                        aria-hidden="true"
                        className={styles.podiumCircuit}
                        focusable="false"
                        preserveAspectRatio="none"
                        viewBox="0 0 100 100"
                      >
                        <path
                          className={styles.podiumCircuitTrack}
                          d="M 12 0.5 H 88 Q 99.5 0.5 99.5 12 V 88 Q 99.5 99.5 88 99.5 H 64"
                          pathLength="100"
                        />
                        <path
                          className={styles.podiumCircuitTrack}
                          d="M 36 99.5 H 12 Q 0.5 99.5 0.5 88 V 12 Q 0.5 0.5 12 0.5"
                          pathLength="100"
                        />
                        <path
                          className={styles.podiumCircuitMain}
                          d="M 12 0.5 H 88 Q 99.5 0.5 99.5 12 V 88 Q 99.5 99.5 88 99.5 H 64"
                          pathLength="100"
                        />
                        <path
                          className={styles.podiumCircuitMain}
                          d="M 36 99.5 H 12 Q 0.5 99.5 0.5 88 V 12 Q 0.5 0.5 12 0.5"
                          pathLength="100"
                        />
                      </svg>
                      {awardAssetUrls[slot.assetId] ? (
                        <img
                          alt={copy.podiumRankAlt(slot.rank)}
                          height="128"
                          src={awardAssetUrls[slot.assetId] || undefined}
                          width="128"
                        />
                      ) : null}
                      <span>{copy.podiumRank(slot.rank)}</span>
                      <strong>{player?.name || "—"}</strong>
                      <small>
                        {getFinalPodiumScoreLine(player, isPlayerSystem36, finalResults, copy)}
                      </small>
                      <i aria-hidden="true">{slot.rank}</i>
                      <svg
                        aria-hidden="true"
                        className={styles.podiumBadgeCircuit}
                        focusable="false"
                        viewBox="0 0 44 44"
                      >
                        <path
                          className={styles.podiumBadgeCircuitTrack}
                          d="M 3 22 L 7 12 L 16 4 L 28 4 L 37 12 L 41 22"
                          pathLength="100"
                        />
                        <path
                          className={styles.podiumBadgeCircuitTrack}
                          d="M 3 22 L 7 32 L 16 40 L 28 40 L 37 32 L 41 22"
                          pathLength="100"
                        />
                        <path
                          className={`${styles.podiumBadgeCircuitArc} ${styles.podiumBadgeCircuitArcClockwise}`}
                          d="M 3 22 L 7 12 L 16 4 L 28 4 L 37 12 L 41 22"
                          pathLength="100"
                        />
                        <path
                          className={`${styles.podiumBadgeCircuitArc} ${styles.podiumBadgeCircuitArcCounter}`}
                          d="M 3 22 L 7 32 L 16 40 L 28 40 L 37 32 L 41 22"
                          pathLength="100"
                        />
                      </svg>
                    </div>
                  );
                })}
              </div>
              <h3 className={styles.finalPodiumDivisionName}>{activePodium.label}</h3>
            </section>

            {hasMultiplePodiums ? (
              <button
                aria-hidden="true"
                className={`${styles.podiumNavButton} ${styles.podiumNavNext}`}
                tabIndex={-1}
                type="button"
              >
                ›
              </button>
            ) : null}

            {hasMultiplePodiums ? (
              <div
                className={styles.podiumCarouselDots}
                data-podium-dots="true"
                data-podium-dots-flash={podiumDotsFlashKey > 0 ? "true" : undefined}
                key={`podium-dots-${podiumDotsFlashKey}`}
                aria-label={copy.podiumDotsLabel}
              >
                {finalResults.podiums.map((podium, index) => (
                  <button
                    aria-label={copy.viewPodium(podium.label)}
                    aria-current={index === activePodiumIndex ? "true" : undefined}
                    key={podium.key}
                    onClick={() => {
                      setPodiumSwipeDirection(index > activePodiumIndex ? "next" : "prev");
                      setActivePodiumIndex(index);
                    }}
                    type="button"
                  />
                ))}
              </div>
            ) : null}
          </div>
        ) : null}
      </section>

      {hasHoleInOneAwards ? (
        <section className={styles.hioAwards} aria-label="Hole In One">
          <div className={styles.hioStageBackdrop} aria-hidden="true">
            <span />
            <span />
            <span />
          </div>
          <div className={styles.hioMotionStage} aria-hidden="true">
            <span className={styles.hioFlightArc} />
            <span className={styles.hioCup}>
              <i />
              <b />
            </span>
            <span className={styles.hioMotionShadow} />
            <span className={styles.hioMotionBall}>
              <span className={styles.hioBallSurface}>
                <i />
                <b />
              </span>
            </span>
            <span className={styles.hioCelebrationText}>Hole In One</span>
            <span className={styles.hioSparkField}>
              {Array.from({ length: 44 }, (_, sparkIndex) => (
                <i key={sparkIndex} />
              ))}
            </span>
          </div>
          <div className={styles.hioAwardsIntro}>
            <span>{copy.rareMoment}</span>
            <h3>Hole In One</h3>
          </div>
          <div className={styles.hioAwardGrid} data-count={Math.min(4, Math.max(1, holeInOneAwards.length))}>
            {holeInOneAwards.map((award, index) => {
              const player = getFinalPlayer(snapshot, award.playerId);
              const cleanPrizes = award.prizes.map((prize) => prize.trim()).filter(Boolean);
              const holeNumber = award.hole.replace(/^hố\s*/i, "").trim() || "HIO";
              return (
                <article
                  className={styles.hioAwardCard}
                  key={`${award.slot || index + 1}:${award.playerId}:${award.hole}`}
                  tabIndex={0}
                >
                  <div className={styles.hioOrb} aria-label={copy.holeLabel(holeNumber)}>
                    <span>{holeNumber}</span>
                  </div>
                  <div className={styles.hioAwardCopy}>
                    <small>HIO #{award.slot || index + 1}</small>
                    <strong>{player?.name || "—"}</strong>
                  </div>
                  <div className={styles.hioPrizeList} aria-label={copy.holeInOnePrizeLabel}>
                    {cleanPrizes.map((prize, prizeIndex) => (
                      <span key={`${prize}:${prizeIndex}`}>{prize}</span>
                    ))}
                  </div>
                </article>
              );
            })}
          </div>
        </section>
      ) : null}

      {hasTechnicalAwards ? (
        <section className={styles.technicalAwards}>
          <div className={styles.finalSectionHeading}>
            <span>{copy.technicalAwardsLabel}</span>
            <h3>{copy.technicalAwardsTitle}</h3>
          </div>
          <div className={styles.technicalAwardGroups}>
            {visibleTechnicalAwardCategories.map((category) => {
              const categoryCopy = copy.technicalCategories[category.key];
              return (
                <article className={styles.technicalAwardGroup} key={category.key}>
                  <header>
                    <span className={styles.technicalIcon} aria-hidden="true">
                      {category.icon}
                    </span>
                    <div>
                      <small>{categoryCopy.subtitle}</small>
                      <h4>{categoryCopy.label}</h4>
                    </div>
                  </header>
                  <div className={styles.technicalAwardList}>
                    {category.awards.map((award, index) => {
                    const player = getFinalPlayer(snapshot, award.playerId);
                    const ordinal = award.slot && award.slot > 1 ? ` #${award.slot}` : "";
                    return (
                      <div className={styles.technicalAwardItem} key={`${category.key}:${award.group}:${award.slot || index + 1}`}>
                        <span>{award.slot || index + 1}</span>
                        <div>
                          <small>{copy.groupLabel(award.group)}{ordinal}</small>
                          <strong>{player?.name || "—"}</strong>
                          <em>{formatAwardDetail(award, copy)}</em>
                        </div>
                      </div>
                    );
                    })}
                  </div>
                </article>
              );
            })}
          </div>
        </section>
      ) : null}

      {finalResults.specialAwards.length ? (
        <section className={styles.specialAwards}>
          <div className={styles.finalSectionHeading}>
            <span>{copy.specialRecognitionLabel}</span>
            <h3>{copy.specialAwardsTitle}</h3>
          </div>
          <div className={styles.specialAwardGrid}>
            {finalResults.specialAwards.map((award) => {
              const player = getFinalPlayer(snapshot, award.playerId);
              return (
                <article key={award.id}>
                  <span aria-hidden="true">✦</span>
                  <small>{award.name}</small>
                  <strong>{player?.name || "—"}</strong>
                  {award.note ? <p>{award.note}</p> : null}
                </article>
              );
            })}
          </div>
        </section>
      ) : null}
    </section>
  );
}

export function PublicLeaderboard({
  slug,
  initialSnapshot,
  initialUpdatedAt,
  initialError,
}: PublicLeaderboardProps) {
  const [snapshot, setSnapshot] = useState<PublicLeaderboardState | null>(initialSnapshot);
  const [updatedAt, setUpdatedAt] = useState(initialUpdatedAt);
  const [activeDivision, setActiveDivision] = useState(getDefaultDivision(initialSnapshot));
  const [activeView, setActiveView] = useState<ShareView>("leaderboard");
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [refreshFailed, setRefreshFailed] = useState(false);
  const [isMounted, setIsMounted] = useState(false);
  const [themeId, setThemeId] = useState<ShareThemeId>(DEFAULT_THEME_ID);
  const [languageId, setLanguageId] = useState<ShareLanguageId>(DEFAULT_LANGUAGE_ID);
  const [secondsUntilRefresh, setSecondsUntilRefresh] = useState(
    Math.ceil(getSnapshotRefreshMs(initialSnapshot) / 1000),
  );
  const [changedScoreKeys, setChangedScoreKeys] = useState<Set<string>>(() => new Set());
  const [scoreDisplayMode, setScoreDisplayMode] = useState<ScoreDisplayMode>("gross");
  const [scoreTooltip, setScoreTooltip] = useState<ScoreTooltip | null>(null);
  const [isHeaderCollapsed, setIsHeaderCollapsed] = useState(false);
  const [isHeaderExpanded, setIsHeaderExpanded] = useState(false);
  const [isMobileViewport, setIsMobileViewport] = useState(false);
  const [isMobileHeaderExpanded, setIsMobileHeaderExpanded] = useState(false);
  const [isThemeDropdownOpen, setIsThemeDropdownOpen] = useState(false);
  const [liveNotifications, setLiveNotifications] = useState<LiveNotificationItem[]>(() =>
    getInitialLiveNotifications(initialSnapshot),
  );
  const [activeLiveNotificationId, setActiveLiveNotificationId] = useState<string | null>(() =>
    getInitialLiveNotifications(initialSnapshot)[0]?.id || null,
  );
  const [liveTickerNow, setLiveTickerNow] = useState(() => Date.now());
  const [isLiveTickerHovered, setIsLiveTickerHovered] = useState(false);
  const [isLiveTickerLocked, setIsLiveTickerLocked] = useState(false);
  const awardAssetUrls = useAwardAssetUrls(Boolean(snapshot));
  const pageRef = useRef<HTMLElement>(null);
  const leaderboardRef = useRef<HTMLDivElement>(null);
  const themeDropdownRef = useRef<HTMLDivElement>(null);
  const refreshMsRef = useRef(getSnapshotRefreshMs(initialSnapshot));
  const nextRefreshAtRef = useRef<number | null>(null);
  const pendingFlipRowsRef = useRef<Map<string, RowPosition> | null>(null);
  const changedScoreTimerRef = useRef<number | null>(null);
  const scoreTooltipTimerRef = useRef<number | null>(null);
  const mobileHeaderCollapseTimerRef = useRef<number | null>(null);
  const scoreModeSwipeStartRef = useRef<{ x: number; y: number; identifier: number } | null>(null);
  const snapshotRef = useRef<PublicLeaderboardState | null>(initialSnapshot);
  const liveNotificationsRef = useRef<LiveNotificationItem[]>(liveNotifications);
  const activeLiveNotificationIdRef = useRef<string | null>(activeLiveNotificationId);
  const immediateLiveNotificationIdsRef = useRef<string[]>([]);
  const resumeLiveNotificationIdRef = useRef<string | null>(null);
  const copy = SHARE_COPY[languageId];
  const tickerCopy = LIVE_TICKER_COPY[languageId];
  const liveNotificationConfig = getLiveNotificationConfig(snapshot);
  const isLiveTickerPaused = isLiveTickerHovered || isLiveTickerLocked;
  const activeLiveNotification =
    liveNotifications.find((item) => item.id === activeLiveNotificationId) || liveNotifications[0] || null;

  function captureRowPositions() {
    const rows = leaderboardRef.current?.querySelectorAll<HTMLElement>("[data-row-key]");
    if (!rows?.length) return null;
    return Array.from(rows).reduce((positions, row) => {
      const key = row.dataset.rowKey;
      if (key) {
        positions.set(key, {
          rank: row.dataset.rank || "",
          rect: row.getBoundingClientRect(),
        });
      }
      return positions;
    }, new Map<string, RowPosition>());
  }

  const injectLiveNotifications = (
    incomingEvents: LiveNotificationItem[],
    config: LiveNotificationConfig,
  ) => {
    if (!incomingEvents.length) return;
    const activeId = activeLiveNotificationIdRef.current;
    const currentItems = liveNotificationsRef.current;
    if (activeId && currentItems.length && !resumeLiveNotificationIdRef.current) {
      resumeLiveNotificationIdRef.current = getNextLiveNotificationId(currentItems, activeId);
    }

    const incomingFingerprints = new Set(incomingEvents.map((event) => event.fingerprint));
    const incomingIds = incomingEvents.map((event) => event.id);
    immediateLiveNotificationIdsRef.current = [
      ...incomingIds,
      ...immediateLiveNotificationIdsRef.current.filter((id) => !incomingIds.includes(id)),
    ];

    const preserveIds = new Set([
      activeId,
      resumeLiveNotificationIdRef.current,
      ...immediateLiveNotificationIdsRef.current,
    ].filter((id): id is string => Boolean(id)));

    setLiveNotifications((current) => {
      const merged = [
        ...incomingEvents,
        ...current.filter((item) => !incomingFingerprints.has(item.fingerprint)),
      ];
      const pruned = pruneLiveNotifications(merged, config, preserveIds);
      liveNotificationsRef.current = pruned;
      if (!activeLiveNotificationIdRef.current && pruned[0]) {
        activeLiveNotificationIdRef.current = pruned[0].id;
        setActiveLiveNotificationId(pruned[0].id);
      }
      return pruned;
    });
  };

  const applySnapshotLiveNotifications = (
    nextSnapshot: PublicLeaderboardState,
    config: LiveNotificationConfig,
  ) => {
    const snapshotItems = getInitialLiveNotifications(nextSnapshot);
    const activeId = activeLiveNotificationIdRef.current;
    const currentItems = liveNotificationsRef.current;
    const currentIds = new Set(currentItems.map((item) => item.id));
    const incomingIds = snapshotItems
      .filter((item) => !currentIds.has(item.id))
      .map((item) => item.id);

    if (incomingIds.length && activeId && currentItems.length && !resumeLiveNotificationIdRef.current) {
      resumeLiveNotificationIdRef.current = getNextLiveNotificationId(currentItems, activeId);
    }

    if (incomingIds.length) {
      immediateLiveNotificationIdsRef.current = [
        ...incomingIds,
        ...immediateLiveNotificationIdsRef.current.filter((id) => !incomingIds.includes(id)),
      ];
    } else {
      immediateLiveNotificationIdsRef.current = immediateLiveNotificationIdsRef.current.filter((id) =>
        snapshotItems.some((item) => item.id === id),
      );
    }

    const pruned = pruneLiveNotifications(snapshotItems, config, new Set([activeId].filter((id): id is string => Boolean(id))));
    liveNotificationsRef.current = pruned;
    setLiveNotifications(pruned);
    if (!pruned.length) {
      activeLiveNotificationIdRef.current = null;
      setActiveLiveNotificationId(null);
      return;
    }
    if (!activeId || !pruned.some((item) => item.id === activeId)) {
      activeLiveNotificationIdRef.current = pruned[0].id;
      setActiveLiveNotificationId(pruned[0].id);
    }
  };

  useEffect(() => {
    setIsMounted(true);
    const mobileQuery = window.matchMedia("(max-width: 720px)");
    const syncMobileViewport = () => {
      setIsMobileViewport(mobileQuery.matches);
      if (!mobileQuery.matches) setIsMobileHeaderExpanded(false);
    };
    syncMobileViewport();
    mobileQuery.addEventListener("change", syncMobileViewport);
    try {
      const storedThemeId = localStorage.getItem(THEME_STORAGE_KEY);
      if (isShareThemeId(storedThemeId)) setThemeId(storedThemeId);
      const storedLanguageId = localStorage.getItem(LANGUAGE_STORAGE_KEY);
      if (isShareLanguageId(storedLanguageId)) setLanguageId(storedLanguageId);
    } catch {
      // Keep visual defaults when local storage is unavailable.
    }
    return () => mobileQuery.removeEventListener("change", syncMobileViewport);
  }, []);

  const selectTheme = (nextThemeId: ShareThemeId) => {
    setThemeId(nextThemeId);
    setIsThemeDropdownOpen(false);
    try {
      localStorage.setItem(THEME_STORAGE_KEY, nextThemeId);
    } catch {
      // Theme choice is cosmetic, so failures should never interrupt live scoring.
    }
  };

  useEffect(() => {
    if (!isThemeDropdownOpen) return;
    const handleOutsideClick = (event: globalThis.MouseEvent) => {
      if (themeDropdownRef.current && !themeDropdownRef.current.contains(event.target as Node)) {
        setIsThemeDropdownOpen(false);
      }
    };
    const handleEscape = (event: globalThis.KeyboardEvent) => {
      if (event.key === "Escape") setIsThemeDropdownOpen(false);
    };
    document.addEventListener("mousedown", handleOutsideClick);
    document.addEventListener("keydown", handleEscape);
    return () => {
      document.removeEventListener("mousedown", handleOutsideClick);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [isThemeDropdownOpen]);

  const selectLanguage = (nextLanguageId: ShareLanguageId) => {
    setLanguageId(nextLanguageId);
    try {
      localStorage.setItem(LANGUAGE_STORAGE_KEY, nextLanguageId);
    } catch {
      // Language choice is local UI state; live scoring should keep running.
    }
  };

  const clearScoreTooltipTimer = () => {
    if (scoreTooltipTimerRef.current) {
      window.clearTimeout(scoreTooltipTimerRef.current);
      scoreTooltipTimerRef.current = null;
    }
  };

  const hideScoreTooltip = () => {
    clearScoreTooltipTimer();
    setScoreTooltip(null);
  };

  const clearMobileHeaderCollapseTimer = () => {
    if (mobileHeaderCollapseTimerRef.current) {
      window.clearTimeout(mobileHeaderCollapseTimerRef.current);
      mobileHeaderCollapseTimerRef.current = null;
    }
  };

  const scheduleMobileHeaderCollapse = (delay = 2800) => {
    if (!isMobileViewport || !isMobileHeaderExpanded) return;
    clearMobileHeaderCollapseTimer();
    mobileHeaderCollapseTimerRef.current = window.setTimeout(() => {
      setIsMobileHeaderExpanded(false);
      mobileHeaderCollapseTimerRef.current = null;
    }, delay);
  };

  const showScoreTooltip = (target: HTMLElement, key: string, text: string, autoHide = false) => {
    clearScoreTooltipTimer();
    const rect = target.getBoundingClientRect();
    const tooltipWidth = Math.min(220, Math.max(160, window.innerWidth - 24));
    const x = Math.min(
      window.innerWidth - tooltipWidth / 2 - 12,
      Math.max(tooltipWidth / 2 + 12, rect.left + rect.width / 2),
    );
    const hasRoomAbove = rect.top >= 76;
    setScoreTooltip({
      key,
      text,
      x,
      y: hasRoomAbove ? rect.top - 10 : rect.bottom + 10,
      placement: hasRoomAbove ? "above" : "below",
    });
    if (autoHide) {
      scoreTooltipTimerRef.current = window.setTimeout(() => {
        setScoreTooltip(null);
        scoreTooltipTimerRef.current = null;
      }, 2400);
    }
  };

  const handlePageScroll = () => {
    const page = pageRef.current;
    if (!page) return;
    if (isMobileViewport) {
      scheduleMobileHeaderCollapse(900);
      return;
    }
    if (page.scrollTop <= 0) return;
    setIsHeaderExpanded(false);
    setIsHeaderCollapsed(true);
  };

  const handleContentActivity = () => {
    scheduleMobileHeaderCollapse(1100);
  };

  const toggleScoreDisplayMode = () => {
    setScoreDisplayMode((current) => (current === "gross" ? "overpar" : "gross"));
  };

  const handleScoreModeSwipeStart = (event: TouchEvent<HTMLElement>) => {
    if (!isMobileViewport || activeView !== "leaderboard" || event.touches.length !== 1) return;
    const target = event.target as HTMLElement;
    if (target.closest("button, a, input, select, textarea")) return;
    const touch = event.touches[0];
    scoreModeSwipeStartRef.current = {
      x: touch.clientX,
      y: touch.clientY,
      identifier: touch.identifier,
    };
  };

  const handleScoreModeSwipeEnd = (event: TouchEvent<HTMLElement>) => {
    const start = scoreModeSwipeStartRef.current;
    scoreModeSwipeStartRef.current = null;
    if (!start) return;
    const touch = Array.from(event.changedTouches).find((item) => item.identifier === start.identifier);
    if (!touch) return;

    const deltaX = touch.clientX - start.x;
    const deltaY = touch.clientY - start.y;
    if (Math.abs(deltaX) < 46 || Math.abs(deltaX) < Math.abs(deltaY) * 1.25) return;

    hideScoreTooltip();
    toggleScoreDisplayMode();
  };

  const handleScoreModeSwipeCancel = () => {
    scoreModeSwipeStartRef.current = null;
  };

  const isHeaderVisuallyCollapsed = isMobileViewport
    ? !isMobileHeaderExpanded
    : isHeaderCollapsed && !isHeaderExpanded;

  useEffect(() => {
    snapshotRef.current = snapshot;
    refreshMsRef.current = getSnapshotRefreshMs(snapshot);
  }, [snapshot]);

  useEffect(() => {
    liveNotificationsRef.current = liveNotifications;
  }, [liveNotifications]);

  useEffect(() => {
    const timer = window.setInterval(() => setLiveTickerNow(Date.now()), 30_000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    activeLiveNotificationIdRef.current = activeLiveNotificationId;
  }, [activeLiveNotificationId]);

  useEffect(() => {
    if (!liveNotifications.length) {
      if (activeLiveNotificationId !== null) setActiveLiveNotificationId(null);
      return;
    }
    if (!activeLiveNotificationId || !liveNotifications.some((item) => item.id === activeLiveNotificationId)) {
      setActiveLiveNotificationId(liveNotifications[0].id);
    }
  }, [activeLiveNotificationId, liveNotifications]);

  useEffect(() => {
    if (!activeLiveNotificationId || isLiveTickerPaused) return;
    const timer = window.setTimeout(() => {
      const config = getLiveNotificationConfig(snapshotRef.current);
      const preserveIds = new Set([
        activeLiveNotificationIdRef.current,
        resumeLiveNotificationIdRef.current,
        ...immediateLiveNotificationIdsRef.current,
      ].filter((id): id is string => Boolean(id)));
      const prunedItems = pruneLiveNotifications(liveNotificationsRef.current, config, preserveIds);
      if (prunedItems.length !== liveNotificationsRef.current.length) {
        liveNotificationsRef.current = prunedItems;
        setLiveNotifications(prunedItems);
      }
      if (!prunedItems.length) {
        setActiveLiveNotificationId(null);
        return;
      }

      const immediateId = getValidQueuedLiveNotificationId(
        immediateLiveNotificationIdsRef.current,
        prunedItems,
      );
      if (immediateId) {
        setActiveLiveNotificationId(immediateId);
        return;
      }

      const resumeId = resumeLiveNotificationIdRef.current;
      if (resumeId && prunedItems.some((item) => item.id === resumeId) && resumeId !== activeLiveNotificationIdRef.current) {
        resumeLiveNotificationIdRef.current = null;
        setActiveLiveNotificationId(resumeId);
        return;
      }
      resumeLiveNotificationIdRef.current = null;
      setActiveLiveNotificationId(getNextLiveNotificationId(prunedItems, activeLiveNotificationIdRef.current));
    }, liveNotificationConfig.displayMs);

    return () => window.clearTimeout(timer);
  }, [activeLiveNotificationId, isLiveTickerPaused, liveNotificationConfig.displayMs]);

  useEffect(() => {
    return () => {
      clearScoreTooltipTimer();
      clearMobileHeaderCollapseTimer();
    };
  }, []);

  useEffect(() => {
    if (isMobileViewport && isMobileHeaderExpanded) {
      scheduleMobileHeaderCollapse();
    } else {
      clearMobileHeaderCollapseTimer();
    }
  }, [isMobileHeaderExpanded, isMobileViewport]);

  useEffect(() => {
    let disposed = false;
    let refreshTimer: number | null = null;
    let countdownTimer: number | null = null;

    const applySnapshot = (nextSnapshot: PublicLeaderboardState, nextUpdatedAt?: string) => {
      pendingFlipRowsRef.current = captureRowPositions();
      const previousSnapshot = snapshotRef.current;
      const changedKeys = getChangedScoreKeys(snapshotRef.current, nextSnapshot);
      if (changedScoreTimerRef.current) window.clearTimeout(changedScoreTimerRef.current);
      setChangedScoreKeys(changedKeys);
      if (changedKeys.size) {
        changedScoreTimerRef.current = window.setTimeout(() => {
          setChangedScoreKeys(new Set());
          changedScoreTimerRef.current = null;
        }, 900);
      }
      if (Array.isArray(nextSnapshot.liveNotifications)) {
        applySnapshotLiveNotifications(nextSnapshot, getLiveNotificationConfig(nextSnapshot));
      } else {
        injectLiveNotifications(
          buildLiveNotificationsFromSnapshotChange(previousSnapshot, nextSnapshot, nextUpdatedAt),
          getLiveNotificationConfig(nextSnapshot),
        );
      }
      snapshotRef.current = nextSnapshot;
      refreshMsRef.current = getSnapshotRefreshMs(nextSnapshot);
      setSnapshot(nextSnapshot);
      setUpdatedAt(nextUpdatedAt || nextSnapshot.tournament.updatedAt);
    };

    const applyLocalSnapshotFallback = () => {
      const localSnapshot = getLocalSnapshot(slug);
      if (!localSnapshot) return false;
      publishLanSnapshot(localSnapshot);
      applySnapshot(localSnapshot, localSnapshot.tournament.updatedAt);
      return true;
    };

    const applyLanSnapshotFallback = async () => {
      const lanSnapshot = await fetchLanSnapshot(slug);
      if (!lanSnapshot || disposed) return false;
      applySnapshot(lanSnapshot, lanSnapshot.tournament.updatedAt);
      return true;
    };

    const applyNewerLocalSnapshot = () => {
      const localSnapshot = getLocalSnapshot(slug);
      if (!localSnapshot || !isSnapshotNewer(localSnapshot, snapshotRef.current)) return false;
      publishLanSnapshot(localSnapshot);
      applySnapshot(localSnapshot, localSnapshot.tournament.updatedAt);
      setRefreshFailed(false);
      return true;
    };

    const applyNewerLanSnapshot = async () => {
      const lanSnapshot = await fetchLanSnapshot(slug);
      if (!lanSnapshot || disposed || !isSnapshotNewer(lanSnapshot, snapshotRef.current)) return false;
      applySnapshot(lanSnapshot, lanSnapshot.tournament.updatedAt);
      setRefreshFailed(false);
      return true;
    };

    const updateCountdown = () => {
      if (!nextRefreshAtRef.current) return;
      const nextSeconds = Math.max(
        0,
        Math.ceil((nextRefreshAtRef.current - Date.now()) / 1000),
      );
      setSecondsUntilRefresh((current) => (current === nextSeconds ? current : nextSeconds));
    };

    const stopCountdown = () => {
      if (countdownTimer) {
        window.clearInterval(countdownTimer);
        countdownTimer = null;
      }
    };

    const scheduleNextRefresh = () => {
      if (disposed) return;
      if (refreshTimer) window.clearTimeout(refreshTimer);
      if (shouldStopAutoRefresh(snapshotRef.current)) {
        nextRefreshAtRef.current = null;
        setSecondsUntilRefresh(0);
        stopCountdown();
        return;
      }
      const refreshMs = refreshMsRef.current;
      nextRefreshAtRef.current = Date.now() + refreshMs;
      setSecondsUntilRefresh(Math.ceil(refreshMs / 1000));
      if (!countdownTimer) countdownTimer = window.setInterval(updateCountdown, 250);
      refreshTimer = window.setTimeout(refresh, refreshMs);
    };

    const refresh = async () => {
      setIsRefreshing(true);
      setSecondsUntilRefresh(0);
      try {
        const response = await fetch(`/api/public-leaderboard/${encodeURIComponent(slug)}`, {
          headers: { Accept: "application/json" },
          cache: "no-store",
        });
        const payload = (await response.json()) as PublicLeaderboardApiResponse;
        if (!disposed && response.ok && payload.ok && payload.snapshot) {
          const localApplied = applyNewerLocalSnapshot();
          const lanApplied = localApplied ? false : await applyNewerLanSnapshot();
          if (!localApplied && !lanApplied && isSnapshotNewer(payload.snapshot, snapshotRef.current, payload.updatedAt)) {
            applySnapshot(payload.snapshot, payload.updatedAt || payload.snapshot.tournament.updatedAt);
          }
          setRefreshFailed(false);
        } else if (!disposed) {
          const localApplied = applyLocalSnapshotFallback();
          const lanApplied = localApplied ? false : await applyLanSnapshotFallback();
          setRefreshFailed(!localApplied && !lanApplied);
        }
      } catch {
        if (!disposed) {
          const localApplied = applyLocalSnapshotFallback();
          const lanApplied = localApplied ? false : await applyLanSnapshotFallback();
          setRefreshFailed(!localApplied && !lanApplied);
        }
      } finally {
        if (!disposed) {
          setIsRefreshing(false);
          scheduleNextRefresh();
        }
      }
    };

    const handleStorage = (event: StorageEvent) => {
      if (event.key === LOCAL_SNAPSHOT_KEY) applyNewerLocalSnapshot();
    };

    window.addEventListener("storage", handleStorage);
    if (!snapshotRef.current) {
      const localApplied = applyLocalSnapshotFallback();
      if (!localApplied) {
        void refresh();
      } else {
        scheduleNextRefresh();
      }
    } else {
      scheduleNextRefresh();
    }
    return () => {
      disposed = true;
      window.removeEventListener("storage", handleStorage);
      if (refreshTimer) window.clearTimeout(refreshTimer);
      if (countdownTimer) window.clearInterval(countdownTimer);
      if (changedScoreTimerRef.current) window.clearTimeout(changedScoreTimerRef.current);
    };
  }, [slug]);

  const leaderboardCourseHoles = useMemo(
    () =>
      snapshot?.course?.holes?.length
        ? snapshot.course.holes
        : Array.from({ length: 18 }, (_, index) => ({ hole: index + 1, par: 4 })),
    [snapshot?.course?.holes],
  );

  const divisionLeaderboards = useMemo<
    NonNullable<PublicLeaderboardState["divisionLeaderboards"]>
  >(() => {
    if (!snapshot) return [];
    if (snapshot.divisionLeaderboards?.length) {
      return snapshot.divisionLeaderboards
        .map((item) => ({
          ...item,
          rows: rankPublicLeaderboardRows(
            item.rows, 
            leaderboardCourseHoles, 
            snapshot.finalResults?.status === "published" ? snapshot.finalResults?.netCutLimit : undefined
          ),
        }))
        .sort((left, right) =>
          left.division.localeCompare(right.division, copy.locale, { numeric: true }),
        );
    }
    const buckets = new Map<string, PublicLeaderboardPlayer[]>();
    snapshot.leaderboard.forEach((row) => {
      const division = getDivision(row, copy);
      buckets.set(division, [...(buckets.get(division) || []), row]);
    });
    return Array.from(buckets, ([division, rows]) => {
      const isSystem36Division = rows.some(
        (row) => row.scoringMode === "system36" || row.isSystem36Division,
      );
      return {
        division,
        scoringMode: isSystem36Division ? "system36" : "handicap",
        isSystem36Division,
        rows: rankPublicLeaderboardRows(
          rows, 
          leaderboardCourseHoles,
          snapshot.finalResults?.status === "published" ? snapshot.finalResults?.netCutLimit : undefined
        ),
      };
    });
  }, [copy, leaderboardCourseHoles, snapshot]);

  useEffect(() => {
    if (!divisionLeaderboards.length) return;
    if (!divisionLeaderboards.some((item) => item.division === activeDivision)) {
      setActiveDivision(
        divisionLeaderboards.reduce((largest, item) =>
          item.rows.length > largest.rows.length ? item : largest,
        ).division,
      );
    }
  }, [activeDivision, divisionLeaderboards]);

  useEffect(() => {
    if (activeView === "final" && snapshot?.finalResults?.status !== "published") {
      setActiveView("leaderboard");
    }
  }, [activeView, snapshot?.finalResults?.status]);

  const activeLeaderboard =
    divisionLeaderboards.find((item) => item.division === activeDivision) ||
    divisionLeaderboards[0];
  const rows = activeLeaderboard?.rows || snapshot?.leaderboard || [];
  const holes = leaderboardCourseHoles;
  const refreshMs = getSnapshotRefreshMs(snapshot);
  const refreshSeconds = Math.ceil(refreshMs / 1000);
  const countdownValue = formatCountdown(secondsUntilRefresh);
  const isLeaderboardFinalState = isLeaderboardFinal(snapshot);
  const liveBadgeState = isLeaderboardFinalState
    ? "final"
    : refreshFailed
      ? "stale"
      : "live";
  const liveBadgeLabel = liveBadgeState === "final"
    ? copy.finalStatus
    : liveBadgeState === "stale"
      ? copy.syncStatus
      : copy.liveStatus;
  const refreshProgress = isRefreshing
    ? 100
    : isLeaderboardFinalState
      ? 100
    : Math.max(0, Math.min(100, ((refreshSeconds - secondsUntilRefresh) / refreshSeconds) * 100));
  const bestGrossPlayerId = snapshot?.finalResults?.bestGrossPlayerId
    || snapshot?.leaderboard.find((row) => row.award === "best_gross")?.playerId
    || "";
  const awardRankByPlayerId = new Map(
    rows
      .filter((row) => row.playerId !== bestGrossPlayerId)
      .map((row, index) => [row.playerId, index + 1]),
  );

  useLayoutEffect(() => {
    const previousRows = pendingFlipRowsRef.current;
    pendingFlipRowsRef.current = null;
    const root = leaderboardRef.current;
    if (!previousRows?.size || !root) return;

    const cleanupTimers: number[] = [];
    root.querySelectorAll<HTMLElement>("[data-row-key]").forEach((row) => {
      const key = row.dataset.rowKey || "";
      const previous = previousRows.get(key);
      if (!previous) {
        row.classList.add(styles.rowEntering);
        cleanupTimers.push(window.setTimeout(() => row.classList.remove(styles.rowEntering), 720));
        return;
      }

      const nextRect = row.getBoundingClientRect();
      const deltaY = previous.rect.top - nextRect.top;
      const rankChanged = previous.rank !== (row.dataset.rank || "");
      if (Math.abs(deltaY) < 1 && !rankChanged) return;

      row.classList.add(styles.rowMoving);
      if (rankChanged) row.classList.add(styles.rowRankChanged);
      row.style.transition = "transform 0s";
      row.style.transform = `translateY(${deltaY}px)`;
      row.getBoundingClientRect();
      window.requestAnimationFrame(() => {
        row.style.transition = "transform 620ms cubic-bezier(0.22, 1, 0.36, 1)";
        row.style.transform = "";
      });
      cleanupTimers.push(window.setTimeout(() => {
        row.classList.remove(styles.rowMoving, styles.rowRankChanged);
        row.style.transition = "";
        row.style.transform = "";
      }, 760));
    });

    return () => cleanupTimers.forEach((timer) => window.clearTimeout(timer));
  }, [rows]);

  if (!isMounted) {
    return (
      <main
        aria-busy="true"
        className={styles.page}
        lang={languageId}
        data-theme={themeId}
        suppressHydrationWarning
      />
    );
  }

  if (!snapshot) {
    return (
      <main className={styles.page} data-theme={themeId} lang={languageId}>
        <section className={styles.emptyState}>
          <span>Leaderboard Pro</span>
          <h1>{copy.emptyTitle}</h1>
          <p>
            {initialError === "snapshot_not_found"
              ? copy.snapshotNotFound
              : copy.publicDataUnavailable}
          </p>
          <code>{slug}</code>
        </section>
      </main>
    );
  }

  const scoringMode = activeLeaderboard?.scoringMode === "stroke_gross"
    ? "Stroke Gross"
    : (activeLeaderboard?.scoringMode === "system36" ? "System36" : "WHS Net");

  return (
    <main
      className={styles.page}
      data-theme={themeId}
      lang={languageId}
      onScroll={handlePageScroll}
      ref={pageRef}
    >
      <header
        className={styles.header}
        data-collapsed={isHeaderVisuallyCollapsed ? "true" : undefined}
        data-mobile-expanded={isMobileViewport && isMobileHeaderExpanded ? "true" : undefined}
        onBlur={(event) => {
          if (isMobileViewport) return;
          if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
            setIsHeaderExpanded(false);
          }
        }}
        onClick={() => {
          if (isMobileViewport) {
            setIsMobileHeaderExpanded((current) => {
              if (current) clearMobileHeaderCollapseTimer();
              return !current;
            });
            return;
          }
          if (isHeaderCollapsed) setIsHeaderExpanded((current) => !current);
        }}
        onFocus={() => {
          if (!isMobileViewport && !isHeaderCollapsed) setIsHeaderExpanded(true);
        }}

      >
        <div className={styles.headerTop}>
          <div className={styles.brandLine}>
            <span className={styles.brandMark}>LB</span>
            <strong>Leaderboard Pro</strong>
            <span className={styles.liveBadge} data-state={liveBadgeState}>
              {liveBadgeLabel}
            </span>
          </div>
          <div className={styles.headerActions} onClick={(event) => event.stopPropagation()}>
            <label className={styles.languagePicker}>
              <span className={styles.visuallyHidden}>{copy.languagePickerAria}</span>
              <select
                aria-label={copy.languagePickerAria}
                className={styles.languageSelect}
                onChange={(event) => selectLanguage(event.target.value as ShareLanguageId)}
                value={languageId}
              >
                {SHARE_LANGUAGES.map((language) => (
                  <option key={language.id} value={language.id}>
                    {language.shortLabel}
                  </option>
                ))}
              </select>
            </label>
            <div
              className={styles.themeDropdown}
              ref={themeDropdownRef}
            >
              <button
                aria-expanded={isThemeDropdownOpen}
                aria-haspopup="listbox"
                aria-label={copy.themePickerAria}
                className={`${styles.themeDropdownTrigger} ${isThemeDropdownOpen ? styles.themeDropdownTriggerOpen : ""}`}
                onClick={() => setIsThemeDropdownOpen((v) => !v)}
                title={copy.themePickerAria}
                type="button"
              >
                {(() => {
                  const active = SHARE_THEMES.find((t) => t.id === themeId) ?? SHARE_THEMES[0];
                  return (
                    <>
                      <span
                        aria-hidden="true"
                        className={`${styles.themeSwatch} ${styles[active.swatchClass]}`}
                      >
                        <i /><i /><i />
                      </span>
                      <span className={styles.themeDropdownLabel}>{active.label}</span>
                      <span aria-hidden="true" className={styles.themeDropdownChevron} />
                    </>
                  );
                })()}
              </button>
              {isThemeDropdownOpen && (
                <div
                  className={styles.themeDropdownPanel}
                  role="listbox"
                  aria-label={copy.themePickerAria}
                >
                  {SHARE_THEMES.map((theme) => (
                    <button
                      aria-label={copy.themeAria(theme.label)}
                      aria-selected={theme.id === themeId}
                      className={`${styles.themeDropdownItem} ${theme.id === themeId ? styles.themeDropdownItemActive : ""}`}
                      key={theme.id}
                      onClick={() => selectTheme(theme.id)}
                      role="option"
                      type="button"
                    >
                      <span
                        aria-hidden="true"
                        className={`${styles.themeSwatch} ${styles[theme.swatchClass]}`}
                      >
                        <i /><i /><i />
                      </span>
                      <span>{theme.label}</span>
                      {theme.id === themeId && (
                        <span aria-hidden="true" className={styles.themeDropdownCheck}>✓</span>
                      )}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
        <div className={styles.titleRow}>
          <div>
            <p className={styles.eyebrow}>{copy.officialLeaderboard}</p>
            <h1>{snapshot.tournament.name}</h1>
            <p className={styles.metaLine}>
              {[snapshot.tournament.courseName, snapshot.tournament.operatorName]
                .filter(Boolean)
                .join(" · ") || "Leaderboard Pro"}
            </p>
          </div>
          <div className={styles.refreshStatus} aria-live="polite">
            <span className={isRefreshing ? styles.syncingDot : styles.liveDot} />
            <div className={styles.refreshCopy}>
              <strong>
                {isLeaderboardFinalState
                  ? copy.leaderboardEnded
                  : refreshFailed
                    ? copy.usingLatestData
                    : copy.confirmedScores}
              </strong>
              <small>{copy.updatedAtPrefix} {formatUpdatedAt(updatedAt || snapshot.tournament.updatedAt, copy)}</small>
              {!isLeaderboardFinalState ? (
                <span className={styles.refreshMeter} aria-hidden="true">
                  <span style={{ width: `${refreshProgress}%` }} />
                </span>
              ) : null}
            </div>
            <div
              className={styles.refreshTimer}
              aria-label={
                isLeaderboardFinalState
                  ? copy.finalLeaderboardAria
                  : isRefreshing
                  ? copy.refreshingDataAria
                  : copy.autoRefreshAria(secondsUntilRefresh)
              }
            >
              {isLeaderboardFinalState ? (
                <>
                  <span>{copy.statusLabel}</span>
                  <strong>{copy.finishedStatus}</strong>
                </>
              ) : (
                <>
                  <span>{isRefreshing ? copy.loadingStatus : copy.refreshAfter}</span>
                  <time dateTime={`PT${secondsUntilRefresh}S`}>
                    {isRefreshing ? "..." : countdownValue}
                  </time>
                </>
              )}
            </div>
          </div>
        </div>
      </header>

      <LiveEventTicker
        copy={tickerCopy}
        item={activeLiveNotification}
        itemCount={liveNotifications.length}
        now={liveTickerNow}
        locked={isLiveTickerLocked}
        paused={isLiveTickerPaused}
        onHoverChange={setIsLiveTickerHovered}
        onToggleLocked={() => setIsLiveTickerLocked((current) => !current)}
      />

      <section
        className={
          activeView === "leaderboard"
            ? `${styles.content} ${styles.leaderboardContent}`
            : styles.content
        }
        onPointerDown={handleContentActivity}
        onScrollCapture={handleContentActivity}
      >
        <div className={styles.tabToolbar}>
          <nav className={styles.mainTabs} aria-label={copy.publicContentAria}>
            <button
              aria-current={activeView === "leaderboard" ? "page" : undefined}
              className={activeView === "leaderboard" ? styles.activeMainTab : ""}
              onClick={() => setActiveView("leaderboard")}
              type="button"
            >
              <span>{copy.leaderboardTab}</span>
              <small>{copy.holeScoresTab}</small>
            </button>
            {snapshot.finalResults?.status === "published" ? (
              <button
                aria-current={activeView === "final" ? "page" : undefined}
                className={activeView === "final" ? styles.activeMainTab : ""}
                onClick={() => setActiveView("final")}
                type="button"
              >
                <span>{copy.finalTab}</span>
                <small>{copy.championsAwardsTab}</small>
              </button>
            ) : null}
          </nav>
          {activeView === "leaderboard" ? (
            <nav className={styles.tabs} aria-label={copy.divisionPickerAria} role="tablist">
              {divisionLeaderboards.map((leaderboard) => (
                <button
                  aria-selected={leaderboard.division === activeLeaderboard?.division}
                  className={leaderboard.division === activeLeaderboard?.division ? styles.activeTab : ""}
                  key={leaderboard.division}
                  onClick={() => setActiveDivision(leaderboard.division)}
                  role="tab"
                  type="button"
                >
                  <span>{leaderboard.division}</span>
                  <small>{copy.golferCount(leaderboard.rows.length)}</small>
                </button>
              ))}
            </nav>
          ) : null}
        </div>

        {activeView === "final" && snapshot.finalResults ? (
          <FinalResultsView
            awardAssetUrls={awardAssetUrls}
            copy={copy}
            finalResults={snapshot.finalResults}
            snapshot={snapshot}
          />
        ) : (
          <>
            <div className={styles.sectionBar}>
              <strong>{activeLeaderboard?.division || copy.allGolfers}</strong>
              <div className={styles.sectionModeCell}>
                <strong>{scoringMode}</strong>
                <button
                  aria-label={copy.scoreToggleAria(scoreDisplayMode)}
                  aria-pressed={scoreDisplayMode === "overpar"}
                  className={styles.scoreModeToggle}
                  data-mode={scoreDisplayMode}
                  onClick={toggleScoreDisplayMode}
                  title={copy.scoreToggleTitle}
                  type="button"
                >
                  <strong>Gross</strong>
                  <i aria-hidden="true">/</i>
                  <strong>+/-</strong>
                </button>
              </div>
            </div>

        <div className={styles.leaderboard} ref={leaderboardRef} role="table" aria-label={copy.leaderboardTableAria}>
          <div className={styles.tableHead} role="row">
            <span>{copy.rankHeader}</span><span>{copy.golferHeader}</span><span>{copy.resultHeader}</span>
            <div className={styles.scoreHeader} role="columnheader" aria-label={copy.scoresHeader}>
              {holes.map(({ hole, par }) => (
                <span key={hole}>
                  <strong>H{hole}</strong>
                  <small>P{par}</small>
                </span>
              ))}
            </div>
          </div>
          {rows.map((row) => {
            const isSystem36 = row.scoringMode === "system36" || row.isSystem36Division === true;
            const rankNet = getPlayerNetMetric(row, isSystem36);
            const displayHandicap = getPlayerHandicapMetric(row, isSystem36);
            const leaderboardToPar = getLeaderboardToPar(row, isSystem36);
            const isBestGross = row.playerId === bestGrossPlayerId;
            const basePlacementRank = getPlacementRank(row);
            const awardPlacementRank = awardRankByPlayerId.get(row.playerId) || basePlacementRank;
            const award = getAwardPresentation({ isBestGross, awardPlacementRank, copy });
            const podiumClass = isBestGross
              ? styles.bestGross
              : awardPlacementRank === 1
                ? styles.rank1
                : awardPlacementRank === 2
                  ? styles.rank2
                  : awardPlacementRank === 3
                    ? styles.rank3
                    : "";
            const rankLabel = isBestGross
              ? "BG"
              : String(awardPlacementRank).padStart(2, "0");
            const playerMetadata = [
              row.golferId || copy.golferFallback,
              `HCP ${formatNumber(displayHandicap)}`,
              row.flightGroup ? copy.groupPrefix(row.flightGroup) : "",
            ].filter(Boolean).join(" · ");
            return (
              <article
                className={`${styles.playerRow} ${podiumClass}`}
                data-rank={isBestGross ? "best-gross" : awardPlacementRank}
                data-row-key={getRowKey(row)}
                key={row.playerId}
                onTouchCancel={handleScoreModeSwipeCancel}
                onTouchEnd={handleScoreModeSwipeEnd}
                onTouchStart={handleScoreModeSwipeStart}
                role="row"
              >
                <div className={styles.rankCell} role="cell">
                  <span>{isBestGross ? copy.bestShort : awardPlacementRank <= 5 ? copy.rankHeader : "#"}</span>
                  <strong>{rankLabel}</strong>
                  {award ? (
                    <span className={styles.awardTag} title={award.label}>
                      {awardAssetUrls[award.assetId] ? (
                        <img
                          alt=""
                          height="128"
                          src={awardAssetUrls[award.assetId] || undefined}
                          width="128"
                        />
                      ) : null}
                      <span className={styles.visuallyHidden}>{award.label}</span>
                    </span>
                  ) : null}
                </div>
                <div className={styles.playerCell} role="cell">
                  <strong>{row.name}</strong>
                  <span title={playerMetadata}>{playerMetadata}</span>
                </div>
                <dl className={styles.resultCell} role="cell">
                  <div><dt>{copy.thru}</dt><dd>{row.holesPlayed}/18</dd></div>
                  <div><dt>Gross</dt><dd>{formatNumber(row.gross)}</dd></div>
                  <div><dt>{isSystem36 ? "S36 Net" : "Net"}</dt><dd>{formatNumber(rankNet)}</dd></div>
                  <div><dt>{copy.toParShort}</dt><dd>{formatDiff(leaderboardToPar)}</dd></div>
                  {(() => {
                    const { front, back } = getFrontBackGross(row, holes);
                    return (
                      <>
                        <div className={styles.resultCellHalf}><dt>Front</dt><dd>{front !== null ? front : "-"}</dd></div>
                        <div className={styles.resultCellHalf}><dt>Back</dt><dd>{back !== null ? back : "-"}</dd></div>
                      </>
                    );
                  })()}
                </dl>
                <div className={styles.scoreGrid} role="cell">
                  {holes.map(({ hole, par }) => {
                    const scoreKey = getScoreKey(row, hole);
                    const score = getScoreValue(row, hole);
                    const displayScore = scoreDisplayMode === "gross" ? score ?? "-" : formatHoleToPar(score, par);
                    const scoreTerm = formatHoleScoreTerm(score, par, copy);
                    const tooltip = Number.isFinite(Number(score))
                      ? copy.scoreTooltip(hole, par, score, scoreTerm)
                      : copy.emptyScoreTooltip(hole, par);
                    return (
                      <span
                        className={`${score ? styles.hasScore : ""} ${changedScoreKeys.has(scoreKey) ? styles.scoreChanged : ""}`}
                        aria-label={tooltip}
                        data-score-key={scoreKey}
                        onBlur={hideScoreTooltip}
                        onClick={(event) => showScoreTooltip(event.currentTarget, scoreKey, tooltip, true)}
                        onPointerEnter={(event) => {
                          if (event.pointerType === "mouse") {
                            showScoreTooltip(event.currentTarget, scoreKey, tooltip);
                          }
                        }}
                        onPointerLeave={(event) => {
                          if (event.pointerType === "mouse") hideScoreTooltip();
                        }}
                        onFocus={(event) => showScoreTooltip(event.currentTarget, scoreKey, tooltip)}
                        tabIndex={0}
                        key={hole}
                      >
                        <strong>{displayScore}</strong>
                      </span>
                    );
                  })}
                </div>
              </article>
            );
          })}
        </div>
          </>
        )}
      </section>

      {scoreTooltip ? (
        <div
          className={styles.scoreTooltip}
          data-placement={scoreTooltip.placement}
          key={scoreTooltip.key}
          role="tooltip"
          style={{ left: scoreTooltip.x, top: scoreTooltip.y }}
        >
          {scoreTooltip.text}
        </div>
      ) : null}

      <footer className={styles.footer}>
        <strong>Leaderboard Pro</strong>
        <span>{copy.footerNote}</span>
      </footer>
    </main>
  );
}
