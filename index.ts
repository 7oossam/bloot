import { config, higgsfield } from "@higgsfield/client/v2";
import dotenv from "dotenv";

dotenv.config({ path: ".env.local" });

config({
  credentials: process.env.HF_CREDENTIALS,
});

async function main() {
  console.log("Submitting video generation request...");
  const result = await higgsfield.subscribe(
    "bytedance/seedance-2.5/text-to-video",
    {
      input: {
        prompt: "A cinematic scene at sunset",
        duration: 5,
        resolution: "720p",
        aspect_ratio: "16:9"
      },
      withPolling: true,
    }
  );

  if (result.status === "completed") {
    console.log("Success! Video URL:", result.video?.url || result.videos?.[0]?.url || JSON.stringify(result));
  } else {
    console.error("Request ended with status:", result.status);
    console.error(result);
  }
}

main().catch(console.error);
