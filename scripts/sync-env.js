const fs = require("fs");
const path = require("path");

function readJson(p) {
  return JSON.parse(fs.readFileSync(p, "utf8"));
}

function main() {
  const chainA = readJson(
    path.join(__dirname, "..", "deployments", "chain-a.json"),
  );
  const chainB = readJson(
    path.join(__dirname, "..", "deployments", "chain-b.json"),
  );

  const lines = [
    `CHAIN_A_BRIDGE_LOCK=${chainA.bridgeLock}`,
    `CHAIN_A_VAULT_TOKEN=${chainA.vaultToken}`,
    `CHAIN_A_GOV_EMERGENCY=${chainA.governanceEmergency}`,
    `CHAIN_B_BRIDGE_MINT=${chainB.bridgeMint}`,
    `CHAIN_B_WRAPPED_VAULT_TOKEN=${chainB.wrappedVaultToken}`,
    `CHAIN_B_GOV_VOTING=${chainB.governanceVoting}`,
  ];

  const output = lines.join("\n");

  const outPath = path.join(__dirname, "..", ".env.deployments");
  fs.writeFileSync(outPath, `${output}\n`);

  const envPath = path.join(__dirname, "..", ".env");
  if (fs.existsSync(envPath)) {
    const envRaw = fs.readFileSync(envPath, "utf8");
    const envMap = new Map();

    for (const line of envRaw.split(/\r?\n/)) {
      if (!line || line.trim().startsWith("#") || !line.includes("=")) continue;
      const index = line.indexOf("=");
      const key = line.slice(0, index);
      const value = line.slice(index + 1);
      envMap.set(key, value);
    }

    for (const line of lines) {
      const index = line.indexOf("=");
      envMap.set(line.slice(0, index), line.slice(index + 1));
    }

    const rebuilt = envRaw
      .split(/\r?\n/)
      .map((line) => {
        if (!line || line.trim().startsWith("#") || !line.includes("="))
          return line;
        const index = line.indexOf("=");
        const key = line.slice(0, index);
        if (!envMap.has(key)) return line;
        const value = envMap.get(key);
        envMap.delete(key);
        return `${key}=${value}`;
      })
      .concat(
        Array.from(envMap.entries()).map(([key, value]) => `${key}=${value}`),
      )
      .join("\n");

    fs.writeFileSync(
      envPath,
      rebuilt.endsWith("\n") ? rebuilt : `${rebuilt}\n`,
    );
    console.log(`Updated ${envPath}`);
  }

  console.log(`Wrote ${outPath}`);
}

main();
