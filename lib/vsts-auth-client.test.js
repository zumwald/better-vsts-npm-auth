jest.mock("request");
jest.mock("jsonwebtoken");
jest.mock("./config");

let {
  AuthorizationError,
  getUserAuthToken,
  setRefreshToken
} = require("./vsts-auth-client");

let config = require("./config");
let { post } = require("request");
let jwt = require("jsonwebtoken");

describe("In the vsts-auth-client module", () => {
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
      const fakeToken = "foo";
      setRefreshToken(fakeToken);

      expect(config.set).toHaveBeenCalledTimes(1);
      expect(config.set).toHaveBeenCalledWith("refresh_token", fakeToken);
    });
  });
  describe("the getUserAuthToken static  method", () => {
    let originalEnv;
    const fakeToken = "foo";
    const k_systemAccessToken = "SYSTEM_ACCESSTOKEN";

    beforeAll(() => {
      originalEnv = process.env;
    });

    beforeEach(() => {
      process.env = {};
      config.get.mockImplementation(() => ({
        tokenEndpoint: "foo",
        refresh_token: "foo"
      }));
    });

    afterAll(() => {
      process.env = originalEnv;
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
      const fakeAccessToken = "baz";

      post.mockImplementation((x, o, cb) => {
        expect(o).toHaveProperty("qs.code", fakeToken);
        cb(null, {}, { refresh_token: "bar", access_token: fakeAccessToken });
      });

      const now = 10000;
      jwt.decode.mockImplementation(() => now);
      jest.spyOn(Date, "now").mockImplementation(() => now);

      return expect(getUserAuthToken())
        .resolves.toEqual(fakeAccessToken)
        .then(() => {
          expect(post).toHaveBeenCalledTimes(1);
          expect.assertions(3);
        });
    });
  });
});
