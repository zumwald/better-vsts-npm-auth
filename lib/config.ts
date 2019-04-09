import { writeFileSync, readFileSync } from "fs";
import { encode, parse } from "ini";


const defaults = {
  clientId: "DE516D90-B63E-4994-BA64-881EA988A9D2",
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
  constructor(private configPath: string) { };

  /**
   * Adds or updates the given setting and writes it
   * to the configuration file.
   */
  set(key: string, val: string) {
    let configObj = this.get();

    configObj[key] = val;

    this.write(configObj);
  }

  /**
   * Forces a write of the given object to the
   * configuration file.
   */
  write(obj: IConfigDictionary) {
    let configContents = encode(obj);
    writeFileSync(this.configPath, configContents);
  }

  delete() {
    this.write({});
  }

  /**
   * Reads the configuration file from disk and
   * returns the parsed config object.
   */
  get(): IConfigDictionary {
    let configContents = "";

    try {
      // we're deliberately using a sync call here because
      // otherwise the yargs command doesn't prevent the
      // rest of the program from running
      configContents = readFileSync(this.configPath, "utf8");
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
