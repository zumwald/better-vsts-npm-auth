jest.mock("fs");
jest.mock("path");
jest.mock("child_process");

let path = require("path");
let fs = require("fs");
let { execSync } = require("child_process");

import { Registry, Npmrc } from "./npm";

describe("In the Npm module,", () => {
  afterEach(() => {
    jest.resetAllMocks();
    expect.hasAssertions();
  });

  describe("the Npmrc class", () => {
    /**
     * @type {Npmrc}
     */
    let foo: Npmrc;
    beforeEach(() => (foo = new Npmrc("foo")));

    describe("has a constructor which", () => {
      test("constructs a filePath to a .npmrc file when given a directory", () => {
        path.join.mockImplementation((a: string, b: string) => a + "/" + b);
        let foo = new Npmrc("/some/path");
        expect(foo.filePath).toEqual("/some/path/.npmrc");
      });

      test("uses the filePath as given when it points to a .npmrc file", () => {
        const weirdPath = "/some/path/with/.an-oddly_namedButValid.npmrc";
        let foo = new Npmrc(weirdPath);
        expect(foo.filePath).toEqual(weirdPath);
      });

      test("initialized an empty settings object", () => {
        let foo = new Npmrc("somepath");
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
          cache: "some/path"
        };

        expect(foo.getRegistries()).toEqual([]);
      });

      test("returns an array of Registry objects when settings contains one or more registries", () => {
        const myregistry = "https://myregistry.com";
        const myprivateregistry = "https://private.myregistry.com";

        foo.settings = {
          "always-auth": "false",
          cache: "some/path",
          registry: myregistry,
          "@myscope:registry": myprivateregistry
        };

        let registries = foo.getRegistries();

        expect(registries).not.toEqual([]);
        expect(registries).toHaveLength(2);
        expect(registries[0].url).toEqual(myregistry);
        expect(registries[1].url).toEqual(myprivateregistry);
      });
    });

    describe("has a method readSettingsFromFile which", () => {
      test("rejects when there is an error reading the npmrc file", () => {
        fs.readFile.mockImplementation((_a: any, _b: any, cb: Function) => {
          cb({ code: "ERROR" });
        });

        return expect(foo.readSettingsFromFile()).rejects.toHaveProperty(
          "code",
          "ERROR"
        );
      });

      test("resolves settings as JSON from .npmrc file with entries", () => {
        fs.readFile.mockImplementation((_a: any, _b: any, cb: Function) => {
          cb(null, "this=that\r\n   \n \t\n other=thing");
        });

        return expect(foo.readSettingsFromFile()).resolves.toHaveProperty(
          "settings",
          { this: "that", other: "thing" }
        );
      });

      describe("resolves settings as empty JSON when .npmrc", () => {
        test("is empty", () => {
          fs.readFile.mockImplementation((_a: any, _b: any, cb: Function) => {
            cb(null, "");
          });

          return expect(foo.readSettingsFromFile()).resolves.toHaveProperty(
            "settings",
            {}
          );
        });

        test("is whitespace", () => {
          fs.readFile.mockImplementation((_a: any, _b: any, cb: Function) => {
            cb(null, "\r\n\t  ");
          });

          return expect(foo.readSettingsFromFile()).resolves.toHaveProperty(
            "settings",
            {}
          );
        });

        test("does not exist", () => {
          fs.readFile.mockImplementation((_a: any, _b: any, cb: Function) => {
            cb({ code: "ENOENT" });
          });

          let result = foo.readSettingsFromFile();

          return expect(result)
            .resolves.toBeInstanceOf(Npmrc)
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
          }
        );

        return expect(foo.saveSettingsToFile()).rejects.toEqual(someError);
      });

      test("writes the ini-encoded settings", () => {
        foo.settings = { some: "value" };
        fs.writeFile.mockImplementation(
          (_path: string, content: string, cb: Function) => {
            expect(content).toContain("some=value");
            cb(null);
          }
        );
        return expect(foo.saveSettingsToFile())
          .resolves.toBeUndefined()
          .then(() => {
            expect.assertions(2);
          });
      });
    });

    describe("has a method getUserNpmrc which", () => {
      test("returns an Npmrc object corresponding to the 'userconfig'", () => {
        execSync.mockImplementation(() => "/foobar/.npmrc\r\n");
        path.join.mockImplementation((a: string, b: string) => {
          return a.endsWith("/") ? a + b : a + "/" + b;
        });
        let result = Npmrc.getUserNpmrc();

        expect(result).toBeInstanceOf(Npmrc);
        expect(result).toHaveProperty("filePath", "/foobar/.npmrc");
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
        let fakeRegistry = useLegacyUrl ? `https://${project}.pkgs.visualstudio.com/_packaging/${feed}/npm/registry/` : `https://pkgs.dev.azure.com/${project}/_packaging/${feed}/npm/registry`;
        let o: Registry;
        beforeAll(() => {
          o = new Registry(fakeRegistry);
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
       * @type {Registry}
       */
      let o: Registry;
      beforeEach(() => {
        o = new Registry(useLegacyUrl ?
          "https://foobar.pkgs.visualstudio.com/_packaging/npm-mirror/npm/registry/" : "https://pkgs.dev.azure.com/foobar/_packaging/npm-mirror/npm/registry/"
        );
      });
      afterEach(() => (o = undefined));
      test("returns an object with null values if the Registry does not have a token", () => {
        expect(o.getAuthSettings()).toEqual({
          email: null,
          password: null,
          username: null
        });
      });
      test("returns two keys, one with and one without the 'registry/' suffix", () => {
        const fakeToken = "foo";
        o.token = fakeToken;

        let result = o.getAuthSettings();

        const k_withoutRegistrySuffix = useLegacyUrl ?
          "//foobar.pkgs.visualstudio.com/_packaging/npm-mirror/npm/:_authToken" : "//pkgs.dev.azure.com/foobar/_packaging/npm-mirror/npm/:_authToken";
        const k_withRegistrySuffix = useLegacyUrl ?
          "//foobar.pkgs.visualstudio.com/_packaging/npm-mirror/npm/registry/:_authToken" : "//pkgs.dev.azure.com/foobar/_packaging/npm-mirror/npm/registry/:_authToken";

        expect(Object.getOwnPropertyNames(result)).toHaveLength(2);
        expect(result[k_withoutRegistrySuffix]).toEqual(fakeToken);
        expect(result[k_withRegistrySuffix]).toEqual(fakeToken);
      });
    });
  });
}

generateRegistryTests("(legacy) the Registry class", true);
generateRegistryTests("the Registry class", false);