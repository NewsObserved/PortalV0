import { writeFileSync } from "node:fs";
import { join } from "node:path";
import type Anthropic from "@anthropic-ai/sdk";
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
    kicker: {
      type: "string",
      description:
        "ALWAYS a place, never a label. Use CITY, STATE ('Jackson, Mississippi'); for a statewide story use the state alone ('Iowa'); for a genuinely national story name the region or 'Across the U.S.'. Never write things like 'Statewide Report' or 'Community Report' — this chip exists to tell a scrolling stranger where they are.",
    },
    narration: {
      type: "string",
      description:
        "A 30-40 second spoken script — roughly 90-120 words, NEVER more. THE FIRST WORDS MUST BE THE PLACE, because the audience is national and a stranger scrolling needs to know instantly where this is happening: use CITY, STATE ('Jackson, Mississippi.'), the state alone if the story is statewide ('Iowa.'), or the region if genuinely national ('Across the country.'). Never open with anything but the location. Then the hook: a line that makes someone stop scrolling. Then short punchy sentences, one idea each. Cut every clause that isn't load-bearing. Plain and urgent, the way a person talks, not the way a press release reads. Vary sentence length so the read has natural rhythm. No hashtags, no emoji, no stage directions — only the words to be spoken. The script MUST end with exactly this sentence, verbatim, as its final line: \"To submit your story, visit us at news observed dot com.\"",
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
    // Long stories produced responses that hit the cap and returned truncated
    // JSON, failing the parse.
    max_tokens: 6000,
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
  try {
    return JSON.parse(text) as VideoScript;
  } catch {
    throw new Error(
      `Script generation returned unparseable JSON (stop_reason=${response.stop_reason}, ${text.length} chars). Likely truncated.`,
    );
  }
}

/** One visual the agent decided the story needs, and why. */
export interface PlannedShot {
  kind: "map" | "source_page" | "commons_image";
  /** Place to map, or search terms for an openly-licensed image. */
  query: string;
  /** For source_page: which cited URL to capture. */
  source_url: string | null;
  /** The editorial reason — shown to the editor, not the viewer. */
  purpose: string;
}

const SHOT_LIST_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["shots"],
  properties: {
    shots: {
      type: "array",
      description: "Between 5 and 7 shots, in the order the viewer should see them.",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["kind", "query", "source_url", "purpose"],
        properties: {
          kind: { type: "string", enum: ["map", "source_page", "commons_image"] },
          query: {
            type: "string",
            description:
              "For map: a geocodable place, e.g. 'Martin Luther King Park, Bakersfield, CA' — real place names only, no abbreviations. For commons_image: plain search terms for Wikimedia Commons, e.g. 'Bakersfield California city hall'. For source_page: repeat the page's topic.",
          },
          source_url: {
            type: ["string", "null"],
            description: "Required for source_page — must be one of the story's citation URLs.",
          },
          purpose: {
            type: "string",
            description: "One line: what this visual shows the viewer and why it belongs here.",
          },
        },
      },
    },
  },
} as const;

/**
 * Decide what the video should SHOW. The agent reads the finished story and
 * plans a sequence of visuals — establishing the place, documenting the claim,
 * illustrating the context — rather than screenshotting whatever was cited.
 */
export async function planVisuals(
  story: { headline: string; dek: string | null; body: string },
  citations: { source_url: string; source_name: string }[],
): Promise<PlannedShot[]> {
  const client = anthropic();
  const sourceList = citations.length
    ? citations.map((c) => `- ${c.source_name}: ${c.source_url}`).join("\n")
    : "(none)";

  const response = await client.messages.create({
    model: EDITORIAL_MODEL,
    max_tokens: 2000,
    system:
      "You are a photo editor for a short-form news video. You plan what the viewer SEES while the narration plays. Think like someone building a visual sequence: establish where this is happening, show the thing being reported, document the evidence, then give context. Vary the shot kinds — a wall of webpage screenshots is lifeless. You may ONLY use these sources, for rights reasons: 'map' (an OpenStreetMap view of a real location), 'source_page' (a screenshot of a page we cited, used as documentary evidence), and 'commons_image' (an openly-licensed photo from Wikimedia Commons). Never plan a shot you cannot get from those three. Prefer a map early to establish place. Use source_page when the page itself IS the evidence — a schedule, a filing, an announcement. Use commons_image for real-world context: the city, the neighborhood, the type of facility, a landmark. Order the shots to follow the story's arc.",
    output_config: { format: { type: "json_schema", schema: SHOT_LIST_SCHEMA } },
    messages: [
      {
        role: "user",
        content: `Plan the visual sequence for this story.\n\nHEADLINE: ${story.headline}\n${story.dek ? `DEK: ${story.dek}\n` : ""}\nBODY:\n${story.body}\n\nCITED PAGES AVAILABLE FOR SCREENSHOTS:\n${sourceList}`,
      },
    ],
  } as Anthropic.MessageCreateParamsNonStreaming);

  const text = response.content
    .filter((b) => b.type === "text")
    .map((b) => (b as { text: string }).text)
    .join("");
  return (JSON.parse(text) as { shots: PlannedShot[] }).shots;
}

/**
 * Look at a candidate image and judge whether it actually shows what the shot
 * needs. Commons text search is keyword-matched and returns wild misses (a
 * search for spray parks returns an 1899 seed catalogue for "Park's Floral
 * Magazine"), so the only reliable filter is looking at the picture.
 */
export async function imageFitsShot(
  imageBase64: string,
  mediaType: "image/jpeg" | "image/png",
  purpose: string,
): Promise<boolean> {
  try {
    const client = anthropic();
    const response = await client.messages.create({
      model: EDITORIAL_MODEL,
      max_tokens: 300,
      system:
        "You are a photo editor checking whether an image is usable in a news video. Answer with a JSON object only. Be strict: reject scans of documents, book pages, advertisements, maps of the wrong place, logos, diagrams, and anything a viewer would find confusing or misleading in context. Accept only a real photograph that plainly depicts the subject described.",
      output_config: {
        format: {
          type: "json_schema",
          schema: {
            type: "object",
            additionalProperties: false,
            required: ["fits", "reason"],
            properties: {
              fits: { type: "boolean" },
              reason: { type: "string", description: "Under 15 words." },
            },
          },
        },
      },
      messages: [
        {
          role: "user",
          content: [
            {
              type: "image",
              source: { type: "base64", media_type: mediaType, data: imageBase64 },
            },
            {
              type: "text",
              text: `This image would be shown while the narration covers: "${purpose}"\n\nIs it a real photograph that plainly depicts that subject and would read clearly to a viewer?`,
            },
          ],
        },
      ],
    } as Anthropic.MessageCreateParamsNonStreaming);

    const text = response.content
      .filter((b) => b.type === "text")
      .map((b) => (b as { text: string }).text)
      .join("");
    return (JSON.parse(text) as { fits: boolean }).fits === true;
  } catch {
    return false; // can't verify -> don't use it
  }
}

/**
 * Is this screenshot the actual page, or the wall in front of it? News sites
 * serve headless browsers cookie dialogs, CAPTCHAs and paywalls, which look
 * like content to a variance check but are useless on screen.
 */
export async function screenshotIsUsable(
  imageBase64: string,
  sourceName: string,
): Promise<boolean> {
  try {
    const client = anthropic();
    const response = await client.messages.create({
      model: EDITORIAL_MODEL,
      max_tokens: 300,
      system:
        "You are checking whether a screenshot of a web page is usable in a news video. REJECT it if the page is dominated by a cookie/consent dialog, a CAPTCHA or 'verify you are human' check, a paywall or subscription prompt, a login wall, an error page, or is mostly blank or still loading. ACCEPT only if the actual article or page content — headline and text — is plainly visible and readable. Answer with JSON only.",
      output_config: {
        format: {
          type: "json_schema",
          schema: {
            type: "object",
            additionalProperties: false,
            required: ["usable", "reason"],
            properties: {
              usable: { type: "boolean" },
              reason: { type: "string", description: "Under 12 words." },
            },
          },
        },
      },
      messages: [
        {
          role: "user",
          content: [
            {
              type: "image",
              source: { type: "base64", media_type: "image/png", data: imageBase64 },
            },
            {
              type: "text",
              text: `Screenshot of a page from ${sourceName}. Is the page's own content clearly visible and readable?`,
            },
          ],
        },
      ],
    } as Anthropic.MessageCreateParamsNonStreaming);

    const text = response.content
      .filter((b) => b.type === "text")
      .map((b) => (b as { text: string }).text)
      .join("");
    return (JSON.parse(text) as { usable: boolean }).usable === true;
  } catch {
    return false;
  }
}

const ONES = [
  "zero","one","two","three","four","five","six","seven","eight","nine","ten",
  "eleven","twelve","thirteen","fourteen","fifteen","sixteen","seventeen",
  "eighteen","nineteen",
];
const TENS = ["","","twenty","thirty","forty","fifty","sixty","seventy","eighty","ninety"];

function under100(n: number): string {
  if (n < 20) return ONES[n];
  const t = TENS[Math.floor(n / 10)];
  const o = n % 10;
  return o ? `${t} ${ONES[o]}` : t;
}

const SCALES: [number, string][] = [
  [1_000_000_000, "billion"],
  [1_000_000, "million"],
  [1_000, "thousand"],
];

/** Whole numbers spoken the way a person says them, not digit by digit. */
function numberToWords(n: number): string {
  if (n < 100) return under100(n);
  for (const [value, name] of SCALES) {
    if (n >= value) {
      const hi = Math.floor(n / value);
      const rest = n % value;
      return `${numberToWords(hi)} ${name}${rest ? ` ${numberToWords(rest)}` : ""}`;
    }
  }
  const hundreds = Math.floor(n / 100);
  const rest = n % 100;
  return `${ONES[hundreds]} hundred${rest ? ` ${under100(rest)}` : ""}`;
}

/** Years the way a person reads them aloud. */
function yearToWords(y: number): string {
  if (y >= 2000 && y <= 2099) {
    const rest = y - 2000;
    return rest === 0 ? "two thousand" : `two thousand ${under100(rest)}`;
  }
  if (y >= 1100 && y <= 1999) {
    const hi = Math.floor(y / 100);
    const lo = y % 100;
    if (lo === 0) return `${under100(hi)} hundred`;
    return `${under100(hi)} ${lo < 10 ? `oh ${ONES[lo]}` : under100(lo)}`;
  }
  return String(y);
}

/**
 * Names the model mispronounces. Spelled the way it should SOUND — these are
 * never shown on screen, only spoken.
 */
const SAY_AS: Record<string, string> = {
  milan: "Milawn",
  "u.s.": "U S",
  "u.s": "U S",
  ncaa: "N C double A",
  hbcu: "H B C U",
  hbcus: "H B C Us",
  usda: "U S D A",
  fppc: "F P P C",
  dcss: "D C S S",
};

/**
 * Rewrite narration for the voice while keeping the on-screen wording intact.
 *
 * Returns the text to speak plus, for each display word, how many spoken words
 * it became — so the per-word timings that come back can be folded back onto
 * the words the viewer actually reads.
 */
export function prepareNarration(text: string): { spoken: string; groups: number[] } {
  const displayWords = text.split(/\s+/).filter(Boolean);
  const spokenParts: string[] = [];
  const groups: number[] = [];

  for (const word of displayWords) {
    // Strip surrounding punctuation before matching, but keep interior dots
    // and hyphens ("U.S.", "2-1", "22-year-old").
    // Keep interior commas and dots ("124,000", "U.S.", "12.6"); trim the rest.
    const bare = word.replace(/[^A-Za-z0-9.,'-]/g, "").replace(/^[.,'-]+|[.,;:!?'-]+$/g, "");
    const key = bare.toLowerCase();
    let say: string;

    if (SAY_AS[key]) {
      say = SAY_AS[key];
    } else if (/^\d{4}$/.test(bare) && +bare >= 1100 && +bare <= 2099) {
      say = yearToWords(+bare);
    } else if (/^\d{1,2}-\d{1,2}$/.test(bare)) {
      // A score: "2-1" reads as "two to one", not "two dash one".
      const [a, b] = bare.split("-").map(Number);
      say = `${under100(a)} to ${under100(b)}`;
    } else if (/^\d{1,3}-year-old$/i.test(bare)) {
      say = `${under100(parseInt(bare, 10))} year old`;
    } else if (/^\d{1,3}(,\d{3})+$/.test(bare)) {
      // "124,000" must not be read as digits or as a phone number.
      say = numberToWords(Number(bare.replace(/,/g, "")));
    } else if (/^\d+\.\d+$/.test(bare)) {
      // "12.6" -> "twelve point six"
      const [whole, frac] = bare.split(".");
      say = `${numberToWords(Number(whole))} point ${frac.split("").map((d) => ONES[+d]).join(" ")}`;
    } else if (/^\d{1,3}$/.test(bare) && +bare > 100) {
      say = numberToWords(+bare);
    } else {
      say = word;
      spokenParts.push(say);
      groups.push(1);
      continue;
    }

    // Carry trailing punctuation so the read keeps its pauses.
    const trailing = word.match(/[.,;:!?—-]+$/)?.[0] ?? "";
    const words = `${say}${trailing}`.split(/\s+/).filter(Boolean);
    spokenParts.push(...words);
    groups.push(words.length);
  }

  return { spoken: spokenParts.join(" "), groups };
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

  // Speak years, scores and tricky names correctly without changing what the
  // viewer reads on screen.
  const { spoken, groups } = prepareNarration(narration);

  const res = await fetch(
    `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}/with-timestamps`,
    {
      method: "POST",
      headers: { "xi-api-key": apiKey, "Content-Type": "application/json" },
      body: JSON.stringify({
        text: spoken,
        model_id: process.env.ELEVENLABS_MODEL_ID ?? "eleven_multilingual_v2",
        // Higher stability with low style keeps the read even and natural —
        // the punchier settings varied delivery line to line and read as choppy.
        voice_settings: {
          stability: 0.55,
          similarity_boost: 0.85,
          style: 0.15,
          use_speaker_boost: true,
          speed: 1.0,
        },
      }),
    },
  );
  if (!res.ok) throw new Error(`ElevenLabs ${res.status}: ${(await res.text()).slice(0, 300)}`);

  const data = (await res.json()) as { audio_base64: string; alignment: ElevenLabsAlignment };
  const audioFile = `voice-${refId}.mp3`;
  writeFileSync(join(process.cwd(), "public", audioFile), Buffer.from(data.audio_base64, "base64"));

  // Fold the spoken-word timings back onto the display wording.
  const spokenWords = alignmentToWords(data.alignment);
  const displayWords = narration.split(/\s+/).filter(Boolean);
  const words: TimedWord[] = [];
  let cursor = 0;
  for (let i = 0; i < groups.length && cursor < spokenWords.length; i++) {
    const span = spokenWords.slice(cursor, cursor + groups[i]);
    cursor += groups[i];
    if (!span.length) break;
    words.push({
      text: displayWords[i] ?? span.map((w) => w.text).join(" "),
      startMs: span[0].startMs,
      endMs: span[span.length - 1].endMs,
    });
  }

  const durationMs = Math.ceil(words[words.length - 1]?.endMs ?? 0);
  return { audioFile, words, durationMs };
}
