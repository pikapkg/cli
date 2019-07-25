import path from 'path';
import {promises as fs} from 'fs';
import yargs from 'yargs-parser';
import resolveFrom from 'resolve-from';
import execa from 'execa';
import chalk from 'chalk';

const EXECA_OPTIONS = {stdio: [process.stdin, process.stdout, process.stderr]};

let isNoop = false;
const output = [];

function log(...args: any[]) {
  output.push([...args]);
  console.log(...args);
}

async function runPackage(packageName: string, args: string[]) {
  if (isNoop) {
    log(['npx', packageName,  ...args]);
    return;
  }
  return execa('npx', [packageName,  ...args], EXECA_OPTIONS);
}

async function getPackageManifest() {
  const packageManifestLoc = path.join(__dirname, '../package.json');
  const packageManifestStr = await fs.readFile(packageManifestLoc, {encoding: 'utf8'});
  return JSON.parse(packageManifestStr);
}

function printHelp() {
  log(`
${chalk.bold('Usage:')}
  pika [command] [flags]
${chalk.bold('Commands:')}
  help                output usage information
  build               ${chalk.underline('https://www.pika.dev/cli/commands/build')}
  install             ${chalk.underline('https://www.pika.dev/cli/commands/install')}
  publish             ${chalk.underline('https://www.pika.dev/cli/commands/publish')}
${chalk.bold('Global Options:')}
  -v, --version       output the CLI version
  -h, --help          output usage information
  --cwd               set the current
  --dry-run           don't actually run any commands
`.trim());
}

async function runExternalCommand(command, commandArgs, parsedArgs): Promise<[boolean, string|undefined]> {
  const cwd = parsedArgs.cwd || process.cwd();
  if (command === 'install') {
    const hasLocalInstall = !!resolveFrom.silent(cwd, '@pika/web');
    await runPackage('@pika/web',  [...commandArgs]);
    return [true, !hasLocalInstall && '@pika/web'];
  }
  if (command === 'build') {
    const hasLocalInstall = !!resolveFrom.silent(cwd, '@pika/pack');
    await runPackage('@pika/pack', ['build', ...commandArgs]);
    return [true, !hasLocalInstall && '@pika/pack'];
  }
  if (command === 'publish') {
    const hasLocalInstall = !!resolveFrom.silent(cwd, '@pika/pack');
    const contentsArg = parsedArgs.contents ? [] : ['--contents', parsedArgs.contents || 'pkg/'];
    await runPackage('np', [...commandArgs, ...contentsArg]);
    return [true, !hasLocalInstall && 'np'];
  }
  return [false, undefined];
}

export async function cli(args: string[]) {
  const parsedArgs = yargs(args.slice(2));
  const commandArgs = args.slice(3);
  const command = args[2] || 'help';
  isNoop = parsedArgs.dryRun || isNoop;

  if (parsedArgs.version) {
    log((await getPackageManifest()).version);
    return output;
  }
  if (command === 'help') {
    printHelp();
    return output;
  }
  const [wasRecognized, recommendedDep] = await runExternalCommand(command, commandArgs, parsedArgs);
  if (!wasRecognized) {
    log(`Command ${command} not recognized.`);
    printHelp();
    return output;
  }
  if (recommendedDep) {
    log(chalk.bgYellowBright(`TIP!`), `Speed up the command next time by installing`, chalk.bold(recommendedDep), `locally.`);
  }

  return output;
}
