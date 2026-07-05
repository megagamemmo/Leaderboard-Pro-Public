export default function LiveLoading() {
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
        <div style={{
          width: 36,
          height: 36,
          border: "3px solid var(--border, #3f3f46)",
          borderTopColor: "var(--accent, #10b981)",
          borderRadius: "50%",
          margin: "0 auto 16px",
          animation: "lb-spin 0.8s linear infinite",
        }} />
        <p>Đang tải leaderboard…</p>
      </div>
      <style>{`@keyframes lb-spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  );
}
