import Anthropic from "@anthropic-ai/sdk";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/** The editorial agent model. Fable 5 — adaptive thinking only; no sampling params. */
export const EDITORIAL_MODEL = "claude-fable-5";

export function anthropic(): Anthropic {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("Missing ANTHROPIC_API_KEY — set it in .env.local");
  return new Anthropic({ apiKey });
}

let cachedPrompt: string | null = null;

/** The Observed editorial system prompt, read from prompts/editorial-system-prompt.md. */
export function editorialSystemPrompt(): string {
  if (cachedPrompt) return cachedPrompt;
  cachedPrompt = readFileSync(
    join(process.cwd(), "prompts", "editorial-system-prompt.md"),
    "utf8",
  );
  return cachedPrompt;
}
