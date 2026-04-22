import os from "node:os";

export function getLanAddresses(): string[] {
  const interfaces = os.networkInterfaces();
  const addresses: string[] = [];

  for (const network of Object.values(interfaces)) {
    if (!network) {
      continue;
    }

    for (const address of network) {
      if (address.family === "IPv4" && !address.internal) {
        addresses.push(address.address);
      }
    }
  }

  return [...new Set(addresses)];
}
