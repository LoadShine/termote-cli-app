import ora, { Ora } from 'ora';
import open from 'open';
import { getAuthClient, CLIENT_ID, authClient } from '@/lib/auth-client';
import config from '@/config/store';
import { DEAULTE_SERVER_URL } from '@/lib/platform';

interface LoginOptions {
  serverUrl?: string;
  dev?: boolean;
}

export async function login(options: LoginOptions = {}) {
  // Determine server URL based on options
  let serverUrl: string;
  if (options.serverUrl) {
    serverUrl = options.serverUrl;
  } else if (options.dev) {
    serverUrl = 'http://localhost:3000';
  } else {
    serverUrl = config.get('serverUrl') as string || DEAULTE_SERVER_URL;
  }

  const authClient = getAuthClient(serverUrl);
  const spinner = ora('Initializing device login...').start();

  // Step 1: Request device code
  spinner.text = 'Requesting device code...';
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000);

    // Request device code
    const { data, error } = await authClient.device.code({
      client_id: CLIENT_ID,
      scope: "openid profile email",
    });

    if (error) {
      console.error("❌ Error:", error?.error_description);
      process.exit(1);
    }

    if (!data) {
      console.error("❌ Error: No data received from server");
      process.exit(1);
    }

    clearTimeout(timeoutId);

    const {
      device_code,
      user_code,
      verification_uri,
      verification_uri_complete,
      interval = 5,
      expires_in,
    } = data;

    console.log('\n\x1b[1mDevice Authorization\x1b[0m');
    console.log(`\n  \x1b[36mYour code:\x1b[0m \x1b[1m${user_code}\x1b[0m`);
    console.log(`\n  \x1b[36mVerification URL:\x1b[0m ${verification_uri_complete || verification_uri}`);
    console.log(`\n  \x1b[90mThis code expires in ${Math.floor(expires_in / 60)} minutes.\x1b[0m\n`);

    try {
      spinner.start('Opening browser...');
      await open(verification_uri_complete || verification_uri);
      spinner.succeed('Browser opened');
    } catch {
      console.log('Please open the URL in your browser manually');
    }

    spinner.start(`Waiting for you to authorize on ${serverUrl}`);
    const access_token = await pollForToken(device_code, interval, spinner);
    config.set('serverUrl', serverUrl);
    config.set('accessToken', access_token);
    config.set('deviceCode', device_code);
    spinner.succeed('\x1b[32mAuthentication successful!\x1b[0m');
    process.exit(0);
  } catch (networkError: any) {
    spinner.fail('Connection failed');
    console.error(`\n\x1b[31mFailed to connect to server: ${serverUrl}\x1b[0m`);
    console.error(`\n  Possible reasons:`);
    console.error(`  • Server is down or unreachable`);
    console.error(`  • Network connection issues`);
    console.error(`  • Incorrect server URL in config`);
    console.error(`\n  Try: Check your internet connection and server URL.\n`);
    process.exit(1);
  }
}

async function pollForToken(deviceCode: string, interval: number, spinner: Ora) {
  let pollingInterval = interval;

  return new Promise<string>((resolve) => {
    const poll = async () => {
      try {
        const { data, error } = await authClient.device.token({
          grant_type: "urn:ietf:params:oauth:grant-type:device_code",
          device_code: deviceCode,
          client_id: CLIENT_ID,
        });

        if (data?.access_token) {
          // Get user session
          // const { data: session } = await authClient.getSession({
          //   fetchOptions: {
          //     headers: {
          //       Authorization: `Bearer ${data.access_token}`,
          //     },
          //   },
          // });
          resolve(data.access_token);
        } else if (error) {
          switch (error.error) {
            case "authorization_pending":
              break;
            case "slow_down":
              pollingInterval += 5;
              break;
            case "access_denied":
              spinner.fail("Access was denied by the user");
              process.exit(1);
            case "expired_token":
              spinner.fail("The device code has expired. Please try again.");
              process.exit(1);
            default:
              spinner.fail(`Error: ${error.error_description}`);
              process.exit(1);
          }
        }
      } catch (error: any) {
        spinner.fail(`Network error: ${error.message}`);
        process.exit(1);
      }

      // Schedule next poll
      setTimeout(poll, pollingInterval * 1000);
    };

    // Start polling
    setTimeout(poll, pollingInterval * 1000);
  });
}
