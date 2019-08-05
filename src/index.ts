import path from 'path';
import {promises as fs} from 'fs';
import yargs from 'yargs-parser';
import resolveFrom from 'resolve-from';
import detectIndent from 'detect-indent';
import execa from 'execa';
import chalk from 'chalk';

const EXECA_OPTIONS = {stdio: [process.stdin, process.stdout, process.stderr]};

let isNoop = false;
const output = [];

function log(...args: any[]) {
  output.push([...args]);
  console.log(...args);
}

async function runPackage(args: string[]) {
  if (isNoop) {
    log(['npx', ...args]);
    return;
  }
  return execa('npx', [...args], EXECA_OPTIONS);
}

async function getPackageManifest(dir = path.join(__dirname, '..')) {
  const packageManifestLoc = path.join(dir, 'package.json');
  const packageManifestStr = await fs.readFile(packageManifestLoc, {encoding: 'utf8'});
  return {pkg: JSON.parse(packageManifestStr), indent: detectIndent(packageManifestStr).indent || undefined};
}

async function savePackageManifest(dir, {pkg, indent}) {
  return fs.writeFile(path.join(dir, 'package.json'), JSON.stringify(pkg, null, indent || 2) + '\n', {encoding: 'utf8'});
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
    await runPackage([hasLocalInstall ? 'pika-web' : '@pika/web',  ...commandArgs]);
    return [true, !hasLocalInstall && '@pika/web'];
  }
  if (command === 'build') {
    const hasLocalInstall = !!resolveFrom.silent(cwd, '@pika/pack');
    await runPackage([hasLocalInstall ? 'pika-pack' : '@pika/pack', ...commandArgs]);
    return [true, !hasLocalInstall && '@pika/pack'];
  }
  if (command === 'publish') {
    const {pkg, indent} = await getPackageManifest(cwd);
    if (!pkg.scripts.version) {
      log(`${chalk.bold('missing "version" script:')} You'll need to create a fresh build after bumping the master package.json version.`);
      if (pkg.scripts.build) {
        pkg.scripts.version = 'npm run build';
      } else {
        pkg.scripts.version = 'npx @pika/pack';
      }
      log(`Adding the following "version" lifecycle script to your package.json... ` + chalk.bold(`"${pkg.scripts.version}"`));
      await savePackageManifest(cwd, {pkg, indent});
      log(`Please review & commit this change before publishing.`);
      return [true, undefined];
    }

    const hasLocalInstall = !!resolveFrom.silent(cwd, 'np');
    const contentsArg = parsedArgs.contents ? [] : ['--contents', parsedArgs.contents || 'pkg/'];
    await runPackage(['np', ...commandArgs, ...contentsArg]);
    return [true, !hasLocalInstall && 'np'];
  }
  return [false, undefined];
}

export async function cli(args: string[]) {
  // Convert: pika help build [...] => pika build --help [...]
  if (args[2] === 'help' && args[3] && !args[3].startsWith('-')) {
    return cli([args[0], args[1], args[3], '--help', ...args.slice(4)]);
  }

  const parsedArgs = yargs(args.slice(2));
  const commandArgs = args.slice(3);
  const command = args[2] || 'help';
  isNoop = parsedArgs.dryRun || isNoop;

  if (parsedArgs.version) {
    log((await getPackageManifest()).pkg.version);
    return output;
  }
  if (command === 'help') {
    printHelp();
    return output;
  }
  const [wasRecognized, recommendedDep] = await runExternalCommand(command, commandArgs, parsedArgs);
  if (!wasRecognized) {
    log(`Command ${chalk.bold(command)} not recognized.`);
    printHelp();
    return output;
  }
  if (recommendedDep) {
    log(chalk.bgYellowBright(`TIP!`), `Speed up the command next time by installing`, chalk.bold(recommendedDep), `locally.`);
  }

  return output;
}
