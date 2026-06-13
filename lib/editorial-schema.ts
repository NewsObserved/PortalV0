/**
 * JSON Schema for the editorial agent's structured draft output.
 * Mirrors the output object in prompts/editorial-system-prompt.md and is fed to
 * Claude via output_config.format so the draft comes back validated, not parsed-and-prayed.
 *
 * Note: structured-output schemas do NOT support string length / numeric constraints,
 * so those live in the prompt, not here.
 */
export const EDITORIAL_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    status: {
      type: "string",
      enum: ["drafted", "stalled", "rejected_recommendation"],
    },
    confidence_level: {
      type: "string",
      enum: ["high", "medium", "low", "unverifiable"],
    },
    needs_follow_up: {
      type: "boolean",
      description:
        "True if targeted follow-up questions to the submitter would meaningfully improve accuracy or completeness and a round is still available.",
    },
    headline: { type: "string" },
    dek: { type: "string" },
    body: {
      type: "string",
      description:
        "The full draft with inline verification markers ([CONFIRMED: source], [SUBMITTER], [UNCONFIRMED], [CONTRADICTED: source], [OPEN: ...]).",
    },
    category: {
      type: "string",
      enum: [
        "local_news",
        "national_news",
        "culture",
        "business",
        "civic",
        "faith",
        "education",
        "public_safety",
        "community_events",
        "organizing",
        "other",
      ],
    },
    tags: { type: "array", items: { type: "string" } },
    citations: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          claim: { type: "string" },
          source_url: { type: "string" },
          source_name: { type: "string" },
        },
        required: ["claim", "source_url", "source_name"],
      },
    },
    follow_up_questions: {
      type: "array",
      description:
        "Questions to email the submitter (3-5 max). Empty if no follow-up is needed.",
      items: { type: "string" },
    },
    suggested_third_party_outreach: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          party: { type: "string" },
          rationale: { type: "string" },
        },
        required: ["party", "rationale"],
      },
    },
    editor_notes: { type: "string" },
    recommend_rejection: { type: "boolean" },
    rejection_rationale: { type: "string" },
  },
  required: [
    "status",
    "confidence_level",
    "needs_follow_up",
    "headline",
    "dek",
    "body",
    "category",
    "tags",
    "citations",
    "follow_up_questions",
    "suggested_third_party_outreach",
    "editor_notes",
    "recommend_rejection",
    "rejection_rationale",
  ],
} as const;

export interface EditorialDraft {
  status: "drafted" | "stalled" | "rejected_recommendation";
  confidence_level: "high" | "medium" | "low" | "unverifiable";
  needs_follow_up: boolean;
  headline: string;
  dek: string;
  body: string;
  category: string;
  tags: string[];
  citations: { claim: string; source_url: string; source_name: string }[];
  follow_up_questions: string[];
  suggested_third_party_outreach: { party: string; rationale: string }[];
  editor_notes: string;
  recommend_rejection: boolean;
  rejection_rationale: string;
}
