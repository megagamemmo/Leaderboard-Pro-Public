"use client";

export default function LiveError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div style={{
      display: "grid",
      placeItems: "center",
      minHeight: "60vh",
      padding: "40px 20px",
      color: "var(--fg-secondary, #a1a1aa)",
      fontFamily: "system-ui, sans-serif",
      textAlign: "center",
    }}>
      <div>
        <p style={{ fontSize: "1.2rem", fontWeight: 600, color: "#fca5a5", margin: "0 0 8px" }}>
          Không thể tải leaderboard
        </p>
        <p style={{ margin: "0 0 20px", fontSize: "0.9rem" }}>
          {error.message || "Lỗi kết nối dữ liệu. Vui lòng thử lại sau."}
        </p>
        <button
          onClick={reset}
          style={{
            padding: "10px 24px",
            border: 0,
            borderRadius: 8,
            background: "#10b981",
            color: "#052e23",
            fontWeight: 700,
            cursor: "pointer",
            fontSize: "0.9rem",
          }}
        >
          Thử lại
        </button>
      </div>
    </div>
  );
}
