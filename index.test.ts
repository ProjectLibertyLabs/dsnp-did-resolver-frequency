//import { expect, jest, test } from "@jest/globals";
import { FrequencyResolver } from "./index.js";
//import { ApiPromise, WsProvider } from "@polkadot/api";
//import { options } from "@frequency-chain/api-augment";

describe("dsnp-did-resolver-frequency", () => {
  it("can be constructed with providerUri", async () => {
    const resolver = new FrequencyResolver({
      providerUri: "ws://127.0.0.1:9944",
    });

    await resolver.disconnect();
  });

  /* TODO needs mocking
  it("can be constructed with apiPromise", async () => {
    const apiPromise = ApiPromise.create({
      provider: new WsProvider("ws://127.0.0.1:9944"),
      throwOnConnect: true,
      ...options,
    });

    const resolver = new FrequencyResolver({
      apiPromise,
    });

    await resolver.disconnect();
  });
  */

  /* TODO needs mocking
  it("resolves did:dsnp:13972", async () => {
    const myDid = "did:dsnp:13972";
    const result = await resolver.resolve(myDid);
  });

  afterAll(async () => {
    // Shut down Frequency client
    await resolver.disconnect();
  });
  */
});
