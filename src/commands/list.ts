import ora from 'ora';

import config from '@/config/store';
import { listTerminalSessions } from '@/lib/platform';

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
      filteredSessions = sessions.filter(s => s.status === 'active');
    }

    // Sort: active first, then by created_at (newest first)
    const sortedSessions = [...filteredSessions].sort((a, b) => {
      if (a.status === 'active' && b.status !== 'active') return -1;
      if (a.status !== 'active' && b.status === 'active') return 1;
      return b.created_at - a.created_at;
    });

    if (sortedSessions.length === 0) {
      console.log(options.all
        ? '\n  No sessions found.'
        : '\n  No active sessions found. Use --all to see inactive sessions.');
      return;
    }

    console.log(`\n  Sessions (${sortedSessions.length}):\n`);

    const formatDate = (timestamp: number) => {
      return new Intl.DateTimeFormat('en-US', {
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      }).format(new Date(timestamp));
    };

    const formatDuration = (timestamp: number) => {
      const now = Date.now();
      const diff = now - timestamp;
      const seconds = Math.floor(diff / 1000);
      const minutes = Math.floor(seconds / 60);
      const hours = Math.floor(minutes / 60);
      const days = Math.floor(hours / 24);

      if (days > 0) {
        return `${days}d ${hours % 24}h`;
      } else if (hours > 0) {
        return `${hours}h ${minutes % 60}m`;
      } else if (minutes > 0) {
        return `${minutes}m`;
      } else {
        return `${seconds}s`;
      }
    };

    const formatId = (id: string) => {
      return id.slice(0, 8) + '...';
    };

    sortedSessions.forEach((session) => {
      const statusIcon = session.status === 'active' ? '\x1b[32m●\x1b[0m' : '\x1b[90m○\x1b[0m';
      const statusColor = session.status === 'active' ? '\x1b[32m' : '\x1b[90m';
      const resetColor = '\x1b[0m';

      const duration = session.status === 'active' ? ` (\x1b[36mactive for ${formatDuration(session.created_at)}\x1b[0m)` : '';

      console.log(`    ${statusColor}${statusIcon}${resetColor}  ${formatId(session.id).padEnd(11)}  ${(session.shell || '').padEnd(15)}  ${formatDate(session.created_at)}${duration}`);
    });

    console.log('');
  } catch (error: any) {
    spinner.fail(`List error: ${error.message}`);
    process.exit(1);
  }
}
