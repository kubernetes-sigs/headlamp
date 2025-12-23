import chalk from 'chalk';
import { getLatestAppRuns } from '../utils/github.js';

interface GetAppRunsOptions {
  latest?: number;
  platform?: string;
  output?: string;
}

const VALID_PLATFORMS = ['all', 'windows', 'mac', 'linux'];
const VALID_OUTPUT_FORMATS = ['simple', 'json'];

export async function getAppRuns(options: GetAppRunsOptions): Promise<void> {
  const limit = options.latest || 1;
  const platform = options.platform || 'all';
  const output = options.output;

  // Validate platform
  if (!VALID_PLATFORMS.includes(platform)) {
    console.error(chalk.red(`Error: Invalid platform "${platform}". Valid options are: ${VALID_PLATFORMS.join(', ')}`));
    process.exit(1);
  }

  // Validate output format
  if (output && !VALID_OUTPUT_FORMATS.includes(output)) {
    console.error(chalk.red(`Error: Invalid output format "${output}". Valid options are: ${VALID_OUTPUT_FORMATS.join(', ')}`));
    process.exit(1);
  }

  if (output !== 'json') {
    const platformDesc = platform === 'all' ? 'each platform' : platform;
    console.log(chalk.blue(`Fetching latest ${limit} app build run${limit > 1 ? 's' : ''} for ${platformDesc}...\n`));
  }

  try {
    const runs = await getLatestAppRuns(limit, platform);

    if (runs.length === 0) {
      if (output === 'json') {
        console.log(JSON.stringify([], null, 2));
      } else {
        console.log(chalk.yellow('No workflow runs found'));
      }
      return;
    }

    // JSON output
    if (output === 'json') {
      console.log(JSON.stringify(runs, null, 2));
      return;
    }

    // Simple output - just platform name and run URL
    if (output === 'simple') {
      runs.forEach((workflowRuns) => {
        workflowRuns.runs.forEach((run) => {
          console.log(`${workflowRuns.workflowName}: ${run.url}`);
        });
      });
      return;
    }

    // Default detailed output
    runs.forEach((workflowRuns, index) => {
      if (index > 0) {
        console.log(''); // Add spacing between workflows
      }

      console.log(chalk.bold.cyan(`${workflowRuns.workflowName}:`));
      console.log(chalk.dim('─'.repeat(60)));

      workflowRuns.runs.forEach((run, runIndex) => {
        const statusIcon = run.status === 'completed'
          ? (run.conclusion === 'success' ? '✅' : run.conclusion === 'failure' ? '❌' : '⚠️')
          : '🔄';

        const statusColor = run.status === 'completed'
          ? (run.conclusion === 'success' ? chalk.green : run.conclusion === 'failure' ? chalk.red : chalk.yellow)
          : chalk.blue;

        console.log(`\n${runIndex + 1}. ${statusIcon} ${statusColor(run.status.toUpperCase())}${run.conclusion ? ` (${run.conclusion})` : ''}`);
        console.log(chalk.dim(`   Run ID: ${run.id}`));
        console.log(chalk.dim(`   Branch: ${run.headBranch}`));
        console.log(chalk.dim(`   Commit: ${run.headSha.substring(0, 7)}`));
        console.log(chalk.dim(`   Created: ${new Date(run.createdAt).toLocaleString()}`));
        console.log(chalk.cyan(`   URL: ${run.url}`));

        if (run.artifacts.length > 0) {
          console.log(chalk.green(`   Artifacts (${run.artifacts.length}):`));
          run.artifacts.forEach(artifact => {
            console.log(chalk.dim(`     • ${artifact.name} (${formatBytes(artifact.size)})`));
            console.log(chalk.dim(`       Download: ${artifact.downloadUrl}`));
          });
        } else if (run.status === 'completed' && run.conclusion === 'success') {
          console.log(chalk.yellow(`   No artifacts available`));
        }
      });
    });

    console.log('\n' + chalk.dim('─'.repeat(60)));
    console.log(chalk.blue('\nView all runs at:'));
    console.log(chalk.cyan('https://github.com/kubernetes-sigs/headlamp/actions'));
  } catch (error) {
    if (output === 'json') {
      console.error(JSON.stringify({ error: String(error) }, null, 2));
    } else {
      console.error(chalk.red('Error fetching app runs:'));
      console.error(error);
    }
    process.exit(1);
  }
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
}
