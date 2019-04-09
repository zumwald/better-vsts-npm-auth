jest.mock("node-fetch");
jest.mock("jsonwebtoken");
jest.mock("./config");

import {
  AuthorizationError,
  getUserAuthToken,
  setRefreshToken,
  getVstsLabOauthToken
} from "./vsts-auth-client";
import * as querystring from 'querystring';

let fetch = require("node-fetch");
let jwt = require("jsonwebtoken");

describe("In the vsts-auth-client module", () => {
  let originalEnv: NodeJS.ProcessEnv;

  beforeAll(() => {
    originalEnv = process.env;
    process.env = {};
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  beforeEach(() => {
    process.env = {};
  });

  afterEach(() => {
    jest.resetAllMocks();
    expect.hasAssertions();
  });

  describe("the AuthorizationError class", () => {
    test("extends the Error class", () => {
      let x = new AuthorizationError();
      expect(x).toBeInstanceOf(Error);
    });

    test("to pass constructor arguments to the Error class", () => {
      const msg = "foobar";
      let x = new AuthorizationError(msg);
      expect(x).toHaveProperty("message", msg);
    });
  });
  describe("the setRefreshToken static method", () => {
    test("should set the config entry for refresh_token with the given token", () => {
      const mockConfig = getMockConfig();
      const fakeToken = "foo";
      setRefreshToken(mockConfig, fakeToken);

      expect(mockConfig.set).toHaveBeenCalledTimes(1);
      expect(mockConfig.set).toHaveBeenCalledWith("refresh_token", fakeToken);
    });
  });
  describe("the getVstsLabOauthToken static method", () => {
    test("checks the environment variable $SYSTEM_ACCESSTOKEN", () => {
      let fakeValue = "test_systemaccesstoken";
      process.env["SYSTEM_ACCESSTOKEN"] = fakeValue;

      expect(getVstsLabOauthToken()).toEqual(fakeValue);
    })
  });

  describe("the getUserAuthToken static  method", () => {
    const fakeCode = "foo";
    const fakeAccessToken = "baz";
    const nowInMs = 10000;
    const now = nowInMs / 1000;



    beforeEach(() => {
      fetch.mockImplementation((url: string) => {
        const queryString = querystring.stringify({ code: fakeCode });

        expect(url.slice(url.length - queryString.length)).toEqual(queryString);

        return Promise.resolve({
          json: () => {
            return Promise.resolve({ refresh_token: "bar", access_token: fakeAccessToken })
          }
        });
      });
    });

    test("should reject if the config does not have a tokenEndpoint", () => {
      let mockConfig = getMockConfig({});

      return expect(getUserAuthToken(mockConfig)).rejects.toHaveProperty(
        "message",
        "invalid config, missing tokenEndpoint"
      );
    });

    test("should reject if the config does not have a refresh_token", () => {
      let mockConfig = getMockConfig({
        tokenEndpoint: "foo"
      });

      let result = getUserAuthToken(mockConfig);

      return expect(result)
        .rejects.toBeInstanceOf(AuthorizationError)
        .then(() =>
          expect(result).rejects.toHaveProperty(
            "message",
            "missing refresh_token"
          )
        );
    });

    describe("should reject if the token endpoint returns", () => {
      test("an error", () => {
        let mockConfig = getMockConfig();

        const errorObj = { error: "foo" };

        fetch.mockImplementation(() => {
          return Promise.reject(errorObj);
        });

        return expect(getUserAuthToken(mockConfig)).rejects.toEqual(errorObj);
      });

      describe("a response without", () => {
        const testData = [
          { name: "a body", cbArgs: [null, null, null] },
          { name: "a refresh_token in the body", cbArgs: [null, {}, {}] },
          {
            name: "an access_token in the body",
            cbArgs: [null, {}, { refresh_token: "foo" }]
          }
        ];

        testData.forEach(t => {
          test(t.name, () => {
            let mockConfig = getMockConfig();
            fetch.mockImplementation(() => {
              return Promise.resolve({
                json: () => {
                  return Promise.resolve(t.cbArgs[2])
                }
              });
            });

            return expect(getUserAuthToken(mockConfig)).rejects.toContain(
              "malformed response body:\n"
            );
          });
        });
      });
    });

    test("should make requests with refresh_token supplied as the code and return the access_token", () => {
      let mockConfig = getMockConfig();

      jwt.decode.mockImplementation(() => ({ nbf: now }));
      jest.spyOn(Date, "now").mockImplementation(() => nowInMs);
      jest.advanceTimersByTime(1000);

      return expect(getUserAuthToken(mockConfig))
        .resolves.toEqual(fakeAccessToken)
        .then(() => {
          expect(fetch).toHaveBeenCalledTimes(1);
          expect.assertions(3);
        });
    });

    test("should not resolve until after the nbf claim in the returned token is >= the current time", async () => {
      let mockConfig = getMockConfig();
      const delay = 60000; // 1 minute
      jest.spyOn(Date, "now").mockImplementation(() => nowInMs);
      jwt.decode.mockImplementation(() => ({
        nbf: now + delay / 1000
      }));

      global.setTimeout = jest.fn((f, t) => {
        expect(t).toEqual(delay);
        f();
      });

      let authResponse = await getUserAuthToken(mockConfig);

      expect(authResponse).toEqual(fakeAccessToken);
      expect(fetch).toHaveBeenCalledTimes(1);
      expect.assertions(4);
    });
  });
});


function getMockConfig(mockConfigObj: any = {
  tokenEndpoint: "foo",
  refresh_token: "foo"
}): any {
  return {
    set: jest.fn(),
    get: jest.fn().mockReturnValue(mockConfigObj)
  }
}