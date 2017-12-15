const fs = require("fs");
const path = require("path");
const ini = require("ini");
const os = require("os");

class Npmrc {
  constructor(basePath) {
    if (!basePath) {
      throw new Error(
        "Npmrc constructor must be called with directory which contains the .npmrc file"
      );
    }

    this.filePath = path.join(basePath, ".npmrc");
    this.settings = {};
  }

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

  static isAuthSetting(key) {
    return key.indexOf(AUTHTOKEN_PARTIAL_KEY) > -1;
  }

  static getUserNpmrc() {
    let userPath = os.homedir();
    let npm_config_userPath = process.env["npm_config_userconfig"]; // if running in npm context, use source of truth

    if (npm_config_userPath) {
      userPath = npm_config_userPath.replace(".npmrc", "");
    }

    return new Npmrc(userPath);
  }
}

const AUTHTOKEN_PARTIAL_KEY = ":_authToken";

class Registry {
  constructor(registryUrl) {
    if (!registryUrl) {
      throw new Error(
        "Registry constructor must be called with url for the given registry"
      );
    }

    this.url = registryUrl;
    this.token = "";

    let feedResult = /_packaging\/(.*)\/npm\/registry/i.exec(registryUrl);
    let projectResult = /https?:\/\/(.*)\.pkgs\.visualstudio/i.exec(
      registryUrl
    );

    this.feed = feedResult && feedResult[1];
    this.project = projectResult && projectResult[1];
  }

  getAuthKeys() {
    let result = [];

    let match = /https?:(.*)registry/gi.exec(this.url);
    let identifier = match && match[1];

    result[0] = `${identifier}${AUTHTOKEN_PARTIAL_KEY}`;
    result[1] = `${identifier}registry/${AUTHTOKEN_PARTIAL_KEY}`;

    return result;
  }
}

module.exports = { Npmrc, Registry };
