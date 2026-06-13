export default function Home() {
  return (
    <main style={{ maxWidth: 680, margin: "0 auto", padding: "64px 20px" }}>
      <p
        style={{
          fontSize: ".7rem",
          letterSpacing: ".2em",
          textTransform: "uppercase",
          color: "#8ea4e8",
        }}
      >
        Observer Group Newspapers · Editorial Desk
      </p>
      <h1 style={{ fontFamily: "Georgia, serif", fontSize: "2.4rem" }}>
        News <span style={{ color: "#e0261c" }}>Observed</span>
      </h1>
      <p style={{ color: "#9a958a" }}>
        Newsroom back office. The public submission desk lives at{" "}
        <a href="/" style={{ color: "#8ea4e8" }}>
          newsobserved.com
        </a>
        . Editors review AI-drafted stories at{" "}
        <a href="/dashboard" style={{ color: "#8ea4e8" }}>
          /dashboard
        </a>
        .
      </p>
    </main>
  );
}
