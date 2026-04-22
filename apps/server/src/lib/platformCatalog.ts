interface SeedPlatform {
  name: string;
  baseUrl: string;
  tag: string;
}

export const SEED_PLATFORMS: SeedPlatform[] = [
  { name: "Instagram", baseUrl: "https://www.instagram.com", tag: "Entertainment" },
  { name: "YouTube", baseUrl: "https://www.youtube.com", tag: "Entertainment" },
  { name: "Bluesky", baseUrl: "https://bsky.app", tag: "Social" },
  { name: "Steam", baseUrl: "https://store.steampowered.com", tag: "Gaming" },
  { name: "Discord", baseUrl: "https://discord.com", tag: "Communication" },
  { name: "GitHub", baseUrl: "https://github.com", tag: "Workplace" },
  { name: "LinkedIn", baseUrl: "https://www.linkedin.com", tag: "Workplace" },
  { name: "Reddit", baseUrl: "https://www.reddit.com", tag: "Social" },
  { name: "X", baseUrl: "https://x.com", tag: "Social" },
  { name: "Facebook", baseUrl: "https://www.facebook.com", tag: "Social" },
  { name: "TikTok", baseUrl: "https://www.tiktok.com", tag: "Entertainment" },
  { name: "Twitch", baseUrl: "https://www.twitch.tv", tag: "Gaming" },
  { name: "Spotify", baseUrl: "https://open.spotify.com", tag: "Entertainment" },
  { name: "Netflix", baseUrl: "https://www.netflix.com", tag: "Entertainment" },
  { name: "Amazon", baseUrl: "https://www.amazon.com", tag: "Commerce" },
  { name: "Google", baseUrl: "https://accounts.google.com", tag: "Productivity" },
  { name: "Microsoft", baseUrl: "https://account.microsoft.com", tag: "Productivity" },
  { name: "Notion", baseUrl: "https://www.notion.so", tag: "Productivity" },
  { name: "Slack", baseUrl: "https://slack.com", tag: "Workplace" },
  { name: "Trello", baseUrl: "https://trello.com", tag: "Workplace" }
];
