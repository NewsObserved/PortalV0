export function isWordPressConfigured(): boolean {
  return Boolean(
    process.env.WORDPRESS_BASE_URL &&
      process.env.WORDPRESS_USER &&
      process.env.WORDPRESS_APP_PASSWORD,
  );
}

/** Remove inline verification markers — they're editorial annotations, not for print. */
export function stripMarkers(body: string): string {
  return body
    .replace(/\s*\[(?:CONFIRMED|SUBMITTER|UNCONFIRMED|CONTRADICTED|OPEN)[^\]]*\]/g, "")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}

function toHtml(body: string, byline: string): string {
  const paragraphs = stripMarkers(body)
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p) => `<p>${escapeHtml(p)}</p>`)
    .join("\n");
  return `${paragraphs}\n<p><em>${escapeHtml(byline)}</em></p>`;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

interface PublishInput {
  title: string;
  dek: string;
  body: string;
  /** Kept for the publications record; the printed byline is fixed. */
  editorName: string;
  status?: "draft" | "publish";
  /** Optional lead image, uploaded and set as the featured image. */
  image?: {
    bytes: Buffer;
    filename: string;
    mimeType: string;
    credit: string;
    alt: string;
  } | null;
}

export interface PublishResult {
  postId: string;
  url: string;
  status: string;
  /** WordPress media id of the featured image, when one was attached. */
  mediaId?: string;
}

function authHeader(): string {
  return (
    "Basic " +
    Buffer.from(
      `${process.env.WORDPRESS_USER}:${process.env.WORDPRESS_APP_PASSWORD}`,
    ).toString("base64")
  );
}

/**
 * Upload an image to the WordPress media library with its attribution as the
 * caption. Returns the media id, or null if the upload fails — a missing
 * photo must never block the story.
 */
export async function uploadMedia(
  base: string,
  image: NonNullable<PublishInput["image"]>,
): Promise<string | null> {
  try {
    const res = await fetch(`${base}/wp-json/wp/v2/media`, {
      method: "POST",
      headers: {
        Authorization: authHeader(),
        "Content-Type": image.mimeType,
        "Content-Disposition": `attachment; filename="${image.filename}"`,
      },
      body: new Uint8Array(image.bytes),
    });
    if (!res.ok) return null;
    const media = (await res.json()) as { id: number };

    // Caption carries the licence credit — required for CC images.
    await fetch(`${base}/wp-json/wp/v2/media/${media.id}`, {
      method: "POST",
      headers: { Authorization: authHeader(), "Content-Type": "application/json" },
      body: JSON.stringify({
        alt_text: image.alt,
        caption: image.credit,
        description: image.credit,
      }),
    });
    return String(media.id);
  } catch {
    return null;
  }
}

/**
 * Publish a draft to the ognsc.com WordPress site via the REST API.
 * Defaults to WordPress status 'draft' so a human does the final publish there.
 */
export async function publishDraft(input: PublishInput): Promise<PublishResult> {
  if (!isWordPressConfigured()) {
    throw new Error("WordPress is not configured (WORDPRESS_BASE_URL/USER/APP_PASSWORD)");
  }
  const base = process.env.WORDPRESS_BASE_URL!.replace(/\/$/, "");
  const auth = Buffer.from(
    `${process.env.WORDPRESS_USER}:${process.env.WORDPRESS_APP_PASSWORD}`,
  ).toString("base64");

  const byline = "AI assisted, human published.";

  const mediaId = input.image ? await uploadMedia(base, input.image) : null;

  const res = await fetch(`${base}/wp-json/wp/v2/posts`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Basic ${auth}`,
    },
    body: JSON.stringify({
      title: input.title,
      excerpt: input.dek,
      content: toHtml(input.body, byline),
      status: input.status ?? "draft",
      ...(mediaId ? { featured_media: Number(mediaId) } : {}),
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`WordPress publish failed (${res.status}): ${text.slice(0, 300)}`);
  }
  const post = (await res.json()) as { id: number; link: string; status: string };
  // A draft's public permalink 404s — send the editor to the WordPress editor
  // instead, which is where they finish the review and hit publish.
  const url =
    post.status === "publish"
      ? post.link
      : `${base}/wp-admin/post.php?post=${post.id}&action=edit`;
  return { postId: String(post.id), url, status: post.status, mediaId: mediaId ?? undefined };
}
