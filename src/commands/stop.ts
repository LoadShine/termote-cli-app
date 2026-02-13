import ora from 'ora';
import inquirer from 'inquirer';
import config from '@/config/store';
import { deleteTerminalSession, listTerminalSessions } from '@/lib/platform';
import { isVerbose } from '@/lib/errors';
import { formatDuration, formatDate, formatId } from '@/lib/utils';

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
      const activeSessions = sessions.filter(s => s.agent.connected);
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
        if (a.agent.connected && !b.agent.connected) return -1;
        if (!a.agent.connected && b.agent.connected) return 1;
        return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      });

      console.log(`\n  Sessions (${sortedSessions.length}):\n`);

      sortedSessions.forEach((session, index) => {
        const statusIcon = session.agent.connected ? '●' : '○';
        const statusColor = session.agent.connected ? '\x1b[32m' : '\x1b[90m';
        const resetColor = '\x1b[0m';
        const timeSinceCreated = formatDuration(session.createdAt);
        const createdAt = formatDate(session.createdAt);
        const numberColor = '\x1b[36m';

        console.log(`    ${numberColor}${index + 1}.${resetColor} ${statusColor}${statusIcon}${resetColor}  ${formatId(session.id).padEnd(11)}  ${session.agent.shell?.padEnd(15)}  ${createdAt.padEnd(12)}  (${timeSinceCreated})`);
      });

      console.log('');

      // Prompt user to select session
      const { selectedIndex } = await inquirer.prompt([
        {
          type: 'list',
          name: 'selectedIndex',
          message: 'Select a session to stop:',
          choices: sortedSessions.map((s, i) => ({
            name: `${i + 1}. ${formatId(s.id)} (${s.agent.shell}) - ${s.agent.connected ? 'Active' : 'Inactive'}`,
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
    if (isVerbose()) {
      console.error('\n\x1b[90mStack trace:\x1b[0m');
      console.error(error.stack);
    }
    process.exit(1);
  }
}

