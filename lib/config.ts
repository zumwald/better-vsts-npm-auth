import { writeFileSync, readFileSync } from "fs";
import { homedir } from "os";
import { join } from "path";
import { encode, parse } from "ini";

const DEFAULT_CONFIG_PATH = join(homedir(), ".vstsnpmauthrc");
let configPathOverride: string = undefined;

const getConfigPath = (): string =>
  configPathOverride ? configPathOverride : DEFAULT_CONFIG_PATH;

const defaults = {
  clientId: "C0518EF9-B87D-4C07-9132-CF404B18B546",
  redirectUri: "https://stateless-vsts-oauth.azurewebsites.net/oauth-callback",
  tokenEndpoint: "https://stateless-vsts-oauth.azurewebsites.net/token-refresh",
  tokenExpiryGraceInMs: "1800000"
};

export interface IConfigDictionary {
  [key: string]: string;
}

/**
 * Represents the user configuration for better-vsts-npm-auth
 * and presents an interface for interactions with it.
 */
export class Config {
  /**
   * Uses the given path as the location for the module's
   * configuration file instead of the default.
   */
  static setConfigPath(path: string) {
    configPathOverride = path;
  }

  /**
   * Adds or updates the given setting and writes it
   * to the configuration file.
   */
  static set(key: string, val: string) {
    let configObj = Config.get();

    configObj[key] = val;

    Config.write(configObj);
  }

  /**
   * Forces a write of the given object to the
   * configuration file.
   */
  static write(obj: IConfigDictionary) {
    let configContents = encode(obj);
    let configPath = getConfigPath();
    writeFileSync(configPath, configContents);
  }

  /**
   * Reads the configuration file from disk and
   * returns the parsed config object.
   */
  static get(): IConfigDictionary {
    let configContents = "";

    try {
      // we're deliberately using a sync call here because
      // otherwise the yargs command doesn't prevent the
      // rest of the program from running
      configContents = readFileSync(getConfigPath(), "utf8");
    } catch (e) {
      // the config file is optional, so if it doesn't exist
      // just swallow the error and return the default (empty)
      // object. Otherwise, throw the error.
      if (e.code !== "ENOENT") {
        throw e;
      }
    }

    let configObj = parse(configContents);
    // merge with defaults, with user specified config taking precedence
    return Object.assign({}, defaults, configObj) as IConfigDictionary;
  }
}
