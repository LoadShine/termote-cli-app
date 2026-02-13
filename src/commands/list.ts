import ora from 'ora';
import config from '@/config/store';
import { listTerminalSessions } from '@/lib/platform';
import { isVerbose } from '@/lib/errors';
import { formatDuration, formatDate, formatId } from '@/lib/utils';

export async function list(options: { all?: boolean }) {
  const serverUrl = config.get('serverUrl') as string;
  // Support both legacy deviceToken and new accessToken
  const accessToken = config.get('accessToken') as string || config.get('deviceToken') as string;

  if (!accessToken) {
    console.error('Not logged in. Please run "termote login" first.');
    process.exit(1);
  }

  const spinner = ora('Fetching sessions...').start();

  try {
    const sessions = await listTerminalSessions(serverUrl, accessToken);

    spinner.stop();

    // Filter and sort: active first, then by created_at desc
    let filteredSessions = sessions;
    if (!options.all) {
      filteredSessions = sessions.filter(s => s.agent.connected);
    }

    // Sort: active first, then by created_at (newest first)
    const sortedSessions = [...filteredSessions].sort((a, b) => {
      if (a.agent.connected && !b.agent.connected) return -1;
      if (!a.agent.connected && b.agent.connected) return 1;
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    });

    if (sortedSessions.length === 0) {
      console.log(options.all
        ? '\n  No sessions found.'
        : '\n  No active sessions found. Use --all to see inactive sessions.');
      return;
    }

    console.log(`\n  Server: ${serverUrl}`);
    console.log(`  Sessions (${sortedSessions.length}):\n`);

    sortedSessions.forEach((session) => {
      const statusIcon = session.agent.connected ? '\x1b[32m●\x1b[0m' : '\x1b[90m○\x1b[0m';
      const statusColor = session.agent.connected ? '\x1b[32m' : '\x1b[90m';
      const resetColor = '\x1b[0m';
      const duration = session.agent.connected ? ` (\x1b[36mactive for ${formatDuration(session.createdAt)}\x1b[0m)` : '';
      console.log(`    ${statusColor}${statusIcon}${resetColor}  ${formatId(session.id).padEnd(11)}  ${(session.name || '').padEnd(15)}  ${formatDate(session.createdAt)}${duration}`);
    });

    console.log('');
  } catch (error: any) {
    spinner.fail(`List error: ${error.message}`);
    if (isVerbose()) {
      console.error('\n\x1b[90mStack trace:\x1b[0m');
      console.error(error.stack);
    }
    process.exit(1);
  }
}
