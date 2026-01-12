import * as fs from "node:fs";
import * as path from "node:path";

type InitializeResponse = {
  video_id?: string;
  upload_url?: string;
  [k: string]: unknown;
};

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

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}


async function sendDiscordMessage(content: string) {
  const webhook = process.env.DISCORD_WEBHOOK_URL;
  if (!webhook) {
    console.error("Discord webhook URL missing!");
    return;
  }

  await fetch(webhook, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ content }),
  });
}


export class ReelUpload {
  private accessToken: string;
  private pageId: string;

  private videoId: string | null = null;
  private uploadUrl: string | null = null;

  constructor(params: { accessToken: string; pageId: string }) {
    this.accessToken = params.accessToken;
    this.pageId = params.pageId;

    if (!this.accessToken) throw new Error("Missing access token.");
    if (!this.pageId) throw new Error("Missing page id.");
  }

  /** Allow resume mode: set a known videoId from a previous run */
  setVideoId(videoId: string) {
    if (!videoId) throw new Error("setVideoId: videoId is empty.");
    this.videoId = videoId;
  }

  /** For logging / persistence */
  getCurrentVideoId(): string | null {
    return this.videoId;
  }

  private getVideoId(): string {
    if (!this.videoId) throw new Error("Video ID is not set yet.");
    return this.videoId;
  }

  async initialize(): Promise<void> {
    console.log("Initializing an Upload Session...");

    const url = `https://graph.facebook.com/v24.0/${this.pageId}/video_reels`;
    const body = { upload_phase: "start", access_token: this.accessToken };

    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    const json = (await res.json().catch(() => ({}))) as InitializeResponse & FbErrorResponse;

    if (!res.ok) {
      console.error("Initialize error:", JSON.stringify(json, null, 2));
      throw new Error("Failed to initialize upload session.");
    }

    this.videoId = typeof json.video_id === "string" ? json.video_id : null;
    this.uploadUrl = typeof json.upload_url === "string" ? json.upload_url : null;

    if (!this.videoId || !this.uploadUrl) {
      console.error("Invalid initialize response:", JSON.stringify(json, null, 2));
      throw new Error("Missing video_id/upload_url.");
    }

    console.log("Initialized:", { video_id: this.videoId, upload_url: this.uploadUrl });
    console.log("Finished Initialize\n");
  }

  async uploadVideo(videoFile: string): Promise<void> {
    console.log("Uploading video bytes...");

    if (!this.uploadUrl) {
      throw new Error("Upload URL is not set (call initialize first).");
    }

    const resolved = path.resolve(videoFile);
    if (!fs.existsSync(resolved)) throw new Error(`File does not exist: ${resolved}`);

    const fileSize = fs.statSync(resolved).size;
    const data = fs.readFileSync(resolved);

    const headers: Record<string, string> = {
      Authorization: `OAuth ${this.accessToken}`,
      offset: "0",
      file_size: String(fileSize),
    };

    const res = await fetch(this.uploadUrl, { method: "POST", headers, body: data });
    const json = (await res.json().catch(() => ({}))) as FbErrorResponse;

    if (!res.ok) {
      console.error("Upload error:", JSON.stringify(json, null, 2));
      throw new Error("Failed to upload video bytes.");
    }

    console.log("Upload response:", JSON.stringify(json, null, 2));
    console.log("Finished Upload\n");
  }

  async waitUntilReady(options?: { maxWaitMs?: number; intervalMs?: number }): Promise<boolean> {
    const maxWaitMs = options?.maxWaitMs ?? 600_000; // 10 minutes
    const intervalMs = options?.intervalMs ?? 60_000; // 2 minutes

    const videoId = this.getVideoId();

    console.log(`Waiting up to ${Math.round(maxWaitMs / 1000)}s for processing...`);
    const start = Date.now();

    while (Date.now() - start < maxWaitMs) {
      const url = new URL(`https://graph.facebook.com/v24.0/${videoId}`);
      url.searchParams.set("fields", "status");
      url.searchParams.set("access_token", this.accessToken);

      const res = await fetch(url.toString());
      const json = (await res.json().catch(() => ({}))) as any;

      if (!res.ok) {
        console.error("Status check failed:", JSON.stringify(json, null, 2));
        await sleep(intervalMs);
        continue;
      }

      const s = json?.status;
      console.log(
        `Status: video=${s?.video_status} upload=${s?.uploading_phase?.status} ` +
          `processing=${s?.processing_phase?.status} publishing=${s?.publishing_phase?.status} ` +
          `copyright=${s?.copyright_check_status?.status}`
      );

      if (s?.copyright_check_status?.status === "complete") {
        console.log("copyrighting complete.\n");
        return true;
      }

      await sleep(intervalMs);
    }

    console.log("Processing not complete after 10 minutes. Proceeding to publish anyway.\n");
    return false;
  }

  async publishReel(params: { description: string; title?: string }): Promise<{ post_id?: string }> {
  console.log("Publishing Reel...");

  const videoId = this.getVideoId();
  const url = `https://graph.facebook.com/v24.0/${this.pageId}/video_reels`;

  const urlObj = new URL(url);
  urlObj.searchParams.set("access_token", this.accessToken);
  urlObj.searchParams.set("video_id", videoId);
  urlObj.searchParams.set("upload_phase", "finish");
  urlObj.searchParams.set("video_state", "PUBLISHED");
  urlObj.searchParams.set("description", params.description);
  if (params.title) urlObj.searchParams.set("title", params.title);

  const res = await fetch(urlObj.toString(), { method: "POST" });
  const json = (await res.json().catch(() => ({}))) as any;

  if (!res.ok) {
    console.error("Publish error:", JSON.stringify(json, null, 2));

    await sendDiscordMessage(
      `❌ **REEL PUBLISH FAILED**\n` +
      `• **Page ID:** ${this.pageId}\n` +
      `• **Video ID:** ${videoId}\n` +
      `• **Description:** ${params.description}\n\n` +
      `**Facebook Error:**\n\`\`\`json\n${JSON.stringify(json, null, 2)}\n\`\`\`\n` +
      `**Time:** <t:${Math.floor(Date.now() / 1000)}:f>`
    );

    throw new Error("Failed to publish reel.");
  }

  console.log("Publish response:", JSON.stringify(json, null, 2));
  console.log("Successfully Published Reel\n");

  const postId = json?.post_id;

  await sendDiscordMessage(
    `🎉 **Reel Published Successfully!**\n` +
    `• **Page ID:** ${this.pageId}\n` +
    `• **Video ID:** ${videoId}\n` +
    `• **Post ID:** ${postId ?? "N/A"}\n` +
    `• **Description:** ${params.description}\n` +
    `**Time:** <t:${Math.floor(Date.now() / 1000)}:f>`
  );

  return { post_id: postId };
}
}
