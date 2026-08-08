"use client";

import { useState } from "react";

/** Caption/title block with a one-tap copy button. */
export default function CopyBox({ title, text }: { title: string; text: string }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      /* clipboard blocked — the text is selectable anyway */
    }
  }

  return (
    <div style={{ marginBottom: 12 }}>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: 6,
        }}
      >
        <span
          style={{
            fontSize: ".66rem",
            fontWeight: 800,
            letterSpacing: ".2em",
            textTransform: "uppercase",
            color: "#8ea4e8",
          }}
        >
          {title}
        </span>
        <button
          onClick={copy}
          style={{
            background: "transparent",
            border: "1px solid #33302a",
            color: copied ? "#4caf50" : "#9a958a",
            borderRadius: 999,
            padding: "4px 12px",
            fontSize: ".72rem",
            cursor: "pointer",
            fontFamily: "inherit",
          }}
        >
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
      <p
        style={{
          margin: 0,
          padding: "10px 12px",
          background: "#121009",
          border: "1px solid #33302a",
          borderRadius: 8,
          color: "#cfc9b8",
          fontSize: ".88rem",
          whiteSpace: "pre-wrap",
        }}
      >
        {text}
      </p>
    </div>
  );
}
