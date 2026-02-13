/**
 * Print error message and optionally stack trace if verbose mode is enabled
 */
export function printError(error: Error | unknown, verbose?: boolean): void {
  const err = error instanceof Error ? error : new Error(String(error));
  console.error(`\x1b[31m✖ Error: ${err.message}\x1b[0m`);
  if (verbose || process.argv.includes('--verbose')) {
    console.error('\n\x1b[90mStack trace:\x1b[0m');
    console.error(err.stack);
  }
}

/**
 * Check if verbose mode is enabled via command line
 */
export function isVerbose(): boolean {
  return process.argv.includes('--verbose');
}
