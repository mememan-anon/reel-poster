import * as fs from "node:fs";
import * as path from "node:path";

type FbErrorResponse = {
  error?: {
    message?: string;
    type?: string;
    code?: number;
    error_subcode?: number;
    fbtrace_id?: string;
  };
  [k: string]: unknown;
};

function getStrictImageMime(filePath: string): "image/jpeg" | "image/png" {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === ".jpg" || ext === ".jpeg") return "image/jpeg";
  if (ext === ".png") return "image/png";
  throw new Error(`Unsupported file type: ${ext}. Only .jpg, .jpeg, .png are allowed.`);
}

async function sendDiscordMessage(content: string) {
  const webhook = process.env.DISCORD_WEBHOOK_URL;
  if (!webhook) return;

  await fetch(webhook, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ content }),
  });
}

export class PhotoUpload {
  private accessToken: string;
  private pageId: string;

  constructor(params: { accessToken: string; pageId: string }) {
    this.accessToken = params.accessToken;
    this.pageId = params.pageId;

    if (!this.accessToken) throw new Error("Missing access token.");
    if (!this.pageId) throw new Error("Missing page id.");
  }

  /**
   * Upload EXACTLY one photo to the Page.
   * - Only .jpg/.jpeg/.png allowed
   * - No description by default (caption omitted)
   * - Set caption only if you explicitly pass it
   */
  async uploadPhoto(params: {
    photoFile: string;
    caption?: string; // optional; if omitted -> no description at all
    publish?: boolean; // default true
  }): Promise<{ id?: string; post_id?: string }> {
    const resolved = path.resolve(params.photoFile);
    if (!fs.existsSync(resolved)) throw new Error(`File does not exist: ${resolved}`);

    const mime = getStrictImageMime(resolved);
    const filename = path.basename(resolved);
    const data = fs.readFileSync(resolved);

    const url = new URL(`https://graph.facebook.com/v24.0/${this.pageId}/photos`);
    url.searchParams.set("access_token", this.accessToken);

    const form = new FormData();
    form.append("source", new Blob([data], { type: mime }), filename);
    form.append("published", String(params.publish ?? true));

    // Only send caption if explicitly provided (otherwise omit entirely)
    if (typeof params.caption === "string" && params.caption.trim().length > 0) {
      form.append("caption", params.caption.trim());
    }

    const res = await fetch(url.toString(), { method: "POST", body: form });
    const json = (await res.json().catch(() => ({}))) as any & FbErrorResponse;

    if (!res.ok) {
      await sendDiscordMessage(
        `❌ **PHOTO UPLOAD FAILED**\n` +
          `• **Page ID:** ${this.pageId}\n` +
          `• **File:** ${filename}\n\n` +
          `**Facebook Error:**\n\`\`\`json\n${JSON.stringify(json, null, 2)}\n\`\`\`\n` +
          `**Time:** <t:${Math.floor(Date.now() / 1000)}:f>`
      );

      throw new Error(`Failed to upload photo: ${json?.error?.message ?? "Unknown error"}`);
    }

    const photoId = json?.id;
    const postId = json?.post_id;

    await sendDiscordMessage(
      `✅ **Photo Uploaded**\n` +
        `• **Page ID:** ${this.pageId}\n` +
        `• **Photo ID:** ${photoId ?? "N/A"}\n` +
        `• **Post ID:** ${postId ?? "N/A"}\n` +
        `• **File:** ${filename}\n` +
        `**Time:** <t:${Math.floor(Date.now() / 1000)}:f>`
    );

    return { id: photoId, post_id: postId };
  }
}
