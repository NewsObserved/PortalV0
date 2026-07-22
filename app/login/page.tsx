"use client";

import { useEffect, useState } from "react";
import { createBrowserClient } from "@supabase/ssr";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Surface failures from the magic-link callback (?error=...).
  useEffect(() => {
    const message = new URLSearchParams(location.search).get("error");
    if (message) setError(message);
  }, []);

  async function sendLink(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const supabase = createBrowserClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    );
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: `${location.origin}/auth/callback` },
    });
    if (error) setError(error.message);
    else setSent(true);
  }

  return (
    <main style={{ maxWidth: 420, margin: "0 auto", padding: "80px 20px" }}>
      <div
        style={{
          fontSize: ".7rem",
          letterSpacing: ".2em",
          textTransform: "uppercase",
          color: "#8ea4e8",
        }}
      >
        Editorial Desk
      </div>
      <h1 style={{ fontFamily: "Georgia, serif", fontSize: "1.8rem", marginBottom: 24 }}>
        Editor sign-in
      </h1>
      {sent ? (
        <p style={{ color: "#9a958a" }}>
          Check <b style={{ color: "#f5f1e6" }}>{email}</b> for a sign-in link.
        </p>
      ) : (
        <form onSubmit={sendLink}>
          <input
            type="email"
            required
            placeholder="you@ognsc.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            style={{
              width: "100%",
              padding: "14px 16px",
              fontSize: "1rem",
              borderRadius: 10,
              border: "2px solid #33302a",
              background: "#1d1a12",
              color: "#f5f1e6",
              marginBottom: 14,
            }}
          />
          <button
            type="submit"
            style={{
              width: "100%",
              padding: "14px",
              fontWeight: 800,
              letterSpacing: ".08em",
              textTransform: "uppercase",
              background: "#e0261c",
              color: "#f5f1e6",
              border: "none",
              borderRadius: 999,
              cursor: "pointer",
            }}
          >
            Email me a link
          </button>
          {error && <p style={{ color: "#e0261c", marginTop: 12 }}>{error}</p>}
        </form>
      )}
    </main>
  );
}
