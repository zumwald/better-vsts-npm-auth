let vstsAuthClient = require("./vsts-auth-client");

import * as RegistryAuthReducer from "./registry-auth-reducer";
import { Registry } from "./npm";
import { YarnRcYmlRegistry } from "./yarnrcyml";

const k_getVstsLabOauthToken = "getVstsLabOauthToken";

function generateTests(name: string, useLegacyUri: boolean) {
  describe(name, () => {
    let originalEnv: NodeJS.ProcessEnv;

    const k_collectionUrl = "SYSTEM_TEAMFOUNDATIONCOLLECTIONURI";
    beforeAll(() => {
      originalEnv = process.env;
      process.env = {};
      process.env[k_collectionUrl] = useLegacyUri
        ? "https://foo.visualstudio.com"
        : "https://dev.azure.com/foo";
    });

    afterAll(() => {
      process.env = originalEnv;
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
        let registry_foo_npmMirrorFeed = useLegacyUri
          ? "https://foo.pkgs.visualstudio.com/_packaging/npm-mirror/npm/registry"
          : "https://pkgs.dev.azure.com/foo/_packaging/npm-mirror/npm/registry";
        let registry_foo_customFeed = useLegacyUri
          ? "https://foo.pkgs.visualstudio.com/_packaging/custom-pkgs/npm/registry"
          : "https://pkgs.dev.azure.com/foo/_packaging/custom-pkgs/npm/registry";
        let registry_bar_mirrorFeed = useLegacyUri
          ? "https://bar.pkgs.visualstudio.com/_packaging/mirror/npm/registry"
          : "https://pkgs.dev.azure.com/foo/_packaging/mirror/npm/registry";
        let testRegistries = [
          new Registry(registry_bar_mirrorFeed),
          new Registry(registry_foo_npmMirrorFeed),
          new Registry(registry_bar_mirrorFeed),
          new Registry(registry_foo_customFeed),
          new Registry(registry_bar_mirrorFeed),
          new Registry(registry_foo_customFeed),
        ];

        let filteredRegistries = RegistryAuthReducer.filterUniqueVstsRegistries(
          testRegistries
        );
        expect(filteredRegistries).toHaveLength(3);
        [
          registry_bar_mirrorFeed,
          registry_foo_customFeed,
          registry_foo_npmMirrorFeed,
        ].forEach((r) =>
          expect(filteredRegistries).toContainEqual(new Registry(r))
        );
        expect.assertions(4);
      });
      test("given an array containing non-visualstudio.com hosted registries, removes them", () => {
        let registry_vstsFeed = useLegacyUri
          ? "https://bar.pkgs.visualstudio.com/_packaging/mirror/npm/registry"
          : "https://pkgs.dev.azure.com/bar/_packaging/mirror/npm/registry";
        let registry_someOtherFeed = "https://registry.yarnpkg.com";

        let testRegistries = [
          new Registry(registry_someOtherFeed),
          new Registry(registry_vstsFeed),
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
        let sameCollectionEntries = [
          new Registry(
            useLegacyUri
              ? "https://foo.pkgs.visualstudio.com/_packaging/fake/npm/registry/"
              : "https://pkgs.dev.azure.com/foo/_packaging/fake/npm/registry/"
          ),
          new Registry(
            useLegacyUri
              ? "https://foo.pkgs.visualstudio.com/_packaging/other-fake/npm/registry/"
              : "https://pkgs.dev.azure.com/foo/_packaging/other-fake/npm/registry/"
          ),
          new Registry(
            useLegacyUri
              ? "https://foo.pkgs.visualstudio.com/_packaging/some-other/npm/registry/"
              : "https://pkgs.dev.azure.com/foo/_packaging/some-other/npm/registry/"
          ),
        ];
        let otherCollectionEntries = [
          new Registry(
            useLegacyUri
              ? "https://bar.pkgs.visualstudio.com/_packaging/fake/npm/registry/"
              : "https://pkgs.dev.azure.com/bar/_packaging/fake/npm/registry/"
          ),
          new Registry(
            useLegacyUri
              ? "https://baz.pkgs.visualstudio.com/_packaging/other/npm/registry/"
              : "https://pkgs.dev.azure.com/baz/_packaging/other/npm/registry/"
          ),
          new Registry(
            useLegacyUri
              ? "https://bar.pkgs.visualstudio.com/_packaging/other-fake/npm/registry/"
              : "https://pkgs.dev.azure.com/bar/_packaging/other-fake/npm/registry/"
          ),
        ];

        let input = [...sameCollectionEntries, ...otherCollectionEntries];
        let result = RegistryAuthReducer.shardRegistriesByCollection(input);

        expect(result).toHaveProperty(
          "differentCollection",
          otherCollectionEntries
        );
        expect(result).toHaveProperty("sameCollection", sameCollectionEntries);
      });
    });

    describe("has a static method authenticateRegistries which", () => {
      it("gets a user auth token and uses it for all registries when no lab token is available", () => {
        const token = "foo";
        const registries = [
          new Registry(
            useLegacyUri
              ? "https://foo.pkgs.visualstudio.com/_packaging/fake/npm/registry/"
              : "https://pkgs.dev.azure.com/foo/_packaging/fake/npm/registry/"
          ),
          new Registry(
            useLegacyUri
              ? "https://bar.pkgs.visualstudio.com/_packaging/fake/npm/registry/"
              : "https://pkgs.dev.azure.com/bar/_packaging/fake/npm/registry/"
          ),
        ];

        jest
          .spyOn(vstsAuthClient, k_getVstsLabOauthToken)
          .mockReturnValue(null);
        jest
          .spyOn(vstsAuthClient, "getUserAuthToken")
          .mockReturnValue(Promise.resolve(token));

        let result: Promise<Array<
          Registry | YarnRcYmlRegistry
        >> = RegistryAuthReducer.authenticateRegistries(...registries);

        return expect(result)
          .resolves.toBeDefined()
          .then(() => {
            return result.then((r) => {
              expect(r).toHaveLength(2);
              r.forEach((x) => expect(x.token).toEqual(token));
            });
          })
          .then(() => expect.assertions(4));
      });

      describe("when a lab token is available,", () => {
        const labTokenValue = "foobar";

        const sameRegistries = [
          new Registry(
            useLegacyUri
              ? "https://foo.pkgs.visualstudio.com/_packaging/fake/npm/registry/"
              : "https://pkgs.dev.azure.com/foo/_packaging/fake/npm/registry/"
          ),
          new Registry(
            useLegacyUri
              ? "https://foo.pkgs.visualstudio.com/_packaging/other-fake/npm/registry/"
              : "https://pkgs.dev.azure.com/foo/_packaging/other-fake/npm/registry/"
          ),
        ];
        const differentRegistries = [
          new Registry(
            useLegacyUri
              ? "https://baz.pkgs.visualstudio.com/_packaging/fake/npm/registry/"
              : "https://pkgs.dev.azure.com/baz/_packaging/fake/npm/registry/"
          ),
          new Registry(
            useLegacyUri
              ? "https://bam.pkgs.visualstudio.com/_packaging/fake/npm/registry/"
              : "https://pkgs.dev.azure.com/bam/_packaging/fake/npm/registry/"
          ),
          new Registry(
            useLegacyUri
              ? "https://baz.pkgs.visualstudio.com/_packaging/fake/npm/registry/"
              : "https://pkgs.dev.azure.com/baz/_packaging/fake/npm/registry/"
          ),
        ];

        beforeEach(() => {
          jest
            .spyOn(vstsAuthClient, k_getVstsLabOauthToken)
            .mockReturnValue(labTokenValue);
        });

        test("applies the lab token to all registries hosted in the same VSTS project collection", async () => {
          let result = await RegistryAuthReducer.authenticateRegistries(
            ...sameRegistries,
            ...differentRegistries
          );

          expect(result).toHaveLength(sameRegistries.length);
          result.forEach((x) => expect(x.token).toEqual(labTokenValue));
          expect.assertions(1 + sameRegistries.length);
        });

        test("does not authenticate the any registries which are not in the same project colleciton", async () => {
          let result = await RegistryAuthReducer.authenticateRegistries(
            ...differentRegistries
          );

          expect(result).toHaveLength(0);
        });
      });
    });
  });
}

generateTests("(legacy) The class Registry Auth Reducer", true);
generateTests("The class Registry Auth Reducer", false);
