import type Anthropic from "@anthropic-ai/sdk";
import { anthropic, EDITORIAL_MODEL } from "./anthropic";
import { imageFitsShot } from "./video";

const UA = "NewsObserved/1.0 (editorial@newsobserved.com)";

export interface ArticleImage {
  bytes: Buffer;
  filename: string;
  mimeType: "image/jpeg" | "image/png";
  /** Required attribution, printed as the WordPress caption. */
  credit: string;
  /** Screen-reader description. */
  alt: string;
}

/**
 * Ask the agent what a photo for this story should depict. Deliberately not
 * the headline verbatim — a good lead image shows the place or the subject,
 * and Commons is searched by plain nouns, not news language.
 */
async function imageQueries(story: {
  headline: string;
  dek: string | null;
  body: string;
}): Promise<{ queries: string[]; alt_hint: string }> {
  const client = anthropic();
  const response = await client.messages.create({
    model: EDITORIAL_MODEL,
    max_tokens: 600,
    system:
      "You choose the lead photograph for a news article. The photo comes from Wikimedia Commons, which is searched with plain descriptive nouns — not headlines. Suggest searches for what a reader should SEE: the city or landmark, the institution's building, the type of place or object at issue. Never suggest searches for a named private individual. Never suggest anything that could be mistaken for a photo of the actual incident, victim, or crime scene.",
    output_config: {
      format: {
        type: "json_schema",
        schema: {
          type: "object",
          additionalProperties: false,
          required: ["queries", "alt_hint"],
          properties: {
            queries: {
              type: "array",
              description:
                "Three to four Commons search phrases, best first, e.g. 'Jackson Mississippi city hall'.",
              items: { type: "string" },
            },
            alt_hint: {
              type: "string",
              description: "What the ideal image would show, one line — used to verify candidates.",
            },
          },
        },
      },
    },
    messages: [
      {
        role: "user",
        content: `Choose the lead image for this story.\n\nHEADLINE: ${story.headline}\n${story.dek ?? ""}\n\n${story.body.slice(0, 2500)}`,
      },
    ],
  } as Anthropic.MessageCreateParamsNonStreaming);

  const text = response.content
    .filter((b) => b.type === "text")
    .map((b) => (b as { text: string }).text)
    .join("");
  return JSON.parse(text) as { queries: string[]; alt_hint: string };
}

/**
 * Find an openly-licensed lead image for a story. Serverless-safe: pure HTTP,
 * no browser or shell. Returns null rather than publishing a wrong picture.
 */
export async function findArticleImage(story: {
  headline: string;
  dek: string | null;
  body: string;
}): Promise<ArticleImage | null> {
  let plan: { queries: string[]; alt_hint: string };
  try {
    plan = await imageQueries(story);
  } catch {
    return null;
  }

  for (const query of plan.queries.slice(0, 4)) {
    const api =
      `https://commons.wikimedia.org/w/api.php?action=query&generator=search` +
      `&gsrsearch=${encodeURIComponent(query)}&gsrnamespace=6&gsrlimit=5` +
      `&prop=imageinfo&iiprop=url|extmetadata&iiurlwidth=1600&format=json`;

    let pages: Record<string, unknown>;
    try {
      const res = await fetch(api, { headers: { "User-Agent": UA } });
      pages = ((await res.json()) as { query?: { pages?: Record<string, unknown> } })?.query
        ?.pages ?? {};
    } catch {
      continue;
    }

    for (const page of Object.values(pages) as {
      imageinfo?: {
        thumburl?: string;
        url: string;
        extmetadata?: Record<string, { value: string }>;
      }[];
    }[]) {
      const info = page.imageinfo?.[0];
      if (!info) continue;

      const meta = info.extmetadata ?? {};
      const licence = meta.LicenseShortName?.value ?? "";
      if (!/public domain|^cc|cc0|attribution/i.test(licence)) continue;

      const src = info.thumburl ?? info.url;
      const clean = src.split("?")[0];
      if (!/\.(jpe?g|png)$/i.test(clean)) continue;

      let bytes: Buffer;
      try {
        const res = await fetch(src, { headers: { "User-Agent": UA } });
        if (!res.ok) continue;
        bytes = Buffer.from(await res.arrayBuffer());
      } catch {
        continue;
      }
      if (bytes.length < 20_000) continue; // thumbnails and icons

      const mimeType = /\.png$/i.test(clean) ? "image/png" : "image/jpeg";
      // The agent looks at it — Commons keyword search returns wild misses.
      if (!(await imageFitsShot(bytes.toString("base64"), mimeType, plan.alt_hint))) {
        continue;
      }

      const artist = (meta.Artist?.value ?? "").replace(/<[^>]+>/g, "").trim();
      const title = (meta.ObjectName?.value ?? "").replace(/<[^>]+>/g, "").trim();
      return {
        bytes,
        filename: `lead-${Date.now()}.${mimeType === "image/png" ? "png" : "jpg"}`,
        mimeType,
        credit: [artist || "Wikimedia Commons", licence, "via Wikimedia Commons"]
          .filter(Boolean)
          .join(" · "),
        alt: title || plan.alt_hint,
      };
    }
  }
  return null;
}
