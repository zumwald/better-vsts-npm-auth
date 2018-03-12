#!/usr/bin/env node

import { Config, IConfigDictionary } from "./lib/config";
import { run } from "./index";
const input = require("input");

let runningCmd = false;

interface IKeyValuePair {
  key: string;
  value: string;
}

function configSetter(argv: IKeyValuePair) {
  Config.set(argv.key, argv.value);
}

function configGetter(key: string) {
  if (key) {
    let configObj = Config.get();
    let configEntry = configObj[key];

    if (configEntry) {
      console.log(configEntry);
    }
  }
}

function _deleteConfig() {
  _writeConfig({});
}

function _writeConfig(o: IConfigDictionary) {
  console.log("new config:\n", o);
  Config.write(o);
}

async function configDeleter(key: string): Promise<void> {
  if (key) {
    let configObject = Config.get();
    delete configObject[key];
    _writeConfig(configObject);
  } else {
    // delete the whole config, once user confirms
    let deleteConfig = await input.confrim(
      "Are you sure you want to delete your config file?"
    );
    if (deleteConfig === true) {
      _deleteConfig();
    }
  }
  return Promise.resolve();
}

function commandBuilder(cmd: Function): Function {
  return async (args: any) => {
    runningCmd = true;
    await cmd(args);
    process.exit(0);
  };
}

const argv = require("yargs")
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
  .command({
    command: "config [command]",
    desc: 'modify the config (run "config --help" for more info)',
    builder: (yargs: any) =>
      yargs
        .command({
          command: "set <key> <value>",
          desc: "Set a config variable",
          handler: commandBuilder(configSetter)
        })
        .command({
          command: "get [key]",
          desc: "Get a config variable",
          handler: commandBuilder(configGetter)
        })
        .command({
          command: "delete [key]",
          desc:
            "Delete a config variable. If the variable is not supplied, deletes the entire config.",
          handler: commandBuilder(configDeleter)
        }),
    handler: commandBuilder(configGetter)
  })
  .help().argv;

// safety first - handle and exit non-zero if we run into issues
let abortProcess = (e: Error) => {
  console.log(e);
  process.exit(1);
};
process.on("uncaughtException", abortProcess);
process.on("unhandledRejection", abortProcess);

if (!runningCmd) {
  run(argv);
}
