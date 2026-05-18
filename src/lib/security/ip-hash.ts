import { createHmac } from "crypto";

export function hashIp(ip: string): string {
  const secret = process.env.HUB_IP_HASH_SECRET;
  if (!secret) {
    throw new Error("HUB_IP_HASH_SECRET is not configured");
  }
  return createHmac("sha256", secret).update(ip).digest("hex");
}
