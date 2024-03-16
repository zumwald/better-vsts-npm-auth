jest.mock("fs");
jest.mock("path");
jest.mock("child_process");

let path = require("path");
let fs = require("fs");
let { execSync } = require("child_process");

import { IYarnRcYmlSettings, YarnrcYml, YarnRcYmlRegistry } from "./yarnrcyml";

describe("In the YarnRcYml module,", () => {
  afterEach(() => {
    jest.resetAllMocks();
    expect.hasAssertions();
  });

  describe("the YarnRcYml class", () => {
    /**
     * @type {YarnrcYml}
     */
    let foo: YarnrcYml;
    beforeEach(() => (foo = new YarnrcYml("foo")));

    describe("has a constructor which", () => {
      test("constructs a filePath to a .yarnrc.yml file when given a directory", () => {
        path.join.mockImplementation((a: string, b: string) => a + "/" + b);
        let foo = new YarnrcYml("/some/path");
        expect(foo.filePath).toEqual("/some/path/.yarnrc.yml");
      });

      test("uses the filePath as given when it points to a .yarnrc.yml file", () => {
        const weirdPath = "/some/path/with/.an-oddly_namedButValid.yarnrc.yml";
        let foo = new YarnrcYml(weirdPath);
        expect(foo.filePath).toEqual(weirdPath);
      });

      test("initialized an empty settings object", () => {
        let foo = new YarnrcYml("somepath");
        expect(foo.settings).toEqual({});
      });
    });

    describe("has a method getRegistries which", () => {
      test("returns an empty array when there are no settings", () => {
        expect(foo.getRegistries()).toEqual([]);
      });

      test("returns an empty array when none of the settings are registreies", () => {
        foo.settings = {
          "always-auth": "true",
          cache: "some/path",
        };

        expect(foo.getRegistries()).toEqual([]);
      });

      test("returns an array of Registry objects when settings contains one or more registries", () => {
        const myregistry = "https://myregistry.com";
        const myprivateregistry = "https://private.myregistry.com";

        foo.settings = {
          "always-auth": "false",
          npmRegistryServer: myregistry,
          npmScopes: {
            private: {
              npmRegistryServer: myprivateregistry,
            },
          },
        };

        let registries = foo.getRegistries();

        expect(registries).not.toEqual([]);
        expect(registries).toHaveLength(2);
        expect(registries[0].url).toEqual(myregistry);
        expect(registries[1].url).toEqual(myprivateregistry);
      });

      test("applies global npmAlwaysAuth setting to each registry", () => {
        const registryUrl = "https://registry.example.com";
        foo.settings = {
          npmAlwaysAuth: true,
          npmRegistryServer: registryUrl,
        };

        let registries = foo.getRegistries();

        expect(registries).toHaveLength(1);
        expect(registries[0]).toBeInstanceOf(YarnRcYmlRegistry);
        expect(registries[0].alwaysAuth).toEqual(true);
      });

      test("does not apply global npmAlwaysAuth when it is not set", () => {
        const registryUrl = "https://registry.example.com";
        foo.settings = {
          npmRegistryServer: registryUrl,
        };

        let registries = foo.getRegistries();

        expect(registries).toHaveLength(1);
        expect(registries[0]).toBeInstanceOf(YarnRcYmlRegistry);
        expect(registries[0].alwaysAuth).toEqual(false);
      });
    });

    describe("has a method readSettingsFromFile which", () => {
      test("rejects when there is an error reading the .yarnrc.yml file", () => {
        fs.readFile.mockImplementation((_a: any, _b: any, cb: Function) => {
          cb({ code: "ERROR" });
        });

        return expect(foo.readSettingsFromFile()).rejects.toHaveProperty(
          "code",
          "ERROR",
        );
      });

      test("resolves settings as JSON from .yarnrc.yml file with entries", () => {
        const registryName =
          "//foo.pkgs.visualstudio.com/_packaging/npm-mirror/npm/registry/";
        const token = "foobar";
        fs.readFile.mockImplementation((_a: any, _b: any, cb: Function) => {
          cb(
            null,
            `npmRegistries:\n  "${registryName}":\n    npmAlwaysAuth: true\n    npmAuthToken: ${token}\n`,
          );
        });

        return expect(foo.readSettingsFromFile()).resolves.toHaveProperty(
          "settings",
          {
            npmRegistries: {
              ["//foo.pkgs.visualstudio.com/_packaging/npm-mirror/npm/registry/"]: {
                npmAlwaysAuth: true,
                npmAuthToken: "foobar",
              },
            },
          },
        );
      });

      describe("resolves settings as empty JSON when .yarnrc.yml", () => {
        test("is empty", () => {
          fs.readFile.mockImplementation((_a: any, _b: any, cb: Function) => {
            cb(null, "");
          });

          return expect(foo.readSettingsFromFile()).resolves.toHaveProperty(
            "settings",
            {},
          );
        });

        test("is whitespace", () => {
          fs.readFile.mockImplementation((_a: any, _b: any, cb: Function) => {
            cb(null, "\r\n\t  ");
          });

          return expect(foo.readSettingsFromFile()).resolves.toHaveProperty(
            "settings",
            {},
          );
        });

        test("does not exist", () => {
          fs.readFile.mockImplementation((_a: any, _b: any, cb: Function) => {
            cb({ code: "ENOENT" });
          });

          let result = foo.readSettingsFromFile();

          return expect(result)
            .resolves.toBeInstanceOf(YarnrcYml)
            .then(() => expect(result).resolves.toHaveProperty("settings", {}));
        });
      });
    });

    describe("has a method saveSettingsToFile which", () => {
      test("rejects if there is an error writing the file", () => {
        const someError = { error: "foo" };
        fs.writeFile.mockImplementation(
          (_path: string, _content: string, cb: Function) => {
            cb(someError);
          },
        );

        return expect(foo.saveSettingsToFile()).rejects.toEqual(someError);
      });

      test("writes the js-yaml-encoded settings", () => {
        foo.settings = { some: "value" };
        fs.writeFile.mockImplementation(
          (_path: string, content: string, cb: Function) => {
            expect(content).toContain("some: value");
            cb(null);
          },
        );
        return expect(foo.saveSettingsToFile())
          .resolves.toBeUndefined()
          .then(() => {
            expect.assertions(2);
          });
      });
    });

    describe("has a method getUserNpmrc which", () => {
      test("returns an YarnrcYml object corresponding to the 'userconfig'", () => {
        execSync.mockImplementation(() => "/foobar/.npmrc\r\n");
        path.join.mockImplementation((a: string, b: string) => {
          return a.endsWith("/") ? a + b : a + "/" + b;
        });
        let result = YarnrcYml.getUserNpmrc();

        expect(result).toBeInstanceOf(YarnrcYml);
        expect(result).toHaveProperty("filePath", "/foobar/.yarnrc.yml");
      });

      test("returns the userconfig path with .yarnrc.yml at the end, if the path doesn't end with .npmrc", () => {
        execSync.mockImplementation(() => "/foobar/\r\n");
        path.join.mockImplementation((a: string, b: string) => {
          return a.endsWith("/") ? a + b : a + "/" + b;
        });
        let result = YarnrcYml.getUserNpmrc();

        expect(result).toBeInstanceOf(YarnrcYml);
        expect(result).toHaveProperty("filePath", "/foobar/.yarnrc.yml");
      });
    });
  });
});

function generateRegistryTests(name: string, useLegacyUrl: boolean) {
  describe(name, () => {
    describe("has a constructor which", () => {
      describe("constructs an object", () => {
        let feed = "npm-mirror";
        let project = "foobar";
        let fakeRegistry = useLegacyUrl
          ? `https://${project}.pkgs.visualstudio.com/_packaging/${feed}/npm/registry/`
          : `https://pkgs.dev.azure.com/${project}/_packaging/${feed}/npm/registry`;
        let o: YarnRcYmlRegistry;
        beforeAll(() => {
          o = new YarnRcYmlRegistry(fakeRegistry);
        });

        test("has a public property 'url'", () => {
          expect(o).toHaveProperty("url", fakeRegistry);
        });

        test("has a public property 'token' which is empty by default", () => {
          expect(o).toHaveProperty("token", "");
        });

        test("has a public property 'feed' which is the name of the VSTS feed", () => {
          expect(o).toHaveProperty("feed", feed);
        });

        test("has a public property 'project' which is the name of the VSTS project collection", () => {
          expect(o).toHaveProperty("project", project);
        });
      });
    });

    describe("has a method 'getAuthSettings' which", () => {
      // TODO - test for basic auth settings and token vs. basic auth precedence

      /**
       * @type {YarnRcYmlRegistry}
       */
      let o: YarnRcYmlRegistry;
      beforeEach(() => {
        o = new YarnRcYmlRegistry(
          useLegacyUrl
            ? "https://foobar.pkgs.visualstudio.com/_packaging/npm-mirror/npm/registry/"
            : "https://pkgs.dev.azure.com/foobar/_packaging/npm-mirror/npm/registry/",
        );
      });
      afterEach(() => (o = undefined));
      test("returns an empty object if the Registry does not have a token and does not have basicAuthSettings", () => {
        expect(o.getAuthSettings()).toEqual({});
      });
      test("returns an object with npmAuthIdent set to the username and password if both are populated and there is no token", () => {
        o.basicAuthSettings = {
          username: "foo",
          password: "bar",
        };

        let result = o.getAuthSettings();
        expect(result.npmAuthIdent).toEqual("foo:bar");
      });
      test("returns a npmRegistries object, containing a key with the 'registry/' suffix", () => {
        const fakeToken = "foo";
        o.token = fakeToken;

        let result = o.getAuthSettings();
        const k_withRegistrySuffix: string = useLegacyUrl
          ? "//foobar.pkgs.visualstudio.com/_packaging/npm-mirror/npm/registry/"
          : "//pkgs.dev.azure.com/foobar/_packaging/npm-mirror/npm/registry/";

        const npmRegistries = result.npmRegistries as IYarnRcYmlSettings;
        expect(Object.getOwnPropertyNames(result)).toHaveLength(1);
        expect(
          (npmRegistries[k_withRegistrySuffix] as IYarnRcYmlSettings)
            .npmAuthToken,
        ).toEqual(fakeToken);
      });
    });
  });
}

generateRegistryTests("(legacy) the YarnRcYmlRegistry class", true);
generateRegistryTests("the YarnRcYmlRegistry class", false);
