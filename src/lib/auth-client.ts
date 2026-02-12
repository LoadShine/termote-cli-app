import { createAuthClient } from "better-auth/client";
import { deviceAuthorizationClient } from "better-auth/client/plugins";

/**
 * Create or retrieve a better-auth client for device authorization
 */
export function getAuthClient(baseURL: string) {
  return createAuthClient({
    baseURL,
    plugins: [
      deviceAuthorizationClient(),
    ],
  });
}

export const CLIENT_ID = 'termote-cli';