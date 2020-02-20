// tslint:disable: no-unused-expression
// tslint:disable: no-empty
import { expect } from "chai";
import sinon from "sinon";
import { GossipFilter } from "../../lib/gossip/gossip-filter";
import { HasScriptPubKey, HasValue } from "../../lib/gossip/gossip-filter-chain-client";
import { HasTxStrings } from "../../lib/gossip/gossip-filter-chain-client";
import { IGossipFilterChainClient } from "../../lib/gossip/gossip-filter-chain-client";
import { ChannelAnnouncementMessage } from "../../lib/messages/channel-announcement-message";
import { ChannelUpdateMessage } from "../../lib/messages/channel-update-message";
import { NodeAnnouncementMessage } from "../../lib/messages/node-announcement-message";

import fs from "fs";
import path from "path";
import { GossipMemoryStore } from "../../lib/gossip/gossip-memory-store";
import * as MessageFactory from "../../lib/message-factory";
import { ShortChannelId } from "../../lib/shortchanid";
import { WireErrorCode } from "../../lib/wire-error";

class FakeChainClient implements IGossipFilterChainClient {
  public getBlockHash(height: number): Promise<string> {
    throw new Error("");
  }

  public getBlock(hash: string): Promise<HasTxStrings> {
    throw new Error("");
  }

  public getUtxo(txId: string, voutIdx: number): Promise<HasScriptPubKey & HasValue> {
    throw new Error("");
  }
}

describe("GossipFilter", () => {
  let sandbox;
  let chainClient: any;
  let gossipStore: GossipMemoryStore;
  let pendingStore: GossipMemoryStore;
  let sieve: GossipFilter;

  function readFixture(file) {
    const data = fs.readFileSync(path.join(__dirname, "../../__fixtures__", file), "utf8");
    return data.split("\n").filter(p => p);
  }

  async function replayMessages(s: GossipFilter, msgs) {
    return new Promise(resolve => {
      s.on("flushed", () => resolve());
      if (!Buffer.isBuffer(msgs[0])) {
        msgs = msgs.map(m => Buffer.from(m, "hex"));
      }
      for (const rawmsg of msgs) {
        const msg = MessageFactory.deserialize(rawmsg);
        s.enqueue(msg); // by-pass the queue
      }
    });
  }

  function permute(permutation) {
    const length = permutation.length;
    const result = [permutation.slice()];
    const c = new Array(length).fill(0);
    let i = 1;
    let k;
    let p;
    while (i < length) {
      if (c[i] < i) {
        k = i % 2 && c[i];
        p = permutation[i];
        permutation[i] = permutation[k];
        permutation[k] = p;
        ++c[i];
        i = 1;
        result.push(permutation.slice());
      } else {
        c[i] = 0;
        ++i;
      }
    }
    return result;
  }

  beforeEach(() => {
    sandbox = sinon.createSandbox();

    chainClient = sandbox.createStubInstance(FakeChainClient);

    const blockHashes = readFixture("blockhash.txt");
    blockHashes.forEach((v, i) => chainClient.getBlockHash.onCall(i).resolves(v));

    const blocks = readFixture("block.txt").map(p => JSON.parse(p));
    blocks.forEach((v, i) => chainClient.getBlock.onCall(i).resolves(v));

    const utxos = readFixture("utxo.txt").map(p => JSON.parse(p));
    utxos.forEach((v, i) => chainClient.getUtxo.onCall(i).resolves(v));

    gossipStore = new GossipMemoryStore();
    pendingStore = new GossipMemoryStore();
    sieve = new GossipFilter({ chainClient, gossipStore, pendingStore });
  });

  describe("construction", () => {
    it("happy path", async () => {
      const rawMsgs = [
        "0100ce1d69dbb62e86ad28157f4c24705e325f069d5158b91b28bdf55e508afcc1b554a498f4bda8a3d34a206ddb617ad0e945ecadc9a61086bac5afae3e19976242d464e8d305772f29021a4d07617c4159e7e0634bd53991c0e0577c0e9c3d3ee61d7311e6773275335c12f17e573e2813391a71050ab58c03c17d06c0d841db2ec6c6514c2156713651dfbee13d491559764c95343386218ab904173742dde6ca3118d303967e073a44e94f16eef4d878d4d74f1ff1f6924109421cf9c41e8e5c961cf1c7e2316e61a952c7caad056fea1d13d2f4bf855bd3f06d019a33814bc70ea99fa79f026c791b87040e781e8493f5165dafbfc23fabe2912c3ed0ab7e0f000043497fd7f826957108f4a30fd9cec3aeba79972084e90ead01ea33090000000013a9090000030000036b96e4713c5f84dcb8030592e1bd42a2d9a43d91fa2e535b9bfd05f2c5def9b9039cc950286a8fa99218283d1adc2456e0d5e81be558da77dd6e85ba9a1fff5ad303ca63b9acbadf5b644c11d0a9dd65b82b14e0d26fc5e0bcf071a90879f603d46203a0ee0a716f4a436864fe53bb788a003321aee63150bf63fd5529e4e1da93481d",
        "01024e6eac97124742ba6a033612c8009945c0d52568756a885692b4adbf202666503b56ecb6f5758ea450dda940b2a6853b8e1706c3bd4f38a347be91b08c5e5c4743497fd7f826957108f4a30fd9cec3aeba79972084e90ead01ea33090000000013a90900000300005cdd9d780002009000000000000003e8000003e800000001",
        "01015254ffbc21374af9d998355151515933de1d998e9cb124aa4d65a7aa6b473e75201420c58f2414f4fb7461f3f133ab529cbbf9a57365ed6bcf775172826fdc7500005ae86dba039cc950286a8fa99218283d1adc2456e0d5e81be558da77dd6e85ba9a1fff5ad3f8e71c79616c6c732e6f7267000000000000000000000000000000000000000000000000070122c8fc922607",
        "0102fcd0d7af22e815879e2ba0c2422bc812d04f8b286fd53e631fe18bb6ed5aecc06a0b96fceb352509656f2b121b76cc808fe02e62ff42edc600bd6e196fe2af9b43497fd7f826957108f4a30fd9cec3aeba79972084e90ead01ea33090000000013a90900000300005ae7cc490001009000000000000003e8000003e800000001",
        "010105d3b12aacb824409ce8724609fe453fdcd33a498ecca170784985c4a6a2765657c4ef9e1170d3a5795ec86021c3a081c84a9f3a02e2ca66d17b683baacae08000005cddd5e5036b96e4713c5f84dcb8030592e1bd42a2d9a43d91fa2e535b9bfd05f2c5def9b9b6d43364656d6f312e6c6e646578706c6f7265722e636f6d0000000000000000000000000701265736a32611",
        "01009b33af5fe59b236b2383ed442fa7c1361a68fe13f89f9c9712ae04b9eb13ce962584851bedf84b9682ed3c351828164d6f24fcdaf1ad577f6378c170fb68a1fac5daa19b89932d2aeaa0327aaf7da830e5b15e0d033fa62613e2a35b67fc53d02ab5f2335733dda30ba24751f33d229af579927e09a94a619dd4a4626615f1c1de45fdf85a1702805d0708bc676ddfb99b27308ea6e12fd76200c65a01c4d9fe7d9e96f20e09949d539fedeaf88cea8a2df7d28a4ddcb622559ccf1624ba61f4270e93a347b0c8329ec6c6162e450ebc0fe07611ff90d33f5b0fb9466ea306ec30e4bf688d619c903c79eacd0e05ae91ec84e370d4e572b100c19f4a3d53e172000043497fd7f826957108f4a30fd9cec3aeba79972084e90ead01ea33090000000013a90e0000030000036b96e4713c5f84dcb8030592e1bd42a2d9a43d91fa2e535b9bfd05f2c5def9b903e5f9d1935c67a029bf0a26af5f63109f4f4c45993a8f45177a8f2f39bcb46144033164d62ebff9e5c20b524dd796251113e5fe93bdafced041159cc0df8e95a28b03a3d66f3f59bf350ae414d2cc510899c684801ebd61b3b9fcf22731462ed9d80e",
        "0102e14445d2d0b70febe1b0d01ecee102947a0e39334ecce7294cff9d0d452dd59f41f2218f6e2f35c7d891efeb9581076f1da97c0993ffaef7bec60b394b9c219a43497fd7f826957108f4a30fd9cec3aeba79972084e90ead01ea33090000000013a90e00000300005cdd9d780002009000000000000003e8000003e800000001",
        "0101743a72dcd1c0e53ae8a50ba181c4ef43c5e46003b101206ea661807ecd5c91d5631439c6fa81f9bf432b678ca89ace4b7904c9562dee2477b8eb288e0daaff8800005b036c8703e5f9d1935c67a029bf0a26af5f63109f4f4c45993a8f45177a8f2f39bcb461443399ff49736c616e64445350000000000000000000000000000000000000000000000000070154f6c87a2607",
        "01027907d0a52a155fb4fbc4504823a8fc4bc709f1adbd42cc503b9c1d347f8903ef46a9ef3b0bbcd4cee122199456825232484547b6d9985fbe02bb2f20a388574d43497fd7f826957108f4a30fd9cec3aeba79972084e90ead01ea33090000000013a90e00000300005b02fd3c0001009000000000000003e8000003e800000001",
        "010027927395fe531904ecae995006cbbfe1338482c23008bc46a357a4f629cc47dd0f85651fbe47f779dcfab1cd4908de6a66843b364d6dfc848eb3e5459d00eab5b9674df33652a36bdac711098fdd2adb97d0bfd6f134ac1f9caa420919bfb55d17c3c606d468da05ff0054b40e41e7f4be93f793101b625f68d7124ccd70bc7315df61709a912458e6a378420b1a44ef914062f9a14c84b61226898d6e81a4be31a27e7b19237001c189e523bebd51af289520ff935b98db5426d5b22b1ac56fb063dd7a82583211185fea8bd7a47f1dec88fbda2377f76dfc253cc85e7c33231023d6647f1379e84ff36b4286edd1a2a71f817964bb16f0fd19254ce6441d5a000043497fd7f826957108f4a30fd9cec3aeba79972084e90ead01ea33090000000013a9160000040000036b96e4713c5f84dcb8030592e1bd42a2d9a43d91fa2e535b9bfd05f2c5def9b903c3feb1e9b84d7aa83ea93f1bc58bfe34fa17603d955eb723a9d236336d97f9e9028154cc6b7fb5e58e0bf989de51b8d946183918c5aa08f361825a2b9e767783b803338034d89e56588f7117653074c4ee1920082d53b20710b2578e0d3f08dcfc33",
        "010235c2ad228465af3f48775b82df1ae59470bf6c9c84cdda10b27c2ec236c4824068cc22211b095e4d44fdfa789b7ad366a09db484a064065b12a1a342846a1e6043497fd7f826957108f4a30fd9cec3aeba79972084e90ead01ea33090000000013a91600000400005cdd9d78000200900000000000000001000003e800000001",
        "01012a3a1da3a63d40c3816acb5827d5e118d8c36d435959c3bcb9d8da934b992fcb515a363dfaa9de826274481a8e96b882d3244d4c547c9ffb68c0f11ad0ab989f00005aa890d003c3feb1e9b84d7aa83ea93f1bc58bfe34fa17603d955eb723a9d236336d97f9e9ffff005341432d4368696e6100000000000000000000000000000000000000000000000007012f5ea5f22607",
      ];

      await replayMessages(sieve, rawMsgs);
      expect(gossipStore.channelAnnouncementCount).to.equal(3);
      expect(gossipStore.channelUpdateCount).to.equal(5);
      expect(gossipStore.nodeAnnouncementCount).to.equal(4);
      expect(pendingStore.channelUpdateCount).to.equal(0);
      expect(pendingStore.nodeAnnouncementCount).to.equal(0);
    });

    it("valid channel_announcement should be stored", async () => {
      const rawMsgs = [
        "0100ce1d69dbb62e86ad28157f4c24705e325f069d5158b91b28bdf55e508afcc1b554a498f4bda8a3d34a206ddb617ad0e945ecadc9a61086bac5afae3e19976242d464e8d305772f29021a4d07617c4159e7e0634bd53991c0e0577c0e9c3d3ee61d7311e6773275335c12f17e573e2813391a71050ab58c03c17d06c0d841db2ec6c6514c2156713651dfbee13d491559764c95343386218ab904173742dde6ca3118d303967e073a44e94f16eef4d878d4d74f1ff1f6924109421cf9c41e8e5c961cf1c7e2316e61a952c7caad056fea1d13d2f4bf855bd3f06d019a33814bc70ea99fa79f026c791b87040e781e8493f5165dafbfc23fabe2912c3ed0ab7e0f000043497fd7f826957108f4a30fd9cec3aeba79972084e90ead01ea33090000000013a9090000030000036b96e4713c5f84dcb8030592e1bd42a2d9a43d91fa2e535b9bfd05f2c5def9b9039cc950286a8fa99218283d1adc2456e0d5e81be558da77dd6e85ba9a1fff5ad303ca63b9acbadf5b644c11d0a9dd65b82b14e0d26fc5e0bcf071a90879f603d46203a0ee0a716f4a436864fe53bb788a003321aee63150bf63fd5529e4e1da93481d",
      ];
      await replayMessages(sieve, rawMsgs);
      const msg = await gossipStore.findChannelAnnouncement(new ShortChannelId(1288457, 3, 0));
      expect(msg).to.be.instanceOf(ChannelAnnouncementMessage);
    });

    it("valid channel_announcement should emit message", done => {
      const rawMsgs = [
        "0100ce1d69dbb62e86ad28157f4c24705e325f069d5158b91b28bdf55e508afcc1b554a498f4bda8a3d34a206ddb617ad0e945ecadc9a61086bac5afae3e19976242d464e8d305772f29021a4d07617c4159e7e0634bd53991c0e0577c0e9c3d3ee61d7311e6773275335c12f17e573e2813391a71050ab58c03c17d06c0d841db2ec6c6514c2156713651dfbee13d491559764c95343386218ab904173742dde6ca3118d303967e073a44e94f16eef4d878d4d74f1ff1f6924109421cf9c41e8e5c961cf1c7e2316e61a952c7caad056fea1d13d2f4bf855bd3f06d019a33814bc70ea99fa79f026c791b87040e781e8493f5165dafbfc23fabe2912c3ed0ab7e0f000043497fd7f826957108f4a30fd9cec3aeba79972084e90ead01ea33090000000013a9090000030000036b96e4713c5f84dcb8030592e1bd42a2d9a43d91fa2e535b9bfd05f2c5def9b9039cc950286a8fa99218283d1adc2456e0d5e81be558da77dd6e85ba9a1fff5ad303ca63b9acbadf5b644c11d0a9dd65b82b14e0d26fc5e0bcf071a90879f603d46203a0ee0a716f4a436864fe53bb788a003321aee63150bf63fd5529e4e1da93481d",
      ];
      sieve.on("message", msg => {
        expect(msg.type).to.equal(0x0100);
        done();
      });
      replayMessages(sieve, rawMsgs);
    });

    it("should enqueue node_announcement until channel_announcement and channel_update", async () => {
      const rawMsgs = [
        "01015254ffbc21374af9d998355151515933de1d998e9cb124aa4d65a7aa6b473e75201420c58f2414f4fb7461f3f133ab529cbbf9a57365ed6bcf775172826fdc7500005ae86dba039cc950286a8fa99218283d1adc2456e0d5e81be558da77dd6e85ba9a1fff5ad3f8e71c79616c6c732e6f7267000000000000000000000000000000000000000000000000070122c8fc922607",
      ];
      await replayMessages(sieve, rawMsgs);
      expect(gossipStore.nodeAnnouncementCount).to.equal(0);
      expect(pendingStore.nodeAnnouncementCount).to.equal(1);
    });

    it("should replay node_announcement after channel_announcement", async () => {
      const rawMsgs = [
        "01015254ffbc21374af9d998355151515933de1d998e9cb124aa4d65a7aa6b473e75201420c58f2414f4fb7461f3f133ab529cbbf9a57365ed6bcf775172826fdc7500005ae86dba039cc950286a8fa99218283d1adc2456e0d5e81be558da77dd6e85ba9a1fff5ad3f8e71c79616c6c732e6f7267000000000000000000000000000000000000000000000000070122c8fc922607",
        "0100ce1d69dbb62e86ad28157f4c24705e325f069d5158b91b28bdf55e508afcc1b554a498f4bda8a3d34a206ddb617ad0e945ecadc9a61086bac5afae3e19976242d464e8d305772f29021a4d07617c4159e7e0634bd53991c0e0577c0e9c3d3ee61d7311e6773275335c12f17e573e2813391a71050ab58c03c17d06c0d841db2ec6c6514c2156713651dfbee13d491559764c95343386218ab904173742dde6ca3118d303967e073a44e94f16eef4d878d4d74f1ff1f6924109421cf9c41e8e5c961cf1c7e2316e61a952c7caad056fea1d13d2f4bf855bd3f06d019a33814bc70ea99fa79f026c791b87040e781e8493f5165dafbfc23fabe2912c3ed0ab7e0f000043497fd7f826957108f4a30fd9cec3aeba79972084e90ead01ea33090000000013a9090000030000036b96e4713c5f84dcb8030592e1bd42a2d9a43d91fa2e535b9bfd05f2c5def9b9039cc950286a8fa99218283d1adc2456e0d5e81be558da77dd6e85ba9a1fff5ad303ca63b9acbadf5b644c11d0a9dd65b82b14e0d26fc5e0bcf071a90879f603d46203a0ee0a716f4a436864fe53bb788a003321aee63150bf63fd5529e4e1da93481d",
      ];
      await replayMessages(sieve, rawMsgs);

      const msg = await gossipStore.findNodeAnnouncement(Buffer.from("039cc950286a8fa99218283d1adc2456e0d5e81be558da77dd6e85ba9a1fff5ad3", "hex")); // prettier-ignore
      expect(msg).to.be.instanceOf(NodeAnnouncementMessage);
    });

    it("should emit node_announcement message", done => {
      const rawMsgs = [
        "01015254ffbc21374af9d998355151515933de1d998e9cb124aa4d65a7aa6b473e75201420c58f2414f4fb7461f3f133ab529cbbf9a57365ed6bcf775172826fdc7500005ae86dba039cc950286a8fa99218283d1adc2456e0d5e81be558da77dd6e85ba9a1fff5ad3f8e71c79616c6c732e6f7267000000000000000000000000000000000000000000000000070122c8fc922607",
        "0100ce1d69dbb62e86ad28157f4c24705e325f069d5158b91b28bdf55e508afcc1b554a498f4bda8a3d34a206ddb617ad0e945ecadc9a61086bac5afae3e19976242d464e8d305772f29021a4d07617c4159e7e0634bd53991c0e0577c0e9c3d3ee61d7311e6773275335c12f17e573e2813391a71050ab58c03c17d06c0d841db2ec6c6514c2156713651dfbee13d491559764c95343386218ab904173742dde6ca3118d303967e073a44e94f16eef4d878d4d74f1ff1f6924109421cf9c41e8e5c961cf1c7e2316e61a952c7caad056fea1d13d2f4bf855bd3f06d019a33814bc70ea99fa79f026c791b87040e781e8493f5165dafbfc23fabe2912c3ed0ab7e0f000043497fd7f826957108f4a30fd9cec3aeba79972084e90ead01ea33090000000013a9090000030000036b96e4713c5f84dcb8030592e1bd42a2d9a43d91fa2e535b9bfd05f2c5def9b9039cc950286a8fa99218283d1adc2456e0d5e81be558da77dd6e85ba9a1fff5ad303ca63b9acbadf5b644c11d0a9dd65b82b14e0d26fc5e0bcf071a90879f603d46203a0ee0a716f4a436864fe53bb788a003321aee63150bf63fd5529e4e1da93481d",
      ];
      const msgs = [];
      sieve.on("message", msg => msgs.push(msg));
      sieve.on("flushed", () => {
        expect(msgs[1]).to.be.instanceOf(NodeAnnouncementMessage);
        done();
      });
      replayMessages(sieve, rawMsgs);
    });

    it("should enqueue channel_update until announcement", async () => {
      const rawMsgs = [
        "0102fcd0d7af22e815879e2ba0c2422bc812d04f8b286fd53e631fe18bb6ed5aecc06a0b96fceb352509656f2b121b76cc808fe02e62ff42edc600bd6e196fe2af9b43497fd7f826957108f4a30fd9cec3aeba79972084e90ead01ea33090000000013a90900000300005ae7cc490001009000000000000003e8000003e800000001",
      ];
      await replayMessages(sieve, rawMsgs);
      expect(gossipStore.channelUpdateCount).to.equal(0);
      expect(pendingStore.channelUpdateCount).to.equal(1);
    });

    it("should replay channel_update after channel_announcement", async () => {
      const rawMsgs = [
        "0102fcd0d7af22e815879e2ba0c2422bc812d04f8b286fd53e631fe18bb6ed5aecc06a0b96fceb352509656f2b121b76cc808fe02e62ff42edc600bd6e196fe2af9b43497fd7f826957108f4a30fd9cec3aeba79972084e90ead01ea33090000000013a90900000300005ae7cc490001009000000000000003e8000003e800000001",
        "0100ce1d69dbb62e86ad28157f4c24705e325f069d5158b91b28bdf55e508afcc1b554a498f4bda8a3d34a206ddb617ad0e945ecadc9a61086bac5afae3e19976242d464e8d305772f29021a4d07617c4159e7e0634bd53991c0e0577c0e9c3d3ee61d7311e6773275335c12f17e573e2813391a71050ab58c03c17d06c0d841db2ec6c6514c2156713651dfbee13d491559764c95343386218ab904173742dde6ca3118d303967e073a44e94f16eef4d878d4d74f1ff1f6924109421cf9c41e8e5c961cf1c7e2316e61a952c7caad056fea1d13d2f4bf855bd3f06d019a33814bc70ea99fa79f026c791b87040e781e8493f5165dafbfc23fabe2912c3ed0ab7e0f000043497fd7f826957108f4a30fd9cec3aeba79972084e90ead01ea33090000000013a9090000030000036b96e4713c5f84dcb8030592e1bd42a2d9a43d91fa2e535b9bfd05f2c5def9b9039cc950286a8fa99218283d1adc2456e0d5e81be558da77dd6e85ba9a1fff5ad303ca63b9acbadf5b644c11d0a9dd65b82b14e0d26fc5e0bcf071a90879f603d46203a0ee0a716f4a436864fe53bb788a003321aee63150bf63fd5529e4e1da93481d",
      ];
      await replayMessages(sieve, rawMsgs);
      const msg = await gossipStore.findChannelUpdate(new ShortChannelId(1288457, 3, 0), 1);
      expect(msg.timestamp).to.equal(1525140553);
      expect(msg.cltvExpiryDelta).to.equal(144);
      expect(msg.htlcMinimumMsat.toNumber()).to.equal(1000);
      expect(msg.htlcMaximumMsat).to.be.undefined;
      expect(msg.feeBaseMsat).to.equal(1000);
      expect(msg.feeProportionalMillionths).to.equal(1);
      expect(msg.disabled).to.be.false;
    });

    it("should emit valid channel_update", done => {
      const rawMsgs = [
        "0102fcd0d7af22e815879e2ba0c2422bc812d04f8b286fd53e631fe18bb6ed5aecc06a0b96fceb352509656f2b121b76cc808fe02e62ff42edc600bd6e196fe2af9b43497fd7f826957108f4a30fd9cec3aeba79972084e90ead01ea33090000000013a90900000300005ae7cc490001009000000000000003e8000003e800000001",
        "0100ce1d69dbb62e86ad28157f4c24705e325f069d5158b91b28bdf55e508afcc1b554a498f4bda8a3d34a206ddb617ad0e945ecadc9a61086bac5afae3e19976242d464e8d305772f29021a4d07617c4159e7e0634bd53991c0e0577c0e9c3d3ee61d7311e6773275335c12f17e573e2813391a71050ab58c03c17d06c0d841db2ec6c6514c2156713651dfbee13d491559764c95343386218ab904173742dde6ca3118d303967e073a44e94f16eef4d878d4d74f1ff1f6924109421cf9c41e8e5c961cf1c7e2316e61a952c7caad056fea1d13d2f4bf855bd3f06d019a33814bc70ea99fa79f026c791b87040e781e8493f5165dafbfc23fabe2912c3ed0ab7e0f000043497fd7f826957108f4a30fd9cec3aeba79972084e90ead01ea33090000000013a9090000030000036b96e4713c5f84dcb8030592e1bd42a2d9a43d91fa2e535b9bfd05f2c5def9b9039cc950286a8fa99218283d1adc2456e0d5e81be558da77dd6e85ba9a1fff5ad303ca63b9acbadf5b644c11d0a9dd65b82b14e0d26fc5e0bcf071a90879f603d46203a0ee0a716f4a436864fe53bb788a003321aee63150bf63fd5529e4e1da93481d",
      ];
      const msgs = [];
      sieve.on("message", msg => msgs.push(msg));
      sieve.on("flushed", () => {
        expect(msgs[1]).to.be.instanceOf(ChannelUpdateMessage);
        done();
      });
      replayMessages(sieve, rawMsgs);
    });

    it("should abort processing on bad signature for channel_announcement", async () => {
      sieve.on("error", () => {});
      const rawMsgs = [
        "0100ce1d69dbb62e86ad28157f4c24705e325f069d5158b91b28bdf55e508afcc1b554a498f4bda8a3d34a206ddb617ad0e945ecadc9a61086bac5afae3e19976242d464e8d305772f29021a4d07617c4159e7e0634bd53991c0e0577c0e9c3d3ee61d7311e6773275335c12f17e573e2813391a71050ab58c03c17d06c0d841db2ec6c6514c2156713651dfbee13d491559764c95343386218ab904173742dde6ca3118d303967e073a44e94f16eef4d878d4d74f1ff1f6924109421cf9c41e8e5c961cf1c7e2316e61a952c7caad056fea1d13d2f4bf855bd3f06d019a33814bc70ea99fa79f026c791b87040e781e8493f5165dafbfc23fabe2912c3ed0ab7e0f000043497fd7f826957108f4a30fd9cec3aeba79972084e90ead01ea33090000000013a9090000030000036b96e4713c5f84dcb8030592e1bd42a2d9a43d91fa2e535b9bfd05f2c5def9b9039cc950286a8fa99218283d1adc2456e0d5e81be558da77dd6e85ba9a1fff5ad303ca63b9acbadf5b644c11d0a9dd65b82b14e0d26fc5e0bcf071a90879f603d46203a0ee0a716f4a436864fe53bb788a003321aee63150bf63fd5529e4e1da934810",
      ];
      await replayMessages(sieve, rawMsgs);
      expect(gossipStore.channelAnnouncementCount).to.equal(0);
    });

    it("should emit error for bad signature for channel_announcement", async () => {
      let error;
      sieve.on("error", e => (error = e));
      const rawMsgs = [
        "0100ce1d69dbb62e86ad28157f4c24705e325f069d5158b91b28bdf55e508afcc1b554a498f4bda8a3d34a206ddb617ad0e945ecadc9a61086bac5afae3e19976242d464e8d305772f29021a4d07617c4159e7e0634bd53991c0e0577c0e9c3d3ee61d7311e6773275335c12f17e573e2813391a71050ab58c03c17d06c0d841db2ec6c6514c2156713651dfbee13d491559764c95343386218ab904173742dde6ca3118d303967e073a44e94f16eef4d878d4d74f1ff1f6924109421cf9c41e8e5c961cf1c7e2316e61a952c7caad056fea1d13d2f4bf855bd3f06d019a33814bc70ea99fa79f026c791b87040e781e8493f5165dafbfc23fabe2912c3ed0ab7e0f000043497fd7f826957108f4a30fd9cec3aeba79972084e90ead01ea33090000000013a9090000030000036b96e4713c5f84dcb8030592e1bd42a2d9a43d91fa2e535b9bfd05f2c5def9b9039cc950286a8fa99218283d1adc2456e0d5e81be558da77dd6e85ba9a1fff5ad303ca63b9acbadf5b644c11d0a9dd65b82b14e0d26fc5e0bcf071a90879f603d46203a0ee0a716f4a436864fe53bb788a003321aee63150bf63fd5529e4e1da934810",
      ];
      await replayMessages(sieve, rawMsgs);
      expect(error.code).to.equal(WireErrorCode.chanAnnSigFailed);
    });

    it("should abort processing on bad signature for channel_update", async () => {
      sieve.on("error", () => {});
      const rawMsgs = [
        "0100ce1d69dbb62e86ad28157f4c24705e325f069d5158b91b28bdf55e508afcc1b554a498f4bda8a3d34a206ddb617ad0e945ecadc9a61086bac5afae3e19976242d464e8d305772f29021a4d07617c4159e7e0634bd53991c0e0577c0e9c3d3ee61d7311e6773275335c12f17e573e2813391a71050ab58c03c17d06c0d841db2ec6c6514c2156713651dfbee13d491559764c95343386218ab904173742dde6ca3118d303967e073a44e94f16eef4d878d4d74f1ff1f6924109421cf9c41e8e5c961cf1c7e2316e61a952c7caad056fea1d13d2f4bf855bd3f06d019a33814bc70ea99fa79f026c791b87040e781e8493f5165dafbfc23fabe2912c3ed0ab7e0f000043497fd7f826957108f4a30fd9cec3aeba79972084e90ead01ea33090000000013a9090000030000036b96e4713c5f84dcb8030592e1bd42a2d9a43d91fa2e535b9bfd05f2c5def9b9039cc950286a8fa99218283d1adc2456e0d5e81be558da77dd6e85ba9a1fff5ad303ca63b9acbadf5b644c11d0a9dd65b82b14e0d26fc5e0bcf071a90879f603d46203a0ee0a716f4a436864fe53bb788a003321aee63150bf63fd5529e4e1da93481d",
        "01024e6eac97124742ba6a033612c8009945c0d52568756a885692b4adbf202666503b56ecb6f5758ea450dda940b2a6853b8e1706c3bd4f38a347be91b08c5e5c4743497fd7f826957108f4a30fd9cec3aeba79972084e90ead01ea33090000000013a90900000300005cdd9d780002009000000000000003e8000003e800000000",
      ];
      await replayMessages(sieve, rawMsgs);
      expect(pendingStore.channelUpdateCount).to.equal(0);
    });

    it("should emit error for bad signature for channel_update", async () => {
      let error;
      sieve.on("error", e => (error = e));
      const rawMsgs = [
        "0100ce1d69dbb62e86ad28157f4c24705e325f069d5158b91b28bdf55e508afcc1b554a498f4bda8a3d34a206ddb617ad0e945ecadc9a61086bac5afae3e19976242d464e8d305772f29021a4d07617c4159e7e0634bd53991c0e0577c0e9c3d3ee61d7311e6773275335c12f17e573e2813391a71050ab58c03c17d06c0d841db2ec6c6514c2156713651dfbee13d491559764c95343386218ab904173742dde6ca3118d303967e073a44e94f16eef4d878d4d74f1ff1f6924109421cf9c41e8e5c961cf1c7e2316e61a952c7caad056fea1d13d2f4bf855bd3f06d019a33814bc70ea99fa79f026c791b87040e781e8493f5165dafbfc23fabe2912c3ed0ab7e0f000043497fd7f826957108f4a30fd9cec3aeba79972084e90ead01ea33090000000013a9090000030000036b96e4713c5f84dcb8030592e1bd42a2d9a43d91fa2e535b9bfd05f2c5def9b9039cc950286a8fa99218283d1adc2456e0d5e81be558da77dd6e85ba9a1fff5ad303ca63b9acbadf5b644c11d0a9dd65b82b14e0d26fc5e0bcf071a90879f603d46203a0ee0a716f4a436864fe53bb788a003321aee63150bf63fd5529e4e1da93481d",
        "01024e6eac97124742ba6a033612c8009945c0d52568756a885692b4adbf202666503b56ecb6f5758ea450dda940b2a6853b8e1706c3bd4f38a347be91b08c5e5c4743497fd7f826957108f4a30fd9cec3aeba79972084e90ead01ea33090000000013a90900000300005cdd9d780002009000000000000003e8000003e800000000",
      ];
      await replayMessages(sieve, rawMsgs);
      expect(error.code).to.equal(WireErrorCode.chanUpdSigFailed);
    });

    it("should abort processing on bad signature for node_announcement", async () => {
      sieve.on("error", () => {});
      const rawMsgs = [
        "0100ce1d69dbb62e86ad28157f4c24705e325f069d5158b91b28bdf55e508afcc1b554a498f4bda8a3d34a206ddb617ad0e945ecadc9a61086bac5afae3e19976242d464e8d305772f29021a4d07617c4159e7e0634bd53991c0e0577c0e9c3d3ee61d7311e6773275335c12f17e573e2813391a71050ab58c03c17d06c0d841db2ec6c6514c2156713651dfbee13d491559764c95343386218ab904173742dde6ca3118d303967e073a44e94f16eef4d878d4d74f1ff1f6924109421cf9c41e8e5c961cf1c7e2316e61a952c7caad056fea1d13d2f4bf855bd3f06d019a33814bc70ea99fa79f026c791b87040e781e8493f5165dafbfc23fabe2912c3ed0ab7e0f000043497fd7f826957108f4a30fd9cec3aeba79972084e90ead01ea33090000000013a9090000030000036b96e4713c5f84dcb8030592e1bd42a2d9a43d91fa2e535b9bfd05f2c5def9b9039cc950286a8fa99218283d1adc2456e0d5e81be558da77dd6e85ba9a1fff5ad303ca63b9acbadf5b644c11d0a9dd65b82b14e0d26fc5e0bcf071a90879f603d46203a0ee0a716f4a436864fe53bb788a003321aee63150bf63fd5529e4e1da93481d",
        "01015254ffbc21374af9d998355151515933de1d998e9cb124aa4d65a7aa6b473e75201420c58f2414f4fb7461f3f133ab529cbbf9a57365ed6bcf775172826fdc7500005ae86dba039cc950286a8fa99218283d1adc2456e0d5e81be558da77dd6e85ba9a1fff5ad3f8e71c79616c6c732e6f7267000000000000000000000000000000000000000000000000070122c8fc922600",
      ];
      await replayMessages(sieve, rawMsgs);
      expect(pendingStore.nodeAnnouncementCount).to.equal(0);
    });

    it("should emit error for bad signature of node_announcement", async () => {
      let error;
      sieve.on("error", e => (error = e));
      const rawMsgs = [
        "0100ce1d69dbb62e86ad28157f4c24705e325f069d5158b91b28bdf55e508afcc1b554a498f4bda8a3d34a206ddb617ad0e945ecadc9a61086bac5afae3e19976242d464e8d305772f29021a4d07617c4159e7e0634bd53991c0e0577c0e9c3d3ee61d7311e6773275335c12f17e573e2813391a71050ab58c03c17d06c0d841db2ec6c6514c2156713651dfbee13d491559764c95343386218ab904173742dde6ca3118d303967e073a44e94f16eef4d878d4d74f1ff1f6924109421cf9c41e8e5c961cf1c7e2316e61a952c7caad056fea1d13d2f4bf855bd3f06d019a33814bc70ea99fa79f026c791b87040e781e8493f5165dafbfc23fabe2912c3ed0ab7e0f000043497fd7f826957108f4a30fd9cec3aeba79972084e90ead01ea33090000000013a9090000030000036b96e4713c5f84dcb8030592e1bd42a2d9a43d91fa2e535b9bfd05f2c5def9b9039cc950286a8fa99218283d1adc2456e0d5e81be558da77dd6e85ba9a1fff5ad303ca63b9acbadf5b644c11d0a9dd65b82b14e0d26fc5e0bcf071a90879f603d46203a0ee0a716f4a436864fe53bb788a003321aee63150bf63fd5529e4e1da93481d",
        "01015254ffbc21374af9d998355151515933de1d998e9cb124aa4d65a7aa6b473e75201420c58f2414f4fb7461f3f133ab529cbbf9a57365ed6bcf775172826fdc7500005ae86dba039cc950286a8fa99218283d1adc2456e0d5e81be558da77dd6e85ba9a1fff5ad3f8e71c79616c6c732e6f7267000000000000000000000000000000000000000000000000070122c8fc922600",
      ];
      await replayMessages(sieve, rawMsgs);
      expect(error.code).to.equal(WireErrorCode.nodeAnnSigFailed);
    });

    it("should reject outdated ChannelUpdateMessage");

    it("should reject outdated NodeAnnouncementMessage");

    it("should replace old queued NodeAnnouncementMessage");
  });

  describe("chainClient integration", () => {
    let error;
    beforeEach(() => {
      sieve.on("error", e => (error = e));
    });

    describe("when blockhash cant be found", () => {
      beforeEach(async () => {
        chainClient.getBlockHash.reset();
        const rawMsgs = [
          "0100ce1d69dbb62e86ad28157f4c24705e325f069d5158b91b28bdf55e508afcc1b554a498f4bda8a3d34a206ddb617ad0e945ecadc9a61086bac5afae3e19976242d464e8d305772f29021a4d07617c4159e7e0634bd53991c0e0577c0e9c3d3ee61d7311e6773275335c12f17e573e2813391a71050ab58c03c17d06c0d841db2ec6c6514c2156713651dfbee13d491559764c95343386218ab904173742dde6ca3118d303967e073a44e94f16eef4d878d4d74f1ff1f6924109421cf9c41e8e5c961cf1c7e2316e61a952c7caad056fea1d13d2f4bf855bd3f06d019a33814bc70ea99fa79f026c791b87040e781e8493f5165dafbfc23fabe2912c3ed0ab7e0f000043497fd7f826957108f4a30fd9cec3aeba79972084e90ead01ea33090000000013a9090000030000036b96e4713c5f84dcb8030592e1bd42a2d9a43d91fa2e535b9bfd05f2c5def9b9039cc950286a8fa99218283d1adc2456e0d5e81be558da77dd6e85ba9a1fff5ad303ca63b9acbadf5b644c11d0a9dd65b82b14e0d26fc5e0bcf071a90879f603d46203a0ee0a716f4a436864fe53bb788a003321aee63150bf63fd5529e4e1da93481d",
        ];
        await replayMessages(sieve, rawMsgs);
      });

      it("should abort processing", () => {
        expect(gossipStore.channelAnnouncementCount).to.equal(0);
      });

      it("should emit error", () => {
        expect(error.code).to.equal(WireErrorCode.chanBadBlockHash);
      });
    });

    describe("when block cant be found", () => {
      beforeEach(async () => {
        chainClient.getBlock.reset();
        const rawMsgs = [
          "0100ce1d69dbb62e86ad28157f4c24705e325f069d5158b91b28bdf55e508afcc1b554a498f4bda8a3d34a206ddb617ad0e945ecadc9a61086bac5afae3e19976242d464e8d305772f29021a4d07617c4159e7e0634bd53991c0e0577c0e9c3d3ee61d7311e6773275335c12f17e573e2813391a71050ab58c03c17d06c0d841db2ec6c6514c2156713651dfbee13d491559764c95343386218ab904173742dde6ca3118d303967e073a44e94f16eef4d878d4d74f1ff1f6924109421cf9c41e8e5c961cf1c7e2316e61a952c7caad056fea1d13d2f4bf855bd3f06d019a33814bc70ea99fa79f026c791b87040e781e8493f5165dafbfc23fabe2912c3ed0ab7e0f000043497fd7f826957108f4a30fd9cec3aeba79972084e90ead01ea33090000000013a9090000030000036b96e4713c5f84dcb8030592e1bd42a2d9a43d91fa2e535b9bfd05f2c5def9b9039cc950286a8fa99218283d1adc2456e0d5e81be558da77dd6e85ba9a1fff5ad303ca63b9acbadf5b644c11d0a9dd65b82b14e0d26fc5e0bcf071a90879f603d46203a0ee0a716f4a436864fe53bb788a003321aee63150bf63fd5529e4e1da93481d",
        ];
        await replayMessages(sieve, rawMsgs);
      });

      it("should abort processing", () => {
        expect(gossipStore.channelAnnouncementCount).to.equal(0);
      });

      it("should emit error event", () => {
        expect(error.code).to.equal(WireErrorCode.chanBadBlock);
      });
    });

    describe("when tx cant be found in block", () => {
      beforeEach(async () => {
        chainClient.getBlock.reset();
        chainClient.getBlock.resolves({
          hash: "00000000368ca807643298b36987833a726eb1e3ce6c3139fd7ff64454f03b10",
          confirmations: 276288,
          strippedsize: 13966,
          size: 19842,
          weight: 61740,
          height: 1288457,
          version: 536870912,
          versionHex: "20000000",
          merkleroot: "32d3fdffa0b29ee24deb6487cb29045997ccb870fcd752fdb409aa0dd8ba22a9",
          tx: [],
          time: 1521319009,
          mediantime: 1521312989,
          nonce: 3780112686,
          bits: "1d00ffff",
          difficulty: 1,
          chainwork: "000000000000000000000000000000000000000000000037e375543b101c60d8",
          nTx: 76,
          previousblockhash: "00000000a35543bec4e7f228e07bdd7a624e442237d26fac28269c645ec52df2",
          nextblockhash: "000000001350700fbcb7864b703df721247ff959e3e56f574a49db761b20b35f",
        });
        const rawMsgs = [
          "0100ce1d69dbb62e86ad28157f4c24705e325f069d5158b91b28bdf55e508afcc1b554a498f4bda8a3d34a206ddb617ad0e945ecadc9a61086bac5afae3e19976242d464e8d305772f29021a4d07617c4159e7e0634bd53991c0e0577c0e9c3d3ee61d7311e6773275335c12f17e573e2813391a71050ab58c03c17d06c0d841db2ec6c6514c2156713651dfbee13d491559764c95343386218ab904173742dde6ca3118d303967e073a44e94f16eef4d878d4d74f1ff1f6924109421cf9c41e8e5c961cf1c7e2316e61a952c7caad056fea1d13d2f4bf855bd3f06d019a33814bc70ea99fa79f026c791b87040e781e8493f5165dafbfc23fabe2912c3ed0ab7e0f000043497fd7f826957108f4a30fd9cec3aeba79972084e90ead01ea33090000000013a9090000030000036b96e4713c5f84dcb8030592e1bd42a2d9a43d91fa2e535b9bfd05f2c5def9b9039cc950286a8fa99218283d1adc2456e0d5e81be558da77dd6e85ba9a1fff5ad303ca63b9acbadf5b644c11d0a9dd65b82b14e0d26fc5e0bcf071a90879f603d46203a0ee0a716f4a436864fe53bb788a003321aee63150bf63fd5529e4e1da93481d",
        ];
        await replayMessages(sieve, rawMsgs);
      });

      it("should abort processing", () => {
        expect(gossipStore.channelAnnouncementCount).to.equal(0);
      });

      it("should emit error", () => {
        expect(error.code).to.equal(WireErrorCode.chanAnnBadTx);
      });
    });

    describe("when tx no longer in UTXO", () => {
      beforeEach(async () => {
        chainClient.getUtxo.reset();
        const rawMsgs = [
          "0100ce1d69dbb62e86ad28157f4c24705e325f069d5158b91b28bdf55e508afcc1b554a498f4bda8a3d34a206ddb617ad0e945ecadc9a61086bac5afae3e19976242d464e8d305772f29021a4d07617c4159e7e0634bd53991c0e0577c0e9c3d3ee61d7311e6773275335c12f17e573e2813391a71050ab58c03c17d06c0d841db2ec6c6514c2156713651dfbee13d491559764c95343386218ab904173742dde6ca3118d303967e073a44e94f16eef4d878d4d74f1ff1f6924109421cf9c41e8e5c961cf1c7e2316e61a952c7caad056fea1d13d2f4bf855bd3f06d019a33814bc70ea99fa79f026c791b87040e781e8493f5165dafbfc23fabe2912c3ed0ab7e0f000043497fd7f826957108f4a30fd9cec3aeba79972084e90ead01ea33090000000013a9090000030000036b96e4713c5f84dcb8030592e1bd42a2d9a43d91fa2e535b9bfd05f2c5def9b9039cc950286a8fa99218283d1adc2456e0d5e81be558da77dd6e85ba9a1fff5ad303ca63b9acbadf5b644c11d0a9dd65b82b14e0d26fc5e0bcf071a90879f603d46203a0ee0a716f4a436864fe53bb788a003321aee63150bf63fd5529e4e1da93481d",
        ];
        await replayMessages(sieve, rawMsgs);
      });

      it("should abort processing", () => {
        expect(gossipStore.channelAnnouncementCount).to.equal(0);
      });

      it("should emit error", () => {
        expect(error.code).to.equal(WireErrorCode.chanUtxoSpent);
      });
    });

    describe("when script does not match expected script", () => {
      beforeEach(async () => {
        chainClient.getUtxo.reset();
        chainClient.getUtxo.resolves({
          bestblock: "00000000000932be24286cdb97afd3bc5efb134ff1494b5023132936c51bfd62",
          confirmations: 276288,
          value: 0.16777216,
          scriptPubKey: {
            asm: "0 fdef2b21b827959dcaf3d31f8f0f859cd81ec5d335614ed4e338cdf8ce9d6fcb",
            hex: "0020edef2b21b827959dcaf3d31f8f0f859cd81ec5d335614ed4e338cdf8ce9d6fcb",
            reqSigs: 1,
            type: "witness_v0_scripthash",
            addresses: ["tb1qlhhjkgdcy72emjhn6v0c7ru9nnvpa3wnx4s5a48r8rxl3n5adl9syhd965"],
          },
          coinbase: false,
        });
        const rawMsgs = [
          "0100ce1d69dbb62e86ad28157f4c24705e325f069d5158b91b28bdf55e508afcc1b554a498f4bda8a3d34a206ddb617ad0e945ecadc9a61086bac5afae3e19976242d464e8d305772f29021a4d07617c4159e7e0634bd53991c0e0577c0e9c3d3ee61d7311e6773275335c12f17e573e2813391a71050ab58c03c17d06c0d841db2ec6c6514c2156713651dfbee13d491559764c95343386218ab904173742dde6ca3118d303967e073a44e94f16eef4d878d4d74f1ff1f6924109421cf9c41e8e5c961cf1c7e2316e61a952c7caad056fea1d13d2f4bf855bd3f06d019a33814bc70ea99fa79f026c791b87040e781e8493f5165dafbfc23fabe2912c3ed0ab7e0f000043497fd7f826957108f4a30fd9cec3aeba79972084e90ead01ea33090000000013a9090000030000036b96e4713c5f84dcb8030592e1bd42a2d9a43d91fa2e535b9bfd05f2c5def9b9039cc950286a8fa99218283d1adc2456e0d5e81be558da77dd6e85ba9a1fff5ad303ca63b9acbadf5b644c11d0a9dd65b82b14e0d26fc5e0bcf071a90879f603d46203a0ee0a716f4a436864fe53bb788a003321aee63150bf63fd5529e4e1da93481d",
        ];
        await replayMessages(sieve, rawMsgs);
      });

      it("should abort processing", () => {
        expect(gossipStore.channelAnnouncementCount).to.equal(0);
      });

      it("should emit an error", () => {
        expect(error.code).to.equal(WireErrorCode.chanBadScript);
      });
    });
  });

  describe("message permutations", () => {
    const rawMsgs = [
      "0100ce1d69dbb62e86ad28157f4c24705e325f069d5158b91b28bdf55e508afcc1b554a498f4bda8a3d34a206ddb617ad0e945ecadc9a61086bac5afae3e19976242d464e8d305772f29021a4d07617c4159e7e0634bd53991c0e0577c0e9c3d3ee61d7311e6773275335c12f17e573e2813391a71050ab58c03c17d06c0d841db2ec6c6514c2156713651dfbee13d491559764c95343386218ab904173742dde6ca3118d303967e073a44e94f16eef4d878d4d74f1ff1f6924109421cf9c41e8e5c961cf1c7e2316e61a952c7caad056fea1d13d2f4bf855bd3f06d019a33814bc70ea99fa79f026c791b87040e781e8493f5165dafbfc23fabe2912c3ed0ab7e0f000043497fd7f826957108f4a30fd9cec3aeba79972084e90ead01ea33090000000013a9090000030000036b96e4713c5f84dcb8030592e1bd42a2d9a43d91fa2e535b9bfd05f2c5def9b9039cc950286a8fa99218283d1adc2456e0d5e81be558da77dd6e85ba9a1fff5ad303ca63b9acbadf5b644c11d0a9dd65b82b14e0d26fc5e0bcf071a90879f603d46203a0ee0a716f4a436864fe53bb788a003321aee63150bf63fd5529e4e1da93481d",
      "01024e6eac97124742ba6a033612c8009945c0d52568756a885692b4adbf202666503b56ecb6f5758ea450dda940b2a6853b8e1706c3bd4f38a347be91b08c5e5c4743497fd7f826957108f4a30fd9cec3aeba79972084e90ead01ea33090000000013a90900000300005cdd9d780002009000000000000003e8000003e800000001",
      "01015254ffbc21374af9d998355151515933de1d998e9cb124aa4d65a7aa6b473e75201420c58f2414f4fb7461f3f133ab529cbbf9a57365ed6bcf775172826fdc7500005ae86dba039cc950286a8fa99218283d1adc2456e0d5e81be558da77dd6e85ba9a1fff5ad3f8e71c79616c6c732e6f7267000000000000000000000000000000000000000000000000070122c8fc922607",
      "0102fcd0d7af22e815879e2ba0c2422bc812d04f8b286fd53e631fe18bb6ed5aecc06a0b96fceb352509656f2b121b76cc808fe02e62ff42edc600bd6e196fe2af9b43497fd7f826957108f4a30fd9cec3aeba79972084e90ead01ea33090000000013a90900000300005ae7cc490001009000000000000003e8000003e800000001",
      "010105d3b12aacb824409ce8724609fe453fdcd33a498ecca170784985c4a6a2765657c4ef9e1170d3a5795ec86021c3a081c84a9f3a02e2ca66d17b683baacae08000005cddd5e5036b96e4713c5f84dcb8030592e1bd42a2d9a43d91fa2e535b9bfd05f2c5def9b9b6d43364656d6f312e6c6e646578706c6f7265722e636f6d0000000000000000000000000701265736a32611",
    ].map(v => Buffer.from(v, "hex"));

    const permutations = permute(rawMsgs);
    let refStore: GossipMemoryStore;

    beforeEach(async () => {
      await replayMessages(sieve, rawMsgs);
      refStore = gossipStore;
      sandbox.resetHistory();
    });

    for (let i = 0; i < permutations.length; i++) {
      it("graph match on permutation " + (i + 1), async () => {
        await replayMessages(sieve, permutations[i]);
        expect(gossipStore.channelAnnouncementCount).to.deep.equal(
          refStore.channelAnnouncementCount,
        );
        expect(gossipStore.channelUpdateCount).to.deep.equal(refStore.channelUpdateCount);
        expect(gossipStore.nodeAnnouncementCount).to.deep.equal(refStore.nodeAnnouncementCount);
        expect(pendingStore.channelUpdateCount).to.equal(0);
        expect(pendingStore.nodeAnnouncementCount).to.equal(0);
      });
    }
  });
});
