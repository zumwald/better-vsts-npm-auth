#!/usr/bin/env node

import { Config } from "./lib/config";
import { run } from "./index";
import { homedir } from "os";
import { join } from "path";
import * as yargs from "yargs";
const DEFAULT_CONFIG_PATH = join(homedir(), ".vstsnpmauthrc");
const input = require("input");

interface IKeyValuePair {
  key: string;
  value: string;
}

async function configSetter(config: Config, argv: IKeyValuePair) {
  config.set(argv.key, argv.value);
}

async function configGetter(config: Config, key: string) {
  if (key) {
    let configObj = config.get();
    let configEntry = configObj[key];

    if (configEntry) {
      console.log(configEntry);
    }
  }
}

async function configDeleter(config: Config, key: string): Promise<void> {
  if (key) {
    let configObject = config.get();
    delete configObject[key];
    config.write(configObject);
  } else {
    // delete the whole config, once user confirms
    let deleteConfig = await input.confrim(
      "Are you sure you want to delete your config file?"
    );
    if (deleteConfig === true) {
      config.delete();
    }
  }
}

function commandBuilder(cmd: (config: Config, args: any) => Promise<void>): (args: any) => void {
  return async (args: any) => {
    let config = new Config(args.configOverride || DEFAULT_CONFIG_PATH);
    await cmd(config, args);
    process.exit(0);
  };
}

yargs
  .usage("Usage: $0 [command] [options]")
  .example("$0", "process the local .npmrc file")
  .example(
    "$0 -n /foo/bar/.npmrc -c /baz/bang/.bettervstsnpmauthcfg",
    "process the .npmrc file located at /foo/bar, use /baz/bang/.bettervstsnpmauthcfg as the config file"
  )
  .example("$0 config foo bar", 'set a config value "foo" to be "bar"')
  .options("n", {
    alias: "npmrcPath",
    describe: "path to npmrc config",
    type: "string"
  })
  .options("c", {
    alias: "configOverride",
    describe: "alternate path to this tool's configuration file",
    type: "string"
  })
  .options("stack", {
    describe: "print the stack trace on error",
    type: "boolean"
  })
  .command({
    command: "config [command]",
    describe: 'modify the config (run "config --help" for more info)',
    builder: (yargs: any) =>
      yargs
        .command({
          command: "set <key> <value>",
          describe: "Set a config variable",
          handler: commandBuilder(configSetter)
        })
        .command({
          command: "get [key]",
          describe: "Get a config variable",
          handler: commandBuilder(configGetter)
        })
        .command({
          command: "delete [key]",
          describe:
            "Delete a config variable. If the variable is not supplied, deletes the entire config.",
          handler: commandBuilder(configDeleter)
        }),
    handler: commandBuilder(configGetter)
  })
  .command({
    command: "$0",
    describe: 'authenticate the user to NPM based on the settings provided',
    handler: commandBuilder(run)
  })
  .help().parse();

// safety first - handle and exit non-zero if we run into issues
let abortProcess = (e: Error) => {
  console.log(e);
  process.exit(1);
};
process.on("uncaughtException", abortProcess);
process.on("unhandledRejection", abortProcess);