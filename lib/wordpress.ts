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
  editorName: string;
  status?: "draft" | "publish";
}

export interface PublishResult {
  postId: string;
  url: string;
  status: string;
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

  const byline =
    "Reported and drafted by Observed editorial AI from submitter interviews and public records. " +
    `Reviewed and published by ${input.editorName}.`;

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
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`WordPress publish failed (${res.status}): ${text.slice(0, 300)}`);
  }
  const post = (await res.json()) as { id: number; link: string; status: string };
  return { postId: String(post.id), url: post.link, status: post.status };
}
