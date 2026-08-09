"use client";

import { useState } from "react";

const MARKER_COLORS: Record<string, string> = {
  CONFIRMED: "#4caf50",
  SUBMITTER: "#f5c543",
  UNCONFIRMED: "#9e1b15",
  CONTRADICTED: "#e0261c",
  OPEN: "#8ea4e8",
};

const MARKER_RE = /\s*\[(?:CONFIRMED|SUBMITTER|UNCONFIRMED|CONTRADICTED|OPEN)[^\]]*\]/g;

/** Same strip the publisher applies, so the preview is what actually prints. */
export function cleanCopy(body: string): string {
  return body.replace(MARKER_RE, "").replace(/[ \t]{2,}/g, " ").trim();
}

function withMarkers(body: string) {
  const parts = body.split(/(\[(?:CONFIRMED|SUBMITTER|UNCONFIRMED|CONTRADICTED|OPEN)[^\]]*\])/g);
  return parts.map((part, i) => {
    const m = part.match(/^\[(CONFIRMED|SUBMITTER|UNCONFIRMED|CONTRADICTED|OPEN)/);
    if (m) {
      return (
        <span
          key={i}
          style={{
            color: MARKER_COLORS[m[1]],
            fontWeight: 700,
            fontSize: ".82em",
            whiteSpace: "nowrap",
          }}
        >
          {part}
        </span>
      );
    }
    return <span key={i}>{part}</span>;
  });
}

/**
 * The draft body, switchable between the verification view (markers shown,
 * for checking the reporting) and clean copy (what publishing produces).
 */
export default function DraftBody({ body }: { body: string }) {
  const [clean, setClean] = useState(false);

  return (
    <div>
      <div style={{ display: "flex", gap: 8, margin: "0 0 12px" }}>
        {[
          { on: false, text: "Verification view" },
          { on: true, text: "Clean copy" },
        ].map((opt) => (
          <button
            key={opt.text}
            onClick={() => setClean(opt.on)}
            style={{
              padding: "5px 14px",
              borderRadius: 999,
              cursor: "pointer",
              fontFamily: "inherit",
              fontSize: ".74rem",
              fontWeight: 700,
              letterSpacing: ".04em",
              border: "1px solid #33302a",
              background: clean === opt.on ? "#2b418f" : "transparent",
              color: clean === opt.on ? "#f5f1e6" : "#9a958a",
            }}
          >
            {opt.text}
          </button>
        ))}
      </div>

      <div style={{ whiteSpace: "pre-wrap", lineHeight: 1.6 }}>
        {clean ? cleanCopy(body) : withMarkers(body)}
      </div>

      {clean && (
        <p style={{ fontSize: ".76rem", color: "#6b675c", marginTop: 12, marginBottom: 0 }}>
          This is exactly what publishes — markers are stripped automatically, you never
          have to remove them by hand.
        </p>
      )}
    </div>
  );
}
