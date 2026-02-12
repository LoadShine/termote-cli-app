import ora from 'ora';
import config from '@/config/store';

export async function logout() {
  const spinner = ora('Logging out...').start();

  try {
    const serverUrl = config.get('serverUrl');
    if (!serverUrl) {
      spinner.warn('No session found');
      return;
    }

    // Clear all token types
    config.delete('serverUrl');
    config.delete('accessToken');
    config.delete('refreshToken');
    config.delete('deviceCode');

    spinner.succeed(`Logged out from ${serverUrl}`);
  } catch (error: any) {
    spinner.fail(`Logout error: ${error.message}`);
  }
}
