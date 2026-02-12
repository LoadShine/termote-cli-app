import { Command } from 'commander';
import { login } from '@/commands/login';
import { logout } from '@/commands/logout';
import { start } from '@/commands/start';
import { stop } from '@/commands/stop';
import { list } from '@/commands/list';

const program = new Command();

program
  .name('termote')
  .description('Share your terminal via web')
  .version(process.env.VERSION || '0.0.0', '-v, --version', 'Output version')
  .configureHelp({
    sortSubcommands: true,
    formatHelp: (cmd, helper) => {
      const termWidth = process.stdout.columns || 80;
      const cmdWidth = Math.max(10, Math.min(20, Math.floor(termWidth / 4)));
      const subcommands = helper.visibleCommands(cmd).filter(c => c.name() !== 'help');
      const hasCommands = subcommands.length > 0;

      let output = '';

      // Usage
      output += `\x1b[36m${helper.commandUsage(cmd)}\x1b[0m\n`;

      // Description
      const desc = helper.commandDescription(cmd);
      if (desc) {
        output += `\n${desc}\n`;
      }

      // Commands
      if (hasCommands) {
        output += `\n\x1b[90mCommands:\x1b[0m\n`;
        subcommands.forEach((subcommand) => {
          const cmdName = subcommand.name();
          const cmdDesc = subcommand.description();
          output += `  \x1b[36m${cmdName.padEnd(cmdWidth)}\x1b[0m  ${cmdDesc}\n`;
        });
      }

      // Options
      output += `\n\x1b[90mOptions:\x1b[0m\n`;
      output += `  -v, --version  Output version\n`;
      output += `  -h, --help     Show help\n`;

      return output.replace(/\n+$/, '\n');
    }
  });

program
  .command('login')
  .description('Authenticate with service')
  .option('--server-url <url>', 'Server URL (default: https://termote.agi.build)')
  .option('--dev', 'Use development server (default: http://localhost:3000)')
  .action((options) => login(options));

program
  .command('logout')
  .description('Logout from service')
  .action(logout);

program
  .command('list')
  .description('List all sessions')
  .option('-a, --all', 'Show all sessions including inactive')
  .action((options) => list(options));

program
  .command('start [command...]')
  .description('Start sharing your terminal')
  .option('-f, --force', 'Force create a new session')
  .action((command, options) => start(options, command));

program
  .command('stop')
  .description('Stop a sharing session')
  .option('-a, --all', 'Stop all active sessions')
  .option('-s, --sessionId <id>', 'Stop a specific session')
  .action((options) => stop(options));

program.parse();
