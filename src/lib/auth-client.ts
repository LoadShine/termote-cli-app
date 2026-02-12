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

export const authClient =  createAuthClient({
    baseURL: "http://localhost:3000",
    plugins: [
      deviceAuthorizationClient(),
    ],
  });

/**
 * OAuth 2.0 token response from device authorization
 */
export interface TokenResponse {
  access_token: string;
  refresh_token?: string;
  expires_in?: number;
  token_type: string;
}
