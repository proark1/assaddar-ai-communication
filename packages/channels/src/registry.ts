import { MetaMessengerAdapter, WhatsAppCloudAdapter } from "./meta";
import { TikTokBusinessMessagingMockAdapter } from "./tiktok";
import type { ChannelAdapter } from "./types";
import { WebsiteAdapter } from "./website";

/**
 * The subset of environment variables the outbound-capable adapters need. Kept
 * explicit (rather than reading process.env directly) so the same registry can
 * be built by the API, the workers service, or a test with injected values.
 */
export type ChannelAdapterEnv = {
  META_VERIFY_TOKEN?: string;
  META_GRAPH_API_VERSION?: string;
  WHATSAPP_ACCESS_TOKEN?: string;
  MESSENGER_PAGE_ACCESS_TOKEN?: string;
};

export type ChannelAdapterRegistry = {
  whatsapp: ChannelAdapter;
  messenger: ChannelAdapter;
  instagram: ChannelAdapter;
  tiktok: ChannelAdapter;
  website: ChannelAdapter;
};

/**
 * Build the outbound channel adapters from environment credentials. Shared by
 * the API webhook handler and the delivery-retry worker so both send through
 * identical adapter behaviour (retryable failure mapping included).
 */
export function createChannelAdapterRegistry(
  env: ChannelAdapterEnv,
): ChannelAdapterRegistry {
  const verifyToken = env.META_VERIFY_TOKEN ?? "change-me-meta-verify-token";
  const graphApiVersion = env.META_GRAPH_API_VERSION;
  return {
    whatsapp: new WhatsAppCloudAdapter(
      verifyToken,
      env.WHATSAPP_ACCESS_TOKEN,
      graphApiVersion,
    ),
    messenger: new MetaMessengerAdapter(
      "messenger",
      verifyToken,
      env.MESSENGER_PAGE_ACCESS_TOKEN,
      graphApiVersion,
    ),
    instagram: new MetaMessengerAdapter(
      "instagram",
      verifyToken,
      env.MESSENGER_PAGE_ACCESS_TOKEN,
      graphApiVersion,
    ),
    tiktok: new TikTokBusinessMessagingMockAdapter(),
    website: new WebsiteAdapter(),
  };
}

/** Resolve the adapter for a channel, if one exists in the registry. */
export function adapterForChannel(
  registry: ChannelAdapterRegistry,
  channel: string,
): ChannelAdapter | null {
  switch (channel) {
    case "whatsapp":
      return registry.whatsapp;
    case "messenger":
      return registry.messenger;
    case "instagram":
      return registry.instagram;
    case "tiktok":
      return registry.tiktok;
    case "website":
      return registry.website;
    default:
      return null;
  }
}
