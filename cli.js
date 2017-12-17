#!/usr/bin/env node

const config = require("./lib/config.js");
const task = require("./index.js");
const input = require("input");

let runningCmd = false;

// commands
const CONFIG_SETTER = argv => {
  config.set(argv.key, argv.value);
  return Promise.resolve();
};
const CONFIG_GETTER = argv => {
  let configObj = config.get();

  if (argv.key) {
    configObj = configObj[argv.key];
  }

  console.log(configObj);
  return Promise.resolve();
};
const CONFIG_DELETER = argv => {
  let configObj = config.get();
  let writeConfig = o => {
    console.log("new config:\n", o);
    config.write(o);
  };

  if (configObj[argv.key]) {
    delete configObj[argv.key];
    writeConfig(configObj);
    return Promise.resolve();
  } else {
    // get user confirmation and then delete the whole config
    return input
      .confirm("Are you sure you want to delete your config file?")
      .then(deleteConfig => {
        if (deleteConfig) {
          writeConfig({});
        }
      });
  }
};

const commandBuilder = cmd => {
  return args => {
    runningCmd = true;
    cmd(args).then(() => process.exit(0));
  };
};

const argv = require("yargs")
  .usage("Usage: $0 [command] [options]")
  .example("$0", "process the local .npmrc file")
  .example(
    "$0 -c /foo/bar/.npmrc",
    "process the .npmrc file located at /foo/bar"
  )
  .example("$0 config foo bar", 'set a config value "foo" to be "bar"')
  .options("n", {
    alias: "npmrcPath",
    describe: "path to npmrc config",
    type: "string"
  })
  .config(config.get())
  .command({
    command: "config [command]",
    desc: 'modify the config (run "config --help" for more info)',
    builder: yargs =>
      yargs
        .command({
          command: "set <key> <value>",
          desc: "Set a config variable",
          handler: commandBuilder(CONFIG_SETTER)
        })
        .command({
          command: "get [key]",
          desc: "Get a config variable",
          handler: commandBuilder(CONFIG_GETTER)
        })
        .command({
          command: "delete [key]",
          desc:
            "Delete a config variable. If the variable is not supplied, deletes the entire config.",
          handler: commandBuilder(CONFIG_DELETER)
        }),
    handler: commandBuilder(CONFIG_GETTER)
  })
  .help().argv;

// safety first - handle and exit non-zero if we run into issues
let abortProcess = e => {
  console.log(e);
  process.exit(1);
};
process.on("uncaughtException", abortProcess);
process.on("unhandledRejection", abortProcess);

if (!runningCmd) {
  task.run(argv);
}
