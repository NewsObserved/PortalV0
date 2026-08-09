"use client";

import { useActionState } from "react";
import { publishSubmission, type PublishState } from "../actions";

export default function PublishPanel({
  submissionId,
  existingUrl,
}: {
  submissionId: string;
  existingUrl?: string | null;
}) {
  const [state, action, pending] = useActionState<PublishState, FormData>(
    publishSubmission,
    {},
  );
  const url = state.url ?? existingUrl ?? null;

  return (
    <div style={{ marginTop: 16 }}>
      {url ? (
        <div style={{ fontSize: ".9rem" }}>
          <p style={{ color: "#4caf50", margin: "0 0 6px" }}>
            ✓ Sent to ognsc.com as a WordPress draft.{" "}
            <a href={url} target="_blank" rel="noreferrer" style={{ color: "#8ea4e8" }}>
              Open in WordPress →
            </a>
          </p>
          <p style={{ color: "#9a958a", margin: 0, fontSize: ".8rem" }}>
            It is not public yet — review it there and hit Publish in WordPress to put it
            live.
          </p>
        </div>
      ) : (
        <form action={action}>
          <input type="hidden" name="submissionId" value={submissionId} />
          <button
            type="submit"
            disabled={pending}
            style={{
              padding: "14px 28px",
              fontWeight: 800,
              letterSpacing: ".06em",
              textTransform: "uppercase",
              background: "#f5c543",
              color: "#121009",
              border: "none",
              borderRadius: 999,
              cursor: pending ? "wait" : "pointer",
              opacity: pending ? 0.6 : 1,
            }}
          >
            {pending ? "Publishing…" : "Publish to ognsc.com"}
          </button>
          {state.error && (
            <p style={{ color: "#e0261c", marginTop: 10, fontSize: ".85rem" }}>{state.error}</p>
          )}
        </form>
      )}
    </div>
  );
}
