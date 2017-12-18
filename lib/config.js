const fs = require("fs");
const os = require("os");
const path = require("path");
const ini = require("ini");

const DEFAULT_CONFIG_PATH = path.join(os.homedir(), ".vstsnpmauthrc");
let configPathOverride = undefined;
/**
 * @returns{string}
 */
const getConfigPath = () => configPathOverride ? configPathOverride : DEFAULT_CONFIG_PATH;

const defaults = {
  clientId: "DE516D90-B63E-4994-BA64-881EA988A9D2",
  redirectUri: "https://stateless-vsts-oauth.azurewebsites.net/oauth-callback",
  tokenEndpoint: "https://stateless-vsts-oauth.azurewebsites.net/token-refresh",
  tokenExpiryGraceInMs: "1800000"
};

/**
 * Represents the user configuration for better-vsts-npm-auth
 * and presents an interface for interactions with it.
 */
class Config {
  /**
   * Uses the given path as the location for the module's
   * configuration file instead of the default.
   * @param {string} path 
   */
  static setConfigPath(path) {
    configPathOverride = path;
  }

  /**
   * Adds or updates the given setting and writes it
   * to the configuration file.
   * @param {string} key 
   * @param {string} val 
   */
  static set(key, val) {
    let configObj = Config.get();

    configObj[key] = val;

    Config.write(configObj);
  }

  /**
   * Forces a write of the given object to the
   * configuration file.
   * @param {Object} obj 
   */
  static write(obj) {
    let configContents = ini.encode(obj);
    let configPath = getConfigPath();
    fs.writeFileSync(configPath, configContents);
  }

  /**
   * Reads the configuration file from disk and
   * returns the parsed config object.
   * @returns {Object.<string, string>}
   */
  static get() {
    let configContents = "";

    try {
      // we're deliberately using a sync call here because
      // otherwise the yargs command doesn't prevent the
      // rest of the program from running
      configContents = fs.readFileSync(getConfigPath(), "utf8");
    } catch (e) {
      // the config file is optional, so if it doesn't exist
      // just swallow the error and return the default (empty)
      // object. Otherwise, throw the error.
      if (e.code !== "ENOENT") {
        throw e;
      }
    }

    let configObj = ini.parse(configContents);
    // merge with defaults, with user specified config taking precedence
    return Object.assign({}, defaults, configObj);
  }
}

module.exports = Config;
