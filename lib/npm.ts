import * as fs from "fs";
import * as path from "path";
import * as ini from "ini";
import { homedir } from "os";

const AUTHTOKEN_PARTIAL_KEY = ":_authToken";

/**
 * Returns the path to the user-level .npmrc file without invoking npm.
 * Uses NPM_CONFIG_USERCONFIG if set, otherwise ~/.npmrc.
 * Works with npm, pnpm, and Yarn.
 */
export function getUserNpmrcPath(): string {
  if (process.env.NPM_CONFIG_USERCONFIG) {
    return process.env.NPM_CONFIG_USERCONFIG;
  }
  return path.join(homedir(), ".npmrc");
}

export interface INpmSettings {
  [key: string]: string;
}

/**
 * Represents an .npmrc configuration file and presents an interface
 * for interactions with it.
 */
export class Npmrc {
  public filePath: string;
  public settings: INpmSettings;
  /**
   * @param {string} basePath - path to .npmrc file or directory containing .npmrc file
   */
  constructor(basePath: string) {
    if (!basePath) {
      throw new Error(
        "Npmrc constructor must be called with directory which contains the .npmrc file"
      );
    }

    if (!basePath.endsWith(".npmrc")) {
      basePath = path.join(basePath, ".npmrc");
    }

    this.filePath = basePath;
    this.settings = {};
  }

  /**
   * Inspects this object's settings for registry entries
   * and returns an array of Registry objects for the ones
   * it finds.
   * @returns {Registry[]}
   */
  getRegistries(): Array<Registry> {
    let settingsKeys = Object.getOwnPropertyNames(this.settings);
    let registries: Array<Registry> = [];

    settingsKeys.forEach(key => {
      if (key.indexOf("registry") > -1) {
        registries.push(new Registry(this.settings[key]));
      }
    });

    return registries;
  }

  /**
   * Reads the contents of the .npmrc file corresponding
   * to this object then parses and initializes settings.
   * When finished, returns this object.
   */
  async readSettingsFromFile(): Promise<Npmrc> {
    let that = this;

    return new Promise<Npmrc>((resolve, reject) => {
      fs.readFile(that.filePath, "utf8", (err, data) => {
        if (err && err.code !== "ENOENT") {
          reject(err);
        } else {
          try {
            console.log("config from", that.filePath);
            that.settings = ini.parse(data || "");

            if (that.settings[""]) {
              delete that.settings[""];
            }

            resolve(that);
          } catch (e) {
            reject(e);
          }
        }
      });
    });
  }

  /**
   * Encodes this object's settings and then
   * writes them to disk at the .npmrc location
   * the object was instantiated from.
   */
  async saveSettingsToFile() {
    return new Promise<void>((resolve, reject) => {
      fs.writeFile(this.filePath, ini.encode(this.settings), err => {
        if (err) {
          reject(err);
        } else {
          resolve();
        }
      });
    });
  }

  /**
   * Checks whether the given key is an auth setting.
   */
  static isAuthSetting(key: string): boolean {
    return key.indexOf(AUTHTOKEN_PARTIAL_KEY) > -1;
  }

  /**
   * Returns an Npmrc instance for the user-level config file.
   * Does not invoke npm; uses homedir or NPM_CONFIG_USERCONFIG.
   */
  static getUserNpmrc(): Npmrc {
    return new Npmrc(getUserNpmrcPath());
  }
}

export interface IBasicAuthSettings extends INpmSettings {
  username: string;
  password: string;
  email: string;
}

/**
 * An abstraction for an npm registry configuration entry
 */
export class Registry {
  public url: string;
  public token: string;
  public basicAuthSettings: IBasicAuthSettings;
  public feed: string;
  public project: string;

  constructor(registryUrl: string) {
    if (!registryUrl) {
      throw new Error(
        "Registry constructor must be called with url for the given registry"
      );
    }

    this.url = registryUrl;
    this.token = "";
    this.basicAuthSettings = {
      username: null,
      password: null,
      email: null
    };

    let feedResult = /_packaging\/(.*)\/npm\/registry/i.exec(registryUrl);
    let projectResult = /https?:\/\/(.*)\.pkgs\.visualstudio/i.exec(
      registryUrl
    );

    if (projectResult === null) {
      projectResult = /https?:\/\/pkgs\.dev\.azure\.com\/(.+?)\//i.exec(
        registryUrl
      );
    }

    this.feed = feedResult && feedResult[1];
    this.project = projectResult && projectResult[1];
  }

  /**
   * Returns the auth settings for this Registry
   */
  getAuthSettings(): INpmSettings {
    let result: INpmSettings = {};

    if (this.token) {
      let match = /https?:(.*)registry/gi.exec(this.url);
      let identifier = match && match[1];

      result[`${identifier}${AUTHTOKEN_PARTIAL_KEY}`] = this.token;
      result[`${identifier}registry/${AUTHTOKEN_PARTIAL_KEY}`] = this.token;
    } else {
      result = this.basicAuthSettings as INpmSettings;
    }

    return result;
  }
}
