jest.mock("fs");
jest.mock("path");

import { Config } from "./config";

// mocked modules
let fs = require("fs");
let ini = require("ini");

describe("The Config module", () => {
  afterEach(() => {
    jest.resetAllMocks();
    expect.hasAssertions();
  });

  const CONFIG_CONTENTS = "foo=bar\r\nbaz=value";
  const DEFAULT_CONFIG_CONTENTS =
    "clientId=DE516D90-B63E-4994-BA64-881EA988A9D2\r\n" +
    "redirectUri=https://stateless-vsts-oauth.azurewebsites.net/oauth-callback\r\n" +
    "tokenEndpoint=https://stateless-vsts-oauth.azurewebsites.net/token-refresh\r\n" +
    "tokenExpiryGraceInMs=1800000";

  beforeEach(() => {
    fs.readFileSync.mockImplementation(() => CONFIG_CONTENTS);
  });

  test("reads the config file from the given location", () => {
    let configOverridePath = "/foo/bar";

    fs.writeFileSync.mockImplementation((p: string) => {
      expect(p).toEqual(configOverridePath);
    });

    let config = new Config(configOverridePath);
    config.write({});
    expect.assertions(1);
  });

  describe("reads the config", () => {
    describe("and applies default values", () => {
      test("when there is no config file", () => {
        fs.readFileSync.mockImplementation(() => {
          throw { code: "ENOENT" };
        });

        let config = (new Config("")).get();

        expect(config).toEqual(ini.parse(DEFAULT_CONFIG_CONTENTS));
      });

      test("when there is a config file, defaults are only applied for keys which are not specified in the file", () => {
        fs.readFileSync.mockImplementation(() => {
          return "clientId=foobar\r\n";
        });

        let config = (new Config("")).get();
        expect(config.clientId).toEqual("foobar");
        expect(config.tokenExpiryGraceInMs).toEqual("1800000");
      });
    });

    test("and throws an error if the file can not be read", () => {
      fs.readFileSync.mockImplementation(() => {
        throw new Error("foobar");
      });

      let config = new Config("");

      expect(() => {
        (config).get();
      }).toThrowError("foobar");
    });

    test("and does not throw an error if the file does not exist yet", () => {
      fs.readFileSync.mockImplementation(() => {
        let e = new Error("ENOENT");
        (e as any).code = "ENOENT";
        throw e;
      });

      let config = new Config("");

      expect(() => {
        config.get();
      }).not.toThrow();
    });
  });

  describe("writes the config", () => {
    test("to disk", () => {
      fs.writeFileSync.mockImplementation((_path: string, content: string) => {
        expect(content).toContain("foo=bar");
      });

      let config = new Config("");

      config.write({ foo: "bar" });
      expect(fs.writeFileSync).toHaveBeenCalledTimes(1);
      expect.assertions(2);
    });

    test("and throws if there is an error", () => {
      fs.writeFileSync.mockImplementation(() => {
        throw new Error("foobar");
      });

      let config = new Config("");

      expect(() => {
        config.write({ foo: "bar" });
      }).toThrowError("foobar");
    });
  });

  describe("clears the config", () => {
    test("on disk", () => {
      fs.writeFileSync.mockImplementation((_path: string, content: string) => {
        expect(content).toHaveLength(0);
      });

      let config = new Config("");

      config.clear();
      expect(fs.writeFileSync).toHaveBeenCalledTimes(1);
      expect.assertions(2);
    })
  })

  describe("sets the config", () => {
    let configContents = "";

    beforeEach(() => {
      fs.writeFileSync.mockImplementation((_path: string, content: string) => {
        configContents = content;
      });

      fs.readFileSync.mockImplementation(() => configContents);
    });

    afterEach(() => {
      configContents = "";
    });

    test("and writes it to disk upon updating the value", () => {
      let config = new Config("");

      config.set("some", "value");
      expect(fs.writeFileSync).toHaveBeenCalledTimes(1);
      expect(configContents.indexOf("some=value") > -1).toBeTruthy();
    });

    test("and ensures prior updates to the config are respected", () => {
      let config = new Config("");

      config.set("key1", "val1");
      expect(configContents.indexOf("key1=val1") > -1).toBeTruthy();
      expect(configContents.indexOf("key2=val2") > -1).toBeFalsy();

      config.set("key2", "val2");
      expect(configContents.indexOf("key1=val1") > -1).toBeTruthy();
      expect(configContents.indexOf("key2=val2") > -1).toBeTruthy();

      expect(fs.writeFileSync).toHaveBeenCalledTimes(2);
    });
  });
});
