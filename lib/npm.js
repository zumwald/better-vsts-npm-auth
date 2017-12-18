const fs = require("fs");
const path = require("path");
const ini = require("ini");
const os = require("os");
const { execSync } = require("child_process");

const AUTHTOKEN_PARTIAL_KEY = ":_authToken";

/**
 * Represents an .npmrc configuration file and presents an interface
 * for interactions with it.
 */
class Npmrc {
  /**
   * @param {string} basePath - path to .npmrc file or directory containing .npmrc file
   */
  constructor(basePath) {
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
  getRegistries() {
    let settingsKeys = Object.getOwnPropertyNames(this.settings);
    let registries = [];

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
   * @returns {Promise<Npmrc>}
   */
  readSettingsFromFile() {
    let that = this;

    return new Promise((resolve, reject) => {
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
   * @returns {Promise<void>}
   */
  saveSettingsToFile() {
    return new Promise((resolve, reject) => {
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
   * @param {string} key
   * @returns {boolean}
   */
  static isAuthSetting(key) {
    return key.indexOf(AUTHTOKEN_PARTIAL_KEY) > -1;
  }

  /**
   * Reads NPM settings to determine the location of the
   * userconfig and creates an Npmrc object for it.
   * @returns {Npmrc}
   */
  static getUserNpmrc() {
    let userConfigPath = execSync("npm config get userconfig")
      .toString()
      .trim();

    return new Npmrc(userConfigPath);
  }
}

/**
 * An abstraction for an npm registry configuration entry
 */
class Registry {
  /**
   * @param {string} registryUrl
   */
  constructor(registryUrl) {
    if (!registryUrl) {
      throw new Error(
        "Registry constructor must be called with url for the given registry"
      );
    }

    this.url = registryUrl;
    this.token = "";
    this.basicAuthSettings = {};

    let feedResult = /_packaging\/(.*)\/npm\/registry/i.exec(registryUrl);
    let projectResult = /https?:\/\/(.*)\.pkgs\.visualstudio/i.exec(
      registryUrl
    );

    this.feed = feedResult && feedResult[1];
    this.project = projectResult && projectResult[1];
  }

  /**
   * Returns the auth settings for this Registry
   * @returns {Object.<string, string>}
   */
  getAuthSettings() {
    let result = {};

    if (this.token) {
      let match = /https?:(.*)registry/gi.exec(this.url);
      let identifier = match && match[1];

      result[`${identifier}${AUTHTOKEN_PARTIAL_KEY}`] = this.token;
      result[`${identifier}registry/${AUTHTOKEN_PARTIAL_KEY}`] = this.token;
    } else {
      result = this.basicAuthSettings;
    }

    return result;
  }
}

module.exports = { Npmrc, Registry };
