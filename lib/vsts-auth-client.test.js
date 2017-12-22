jest.mock("request");
jest.mock("jsonwebtoken");
jest.mock("./config");

let {
  AuthorizationError,
  getUserAuthToken,
  setRefreshToken,
  getVstsLabOauthToken,
  getServiceEndpoints
} = require("./vsts-auth-client");

let config = require("./config");
let { post, get } = require("request");
let jwt = require("jsonwebtoken");

describe("In the vsts-auth-client module", () => {
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
      const fakeToken = "foo";
      setRefreshToken(fakeToken);

      expect(config.set).toHaveBeenCalledTimes(1);
      expect(config.set).toHaveBeenCalledWith("refresh_token", fakeToken);
    });
  });
  describe("the getUserAuthToken static  method", () => {
    const fakeCode = "foo";
    const fakeAccessToken = "baz";
    const nowInMs = 10000;
    const now = nowInMs / 1000;

    beforeEach(() => {
      config.get.mockImplementation(() => ({
        tokenEndpoint: "foo",
        refresh_token: "foo"
      }));

      post.mockImplementation((x, o, cb) => {
        expect(o).toHaveProperty("qs.code", fakeCode);
        cb(null, {}, { refresh_token: "bar", access_token: fakeAccessToken });
      });
    });

    test("should reject if the config does not have a tokenEndpoint", () => {
      config.get.mockImplementation(() => ({}));

      return expect(getUserAuthToken()).rejects.toHaveProperty(
        "message",
        "invalid config, missing tokenEndpoint"
      );
    });

    test("should reject if the config does not have a refresh_token", () => {
      config.get.mockImplementation(() => ({
        tokenEndpoint: "foo"
      }));

      let result = getUserAuthToken();

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
        const errorObj = { error: "foo" };
        post.mockImplementation((x, o, cb) => {
          cb(errorObj);
        });
        return expect(getUserAuthToken()).rejects.toEqual(errorObj);
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
            post.mockImplementation((x, o, cb) => {
              cb(...t.cbArgs);
            });

            return expect(getUserAuthToken()).rejects.toContain(
              "malformed response body:\n"
            );
          });
        });
      });
    });

    test("should make requests with refresh_token supplied as the code and return the access_token", () => {
      jwt.decode.mockImplementation(() => ({ nbf: now }));
      jest.spyOn(Date, "now").mockImplementation(() => nowInMs);
      jest.advanceTimersByTime(1000);

      return expect(getUserAuthToken())
        .resolves.toEqual(fakeAccessToken)
        .then(() => {
          expect(post).toHaveBeenCalledTimes(1);
          expect.assertions(3);
        });
    });

    test("should not resolve until after the nbf claim in the returned token is >= the current time", () => {
      const delay = 60000; // 1 minute
      jest.spyOn(Date, "now").mockImplementation(() => nowInMs);
      jwt.decode.mockImplementation(() => ({
        nbf: now + delay / 1000
      }));

      setTimeout.mockImplementation((f, t) => {
        expect(t).toEqual(delay);
        f();
      });

      let authResponse = getUserAuthToken();

      return expect(authResponse)
        .resolves.toEqual(fakeAccessToken)
        .then(() => {
          expect(post).toHaveBeenCalledTimes(1);
          expect(setTimeout).toHaveBeenCalledTimes(1);
          expect.assertions(5);
        });
    });
  });

  test("the getServiceEndpoints static method", () => {
    const collectionUri = "https://fakeCollectionUri.com";
    const projectId = "some-guid";
    const authToken = "baz";
    process.env["SYSTEM_TEAMFOUNDATIONCOLLECTIONURI"] = collectionUri;
    process.env["SYSTEM_TEAMPROJECTID"] = projectId;
    process.env["SYSTEM_ACCESSTOKEN"] = authToken;

    get.mockImplementation((endpoint, options, cb) => {
      expect(
        endpoint.indexOf(
          `${collectionUri}DefaultCollection/${projectId}/_apis`
        ) > -1
      ).toBeTruthy();
      expect(options.auth).toHaveProperty("bearer", authToken);
      cb(null, {}, { value: { token: "foo" } });
    });

    return expect(getServiceEndpoints())
      .resolves.toEqual({ token: "foo" })
      .then(() => expect.assertions(3));
  });
});
