import * as path from "path";
import * as fs from "fs";
import * as yaml from "js-yaml";
import { getUserNpmrcPath } from "./npm";

export type IYarnRcYmlSettings = {
  [key: string]: IYarnRcYmlSettings | string;
}

/**
 * Represents an .yarnrc.yml configuration file and presents an interface
 * for interactions with it.
 */
 export class YarnrcYml {
  public filePath: string;
  public settings: IYarnRcYmlSettings;

  /**
   * @param {string} basePath - path to .yarnrc.yml file or directory containing .yarnrc.yml file
   */
   constructor(basePath: string) {
    if (!basePath) {
      throw new Error(
        "Yarnrcyml constructor must be called with directory which contains the .yarnrc.yml file"
      );
    }

    if (!basePath.endsWith(".yarnrc.yml")) {
      basePath = path.join(basePath, ".yarnrc.yml");
    }

    this.filePath = basePath;
    this.settings = {};
  }

  /**
   * Returns a YarnrcYml instance for the user-level config file.
   * Does not invoke npm; uses same path convention as user .npmrc.
   */
   static getUserNpmrc(): YarnrcYml {
    const userNpmrcPath = getUserNpmrcPath();
    let userConfigPath: string;
    if (userNpmrcPath.endsWith(".npmrc")) {
      userConfigPath = path.join(
        userNpmrcPath.substring(0, userNpmrcPath.length - ".npmrc".length),
        ".yarnrc.yml"
      );
    } else {
      userConfigPath = path.join(path.dirname(userNpmrcPath), ".yarnrc.yml");
    }
    return new YarnrcYml(userConfigPath);
  }

  /**
   * Inspects this object's settings for registry entries
   * and returns an array of Registry objects for the ones
   * it finds.
   * @returns {Registry[]}
   */
   getRegistries(settings?: IYarnRcYmlSettings): Array<YarnRcYmlRegistry> {
    let settingsKeys = Object.getOwnPropertyNames(settings || this.settings);
    let registries: Array<YarnRcYmlRegistry> = [];

    settingsKeys.forEach(key => {
      const settingValue = settings ? settings[key] : this.settings[key];
      if (typeof settingValue === "object") {
        registries.push(...this.getRegistries(settingValue))
      } else {
        if (key.indexOf("npmRegistryServer") > -1) {
          registries.push(new YarnRcYmlRegistry(settingValue));
        }
      }      
    });

    return registries;
  }

  /**
   * Reads the contents of the .yarnrc.yml file corresponding
   * to this object then parses and initializes settings.
   * When finished, returns this object.
   */
   async readSettingsFromFile(): Promise<YarnrcYml> {
    let that = this;

    return new Promise<YarnrcYml>((resolve, reject) => {
      fs.readFile(that.filePath, "utf8", (err, data) => {
        if (err && err.code !== "ENOENT") {
          reject(err);
        } else {
          try {
            console.log("config from", that.filePath);
            that.settings = yaml.load(data || "") as IYarnRcYmlSettings || {};

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
   * writes them to disk at the .yarnrc location
   * the object was instantiated from.
   */
   async saveSettingsToFile() {
    return new Promise<void>((resolve, reject) => {
      fs.writeFile(this.filePath, yaml.dump(this.settings), err => {
        if (err) {
          reject(err);
        } else {
          resolve();
        }
      });
    });
  }
}

export interface IYarnRcYmlBasicAuthSettings {
  username: string;
  password: string;
}

export class YarnRcYmlRegistry {
  public url: string;
  public token: string;
  public feed: string;
  public project: string;
  public basicAuthSettings: IYarnRcYmlBasicAuthSettings;

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
   getAuthSettings(): IYarnRcYmlSettings {
    let result: IYarnRcYmlSettings = {};

    if (this.token) {
      let match = /https?:(.*)registry/gi.exec(this.url);
      let identifier = match && match[1];

      result.npmRegistries = {
        [`${identifier}registry/`]: {
          'npmAuthToken': this.token,
        }
      };
    } else {
      if (this.basicAuthSettings.username && this.basicAuthSettings.password) {
        result.npmAuthIdent = `${this.basicAuthSettings.username}:${this.basicAuthSettings.password}`;
      }
    }

    return result;
  }
}