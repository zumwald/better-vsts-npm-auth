jest.mock("vsts-task-lib/task");

const { RegistryAuthReducer } = require("./registry-auth-reducer");
let { Registry } = require("./npm");
let vstsAuthClient = require("./vsts-auth-client");
let { getEndpointAuthorization } = require("vsts-task-lib/task");

const k_getVstsLabOauthToken = "getVstsLabOauthToken";

describe("The class Registry Auth Reducer", () => {
  let originalEnv;

  beforeAll(() => {
    originalEnv = process.env;
  });

  beforeEach(() => {
    process.env = {};
  });

  afterEach(() => {
    jest.resetAllMocks();
    expect.hasAssertions();
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  describe("has a static method filterUniqueVstsRegistries which", () => {
    test("given an array containing duplicate registries, removes the redundant entries", () => {
      let registry_foo_npmMirrorFeed =
        "https://foo.pkgs.visualstudio.com/_packaging/npm-mirror/npm/registry";
      let registry_foo_customFeed =
        "https://foo.pkgs.visualstudio.com/_packaging/custom-pkgs/npm/registry";
      let registry_bar_mirrorFeed =
        "https://bar.pkgs.visualstudio.com/_packaging/mirror/npm/registry";
      let testRegistries = [
        new Registry(registry_bar_mirrorFeed),
        new Registry(registry_foo_npmMirrorFeed),
        new Registry(registry_bar_mirrorFeed),
        new Registry(registry_foo_customFeed),
        new Registry(registry_bar_mirrorFeed),
        new Registry(registry_foo_customFeed)
      ];

      let filteredRegistries = RegistryAuthReducer.filterUniqueVstsRegistries(
        testRegistries
      );
      expect(filteredRegistries).toHaveLength(3);
      [
        registry_bar_mirrorFeed,
        registry_foo_customFeed,
        registry_foo_npmMirrorFeed
      ].forEach(r =>
        expect(filteredRegistries).toContainEqual(new Registry(r))
      );
      expect.assertions(4);
    });
    test("given an array containing non-visualstudio.com hosted registries, removes them", () => {
      let registry_vstsFeed =
        "https://bar.pkgs.visualstudio.com/_packaging/mirror/npm/registry";
      let registry_someOtherFeed = "https://registry.yarnpkg.com";

      let testRegistries = [
        new Registry(registry_someOtherFeed),
        new Registry(registry_vstsFeed)
      ];
      let filteredRegistries = RegistryAuthReducer.filterUniqueVstsRegistries(
        testRegistries
      );
      expect(filteredRegistries).toHaveLength(1);
      expect(filteredRegistries).toContainEqual(
        new Registry(registry_vstsFeed)
      );
    });
  });

  describe("has a static method shardRegistriesByCollection which", () => {
    test("given null or empty input, returns an appropriate default result", () => {
      let result = RegistryAuthReducer.shardRegistriesByCollection([]);
      expect(result).toHaveProperty("sameCollection", []);
      expect(result).toHaveProperty("differentCollection", []);
    });

    test("given input with a mixture of internal and external registries, sorts them into the proper result", () => {
      process.env["SYSTEM_TEAMFOUNDATIONCOLLECTIONURI"] =
        "https://foo.visualstudio.com";
      let sameCollectionEntries = [
        new Registry(
          "https://foo.pkgs.visualstudio.com/_packaging/fake/npm/registry/"
        ),
        new Registry(
          "https://foo.pkgs.visualstudio.com/_packaging/other-fake/npm/registry/"
        ),
        new Registry(
          "https://foo.pkgs.visualstudio.com/_packaging/some-other/npm/registry/"
        )
      ];
      let otherCollectionEntries = [
        new Registry(
          "https://bar.pkgs.visualstudio.com/_packaging/fake/npm/registry/"
        ),
        new Registry(
          "https://baz.pkgs.visualstudio.com/_packaging/other/npm/registry/"
        ),
        new Registry(
          "https://bar.pkgs.visualstudio.com/_packaging/other-fake/npm/registry/"
        )
      ];

      let input = [...sameCollectionEntries, ...otherCollectionEntries];
      let result = RegistryAuthReducer.shardRegistriesByCollection(input);

      expect(result).toHaveProperty("sameCollection", sameCollectionEntries);
      expect(result).toHaveProperty(
        "differentCollection",
        otherCollectionEntries
      );
    });
  });

  describe("has a static method authenticateRegistriesWithServiceEndpoint which", () => {
    let registriesWithAuth = [
      new Registry(
        "https://bar.pkgs.visualstudio.com/_packaging/fake/npm/registry/"
      ),
      new Registry(
        "https://baz.pkgs.visualstudio.com/_packaging/other/npm/registry/"
      ),
      new Registry(
        "https://bar.pkgs.visualstudio.com/_packaging/other-fake/npm/registry/"
      )
    ];
    let registriesMissingAuth = [
      new Registry(
        "https://fake.pkgs.visualstudio.com/_packaging/other/npm/registry/"
      ),
      new Registry(
        "https://anotherfake.pkgs.visualstudio.com/_packaging/other-fake/npm/registry/"
      )
    ];
    let allRegistries;
    let endpointResults = Promise.resolve([
      {
        /*id: "1",
        name: "some bar package registry",
        type: "Token",*/
        url: "https://bar.pkgs.visualstudio.com/_packaging/fake/npm/registry/"
      },
      {
        /*id: "2",
        name: "some other baz package registry",
        type: "Token",*/
        url: "https://baz.pkgs.visualstudio.com/_packaging/other/npm/registry/"
      },
      {
        /*id: "3",
        name: "some other fake bar package registry",
        type: "UsernamePassword",*/
        url:
          "https://bar.pkgs.visualstudio.com/_packaging/other-fake/npm/registry/"
      }
    ]);
    const serviceEndpointsFn = "getServiceEndpoints";
    const apiTokenValue = "foobar";

    beforeEach(() => {
      jest
        .spyOn(vstsAuthClient, serviceEndpointsFn)
        .mockReturnValue(endpointResults);

      allRegistries = [...registriesWithAuth, ...registriesMissingAuth];

      getEndpointAuthorization.mockImplementation(() => ({
        scheme: "Token",
        parameters: {
          apitoken: apiTokenValue
        }
      }));
    });

    test("returns an empty array when no registries match any of the endpoint authorizations", () => {
      jest
        .spyOn(vstsAuthClient, serviceEndpointsFn)
        .mockReturnValue(Promise.resolve([]));

      return expect(
        RegistryAuthReducer.authenticateRegistriesWithServiceEndpoint(
          allRegistries
        )
      ).resolves.toEqual([]);
    });

    test("writes a warning message when some of the registries provided do not have service endpoints", () => {
      let consoleWarnSpy = jest.spyOn(console, "warn");

      return expect(
        RegistryAuthReducer.authenticateRegistriesWithServiceEndpoint(
          allRegistries
        )
      )
        .resolves.toBeDefined()
        .then(() => {
          expect(consoleWarnSpy).toHaveBeenCalledTimes(1);
        });
    });

    test("returns only the registries which have service endpoint authorizations", () => {
      let result = RegistryAuthReducer.authenticateRegistriesWithServiceEndpoint(
        allRegistries
      );

      return expect(result)
        .resolves.toBeDefined()
        .then(() => {
          return result.then(result => {
            registriesWithAuth.forEach(r => {
              expect(result.findIndex(x => x.url === r.url)).not.toEqual(-1);
            });

            expect.assertions(registriesWithAuth.length + 1);
          });
        });
    });

    test("sets the auth credentials when the endpoint scheme is 'UsernamePassword'", () => {
      const userName = "someuser";
      const password = "secret";

      getEndpointAuthorization.mockImplementation(() => ({
        scheme: "UsernamePassword",
        parameters: {
          username: userName,
          email: userName,
          password: password
        }
      }));

      let result = RegistryAuthReducer.authenticateRegistriesWithServiceEndpoint(
        allRegistries
      );

      return expect(result)
        .resolves.toBeDefined()
        .then(() => {
          return result.then(result => {
            result.forEach(r => {
              expect(r.basicAuthSettings).toHaveProperty("username", userName);
              expect(r.basicAuthSettings).toHaveProperty("email", userName);
              expect(r.basicAuthSettings).toHaveProperty("password", password);
            });
          });
        })
        .then(() => expect.assertions(registriesWithAuth.length * 3 + 1));
    });

    test("sets the auth credentials when the endpoint scheme is 'Token'", () => {
      let endpointResults = RegistryAuthReducer.authenticateRegistriesWithServiceEndpoint(
        allRegistries
      );

      return expect(endpointResults)
        .resolves.toBeDefined()
        .then(() => {
          return endpointResults.then(endpointResults => {
            endpointResults.forEach(endpointResult => {
              expect(endpointResult.token).toEqual(apiTokenValue);
            });
            expect.assertions(registriesWithAuth.length + 1);
          });
        });
    });
  });

  describe("has a static method authenticateRegistries which", () => {
    test("gets a user auth token and uses it for all registries when no lab token is available", () => {
      const token = "foo";

      jest
        .spyOn(vstsAuthClient, k_getVstsLabOauthToken)
        .mockReturnValue(undefined);
      let spy_getUserAuthToken = jest
        .spyOn(vstsAuthClient, "getUserAuthToken")
        .mockReturnValue(Promise.resolve(token));
      jest
        .spyOn(RegistryAuthReducer, "filterUniqueVstsRegistries")
        .mockImplementation(() => {
          return [new Registry("foo"), new Registry("bar")];
        });

      let result = RegistryAuthReducer.authenticateRegistries(null);

      return expect(result)
        .resolves.toBeDefined()
        .then(() => {
          return result.then(r => {
            expect(r).toHaveLength(2);
            r.forEach(x => expect(x.token).toEqual(token));
          });
        })
        .then(() => expect.assertions(4));
    });

    describe("when a lab token is available,", () => {
      const projectCollection = "foo";
      beforeAll(() => {
        process.env[
          "SYSTEM_TEAMFOUNDATIONCOLLECTIONURI"
        ] = `https://${projectCollection}.visualstudio.com`;
      });
      const labTokenValue = "foobar";
      const serviceEndpiontTokenValue = "barfoo";

      const sameRegistries = [new Registry("foo"), new Registry("fud")];
      const differentRegistries = [
        new Registry("baz"),
        new Registry("bam"),
        new Registry("bar")
      ];
      const k_shardRegistriesByCollection = "shardRegistriesByCollection";
      let serviceEndpointSpy;

      /**
       * @param {boolean} includeSameRegistries
       * @param {boolean} includeDifferentRegistries
       */
      const mockShardRegistriesByCollectionMethod = (
        includeSameRegistries,
        includeDifferentRegistries
      ) => {
        jest
          .spyOn(RegistryAuthReducer, k_shardRegistriesByCollection)
          .mockImplementation(() => ({
            sameCollection: includeSameRegistries ? [...sameRegistries] : [],
            differentCollection: includeDifferentRegistries
              ? [...differentRegistries]
              : []
          }));
      };

      beforeEach(() => {
        mockShardRegistriesByCollectionMethod(true, true);
        jest
          .spyOn(vstsAuthClient, k_getVstsLabOauthToken)
          .mockReturnValue(labTokenValue);
        serviceEndpointSpy = jest
          .spyOn(
            RegistryAuthReducer,
            "authenticateRegistriesWithServiceEndpoint"
          )
          .mockImplementation(r => {
            let registriesToAuth = [...differentRegistries];
            registriesToAuth.splice(1, 1); // remove the middle entry

            let result = registriesToAuth.map(x => {
              x.token = serviceEndpiontTokenValue;
              return x;
            });
            return Promise.resolve(result);
          });
      });

      test("applies the lab token to all registries hosted in the same VSTS project collection", () => {
        mockShardRegistriesByCollectionMethod(true, false);

        let result = RegistryAuthReducer.authenticateRegistries(null);

        return expect(result)
          .resolves.toHaveLength(sameRegistries.length)
          .then(() => {
            return result.then(r => {
              expect(serviceEndpointSpy).not.toBeCalled();
              r.forEach(x => expect(x.token).toEqual(labTokenValue));
            });
          })
          .then(() => expect.assertions(2 + sameRegistries.length));
      });
      test("fetches credentials from a matching service endpoint for registries outside of the project collection", () => {
        mockShardRegistriesByCollectionMethod(false, true);

        let result = RegistryAuthReducer.authenticateRegistries(null);

        return expect(result)
          .resolves.toHaveLength(2)
          .then(() => {
            return result.then(r => {
              expect(serviceEndpointSpy).toHaveBeenCalledTimes(1);
              r.forEach(x =>
                expect(x.token).toEqual(serviceEndpiontTokenValue)
              );
            });
          })
          .then(() => expect.assertions(4));
      });
      test("returns the combination of all registries which were authenticated", () => {
        let result = RegistryAuthReducer.authenticateRegistries(null);

        return expect(result)
          .resolves.toHaveLength(sameRegistries.length + differentRegistries.length - 1);
      });
    });
  });
});
