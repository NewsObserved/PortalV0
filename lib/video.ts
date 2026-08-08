import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { anthropic, EDITORIAL_MODEL } from "./anthropic";
import type { TimedWord } from "../video/StoryShort";

/** Social copy + narration script derived from a published story. */
export interface VideoScript {
  headline_short: string;
  kicker: string;
  narration: string;
  tiktok_caption: string;
  youtube_title: string;
  youtube_description: string;
}

const SCRIPT_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: [
    "headline_short",
    "kicker",
    "narration",
    "tiktok_caption",
    "youtube_title",
    "youtube_description",
  ],
  properties: {
    headline_short: {
      type: "string",
      description: "Punchy version of the headline for the intro card, max 9 words",
    },
    kicker: { type: "string", description: "2-3 word label, e.g. 'Community Report'" },
    narration: {
      type: "string",
      description:
        "A 30-40 second spoken script — roughly 90-120 words, NEVER more. Social-first pacing: the first sentence is a hook that makes someone stop scrolling, then short punchy sentences, one idea each. Cut every clause that isn't load-bearing. Plain and urgent, the way a person talks, not the way a press release reads. Vary sentence length so the read has natural rhythm. No hashtags, no emoji, no stage directions — only the words to be spoken. The script MUST end with exactly this sentence, verbatim, as its final line: \"To submit your news, visit us at news observed dot com.\"",
    },
    tiktok_caption: {
      type: "string",
      description: "TikTok caption with 3-5 relevant hashtags",
    },
    youtube_title: { type: "string", description: "YouTube Shorts title, max 90 chars" },
    youtube_description: { type: "string", description: "1-2 sentence description + link" },
  },
} as const;

/** Condense a story draft into a narration script + social copy. */
export async function generateScript(story: {
  headline: string;
  dek: string | null;
  body: string;
}): Promise<VideoScript> {
  const client = anthropic();
  const response = await client.messages.create({
    model: EDITORIAL_MODEL,
    max_tokens: 2000,
    system:
      "You turn verified local news stories from News Observed (Black press, Southern California, since 1974) into short-form video scripts. Voice: direct, human, community-first — never clickbait that overpromises, never AI-sounding filler. The narration must only contain facts present in the story.",
    output_config: { format: { type: "json_schema", schema: SCRIPT_SCHEMA } },
    messages: [
      {
        role: "user",
        content: `Turn this story into a short-form video script.\n\nHEADLINE: ${story.headline}\n${story.dek ? `DEK: ${story.dek}\n` : ""}\nBODY:\n${story.body}`,
      },
    ],
  });
  const text = response.content
    .filter((b) => b.type === "text")
    .map((b) => (b as { text: string }).text)
    .join("");
  return JSON.parse(text) as VideoScript;
}

interface ElevenLabsAlignment {
  characters: string[];
  character_start_times_seconds: number[];
  character_end_times_seconds: number[];
}

/** Convert ElevenLabs character alignment into per-word timings. */
export function alignmentToWords(a: ElevenLabsAlignment): TimedWord[] {
  const words: TimedWord[] = [];
  let current = "";
  let startMs = 0;
  for (let i = 0; i < a.characters.length; i++) {
    const ch = a.characters[i];
    if (ch === " " || ch === "\n") {
      if (current) {
        words.push({ text: current, startMs, endMs: a.character_end_times_seconds[i - 1] * 1000 });
        current = "";
      }
    } else {
      if (!current) startMs = a.character_start_times_seconds[i] * 1000;
      current += ch;
    }
  }
  if (current) {
    words.push({
      text: current,
      startMs,
      endMs: a.character_end_times_seconds[a.characters.length - 1] * 1000,
    });
  }
  return words;
}

export interface VoiceResult {
  audioFile: string; // filename inside public/
  words: TimedWord[];
  durationMs: number;
}

/**
 * Render narration with ElevenLabs (with word timestamps) and write the mp3
 * into public/ for Remotion's staticFile().
 */
export async function synthesizeVoice(narration: string, refId: string): Promise<VoiceResult> {
  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (!apiKey) throw new Error("ELEVENLABS_API_KEY not set in .env.local");
  const voiceId = process.env.ELEVENLABS_VOICE_ID ?? "21m00Tcm4TlvDq8ikWAM"; // "Rachel" default

  const res = await fetch(
    `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}/with-timestamps`,
    {
      method: "POST",
      headers: { "xi-api-key": apiKey, "Content-Type": "application/json" },
      body: JSON.stringify({
        text: narration,
        model_id: process.env.ELEVENLABS_MODEL_ID ?? "eleven_multilingual_v2",
        // Low stability + style = more inflection and less monotone; slightly
        // quick delivery for social pacing.
        voice_settings: {
          stability: 0.3,
          similarity_boost: 0.8,
          style: 0.45,
          use_speaker_boost: true,
          speed: 1.06,
        },
      }),
    },
  );
  if (!res.ok) throw new Error(`ElevenLabs ${res.status}: ${(await res.text()).slice(0, 300)}`);

  const data = (await res.json()) as { audio_base64: string; alignment: ElevenLabsAlignment };
  const audioFile = `voice-${refId}.mp3`;
  writeFileSync(join(process.cwd(), "public", audioFile), Buffer.from(data.audio_base64, "base64"));

  const words = alignmentToWords(data.alignment);
  const durationMs = Math.ceil(words[words.length - 1]?.endMs ?? 0);
  return { audioFile, words, durationMs };
}
