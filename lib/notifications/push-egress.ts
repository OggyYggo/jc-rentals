import "server-only";
import { lookup } from "node:dns";
import { Agent } from "node:https";
import { BlockList } from "node:net";

const reserved = new BlockList();
for (const [network, prefix] of [
  ["0.0.0.0", 8], ["10.0.0.0", 8], ["100.64.0.0", 10], ["127.0.0.0", 8],
  ["169.254.0.0", 16], ["172.16.0.0", 12], ["192.0.0.0", 24], ["192.0.2.0", 24],
  ["192.168.0.0", 16], ["198.18.0.0", 15], ["198.51.100.0", 24], ["203.0.113.0", 24],
  ["224.0.0.0", 3],
] as const) reserved.addSubnet(network, prefix);
reserved.addSubnet("2001::", 23, "ipv6");
reserved.addSubnet("2001:db8::", 32, "ipv6");
reserved.addSubnet("2002::", 16, "ipv6");
reserved.addSubnet("3fff::", 20, "ipv6");
const globalV6 = new BlockList();
globalV6.addSubnet("2000::", 3, "ipv6");

// Use the checked DNS answers for the connection itself. TLS still verifies
// the provider hostname and sends it as SNI.
export const pushAgent = new Agent({
  lookup(host, options, callback) {
    lookup(host, { ...options, all: true }, (error, addresses) => {
      if (error) return callback(error, "", 0);
      const safe = addresses.filter(({ address, family }) => family === 4
        ? !reserved.check(address)
        : globalV6.check(address, "ipv6") && !reserved.check(address, "ipv6"));
      if (!safe.length) return callback(new Error("Push destination unavailable."), "", 0);
      if ("all" in options && options.all) return callback(null, safe);
      return callback(null, safe[0].address, safe[0].family);
    });
  },
});
