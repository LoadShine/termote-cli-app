import ora from 'ora';
import inquirer from 'inquirer';
import config from '@/config/store';
import { deleteTerminalSession, listTerminalSessions } from '@/lib/platform';

function formatDuration(timestamp: number): string {
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
}

function formatDate(timestamp: number) {
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  }).format(new Date(timestamp));
}

function formatId(id: string) {
  return id.slice(0, 8) + '...';
}

export async function stop(options: { all?: boolean; sessionId?: string }) {
  const serverUrl = config.get('serverUrl') as string;
  const accessToken = config.get('accessToken') as string;

  if (!accessToken) {
    console.error('Not logged in. Please run "termote login" first.');
    process.exit(1);
  }

  try {
    if (options.sessionId) {
      // Stop specific session
      const spinner = ora('Stopping session...').start();
      await deleteTerminalSession(serverUrl, accessToken, options.sessionId);
      spinner.succeed(`Session ${formatId(options.sessionId)} stopped`);
    } else if (options.all) {
      // List and stop all sessions
      const sessions = await listTerminalSessions(serverUrl, accessToken);
      const activeSessions = sessions.filter(s => s.status === 'active');
      if (activeSessions.length === 0) {
        console.log('\n  No active sessions found.');
        return;
      }
      console.log(`\n  Stopping ${activeSessions.length} active session(s)...`);
      for (const session of activeSessions) {
        await deleteTerminalSession(serverUrl, accessToken, session.id);
      }
      console.log(`  \x1b[32m✔ Stopped ${activeSessions.length} session(s)\x1b[0m\n`);
    } else {
      // List sessions for user to choose
      const sessions = await listTerminalSessions(serverUrl, accessToken);
      if (sessions.length === 0) {
        console.log('\n  No sessions found.');
        return;
      }

      // Sort: active first, then by created_at desc
      const sortedSessions = [...sessions].sort((a, b) => {
        if (a.status === 'active' && b.status !== 'active') return -1;
        if (a.status !== 'active' && b.status === 'active') return 1;
        return b.created_at - a.created_at;
      });

      console.log(`\n  Sessions (${sortedSessions.length}):\n`);

      sortedSessions.forEach((session, index) => {
        const statusIcon = session.status === 'active' ? '●' : '○';
        const statusColor = session.status === 'active' ? '\x1b[32m' : '\x1b[90m';
        const resetColor = '\x1b[0m';
        const timeSinceCreated = formatDuration(session.created_at);
        const createdAt = formatDate(session.created_at);
        const numberColor = '\x1b[36m';

        console.log(`    ${numberColor}${index + 1}.${resetColor} ${statusColor}${statusIcon}${resetColor}  ${formatId(session.id).padEnd(11)}  ${session.shell?.padEnd(15)}  ${createdAt.padEnd(12)}  (${timeSinceCreated})`);
      });

      console.log('');

      // Prompt user to select session
      const { selectedIndex } = await inquirer.prompt([
        {
          type: 'list',
          name: 'selectedIndex',
          message: 'Select a session to stop:',
          choices: sortedSessions.map((s, i) => ({
            name: `${i + 1}. ${formatId(s.id)} (${s.shell}) - ${s.status}`,
            value: i
          }))
        }
      ]);

      const selected = sortedSessions[selectedIndex];
      await deleteTerminalSession(serverUrl, accessToken, selected.id);
      console.log(`  \x1b[32m✔ Session ${formatId(selected.id)} stopped\x1b[0m\n`);
    }
  } catch (error: any) {
    console.error(`\r\x1b[31mError: ${error.message}\x1b[0m`);
    process.exit(1);
  }
}

