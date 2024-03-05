#!/usr/bin/env node
import commander from "commander";
import path from "path";
import * as targz from "targz";
import * as tmp from "tmp";
import ganache from "ganache";
import { CeloContract, newKit } from "@celo/contractkit";
import { toWei } from "web3-utils";

import { ACCOUNT_ADDRESSES, MNEMONIC } from "./utils";

const gasLimit = 20000000;

const program = commander.program
  .version(require("../package.json").version)
  .description("Start ganache-cli with all Celo core contracts deployed.")
  .option("-p --port <port>", "Port to listen on.", "7545")
  .option(
    "--core <core>",
    "Core contracts version to use. Default is `latest`. " +
      "Supports: v10, v11",
    "v11"
  )
  .option("-f --file <file>", "Path to custom core contracts build.")
  .option("--db <db>", "Path to store decompressed chain data.", undefined)
  .option("-t --test", "Run sanity tests and exit.")
  .parse(process.argv);

process.on("unhandledRejection", (reason, _promise) => {
  // @ts-ignore
  console.error("Unhandled Rejection at:", reason.stack || reason);
  process.exit(0);
});

async function runDevChainFromTar(
  filename: string,
  port: number,
  db: string,
  onStart?: (port: number, stop: () => Promise<void>) => void
) {
  let stopGanache: () => Promise<void>;
  let datadir: string;
  if (db != undefined) {
    datadir = db;
  } else {
    const chainCopy: tmp.DirResult = tmp.dirSync({
      keep: false,
      unsafeCleanup: true,
    });
    console.log(`Creating tmp folder: ${chainCopy.name}`);
    datadir = chainCopy.name;
  }
  await decompressChain(filename, datadir);
  stopGanache = await startGanache(datadir, {
    verbose: true,
    port: port,
    onStart: onStart,
  });
  return stopGanache;
}

function decompressChain(
  tarPath: string,
  copyChainPath: string
): Promise<void> {
  console.log("Decompressing chain");
  return new Promise((resolve, reject) => {
    targz.decompress({ src: tarPath, dest: copyChainPath }, (err) => {
      if (err) {
        console.error(err);
        reject(err);
      } else {
        console.log("Chain decompressed");
        resolve();
      }
    });
  });
}

async function startGanache(
  datadir: string,
  opts: {
    port?: number;
    verbose?: boolean;
    onStart?: (port: number, stop: () => Promise<void>) => void;
  }
) {
  const logFn = opts.verbose
    ? (...args: any[]) => console.log(...args)
    : () => {};

  const server = ganache.server({
    logging: { logger: { log: logFn } },
    chain: {
      networkId: 1101,
      allowUnlimitedContractSize: true,
      vmErrorsOnRPCResponse: false,
    },
    database: { dbPath: datadir },
    wallet: { mnemonic: MNEMONIC, defaultBalance: 200000000 },
    miner: { blockGasLimit: gasLimit },
  });

  let stopCalled = false;
  const stop = async () => {
    try {
      if (stopCalled) {
        return;
      }
      console.log("Ganache STOPPING");
      stopCalled = true;
      await server.close();
      console.log("Ganache STOPPED");
    } catch (error) {
      throw error;
    }
  };

  const port = opts.port || 7545;

  server.listen(port, (err: any) => {
    if (err) {
      throw err;
    } else {
      console.log("Ganache STARTED");

      if (opts.onStart) {
        opts.onStart(port, stop);
      }
    }
  });

  return stop;
}

async function runTests(port: number, stop: () => Promise<void>) {
  console.log(`[test] running...`);
  const kit = newKit(`http://127.0.0.1:${port}`);
  for (const contract of Object.values(CeloContract)) {
    // Skip contracts that are deployed individually.
    if (contract === CeloContract.ERC20 || contract === CeloContract.MultiSig) {
      continue;
    }
    const address = await kit.registry.addressFor(contract);
    console.log(`[test]`, contract.toString().padEnd(30), address);
  }

  const goldToken = await kit.contracts.getGoldToken();
  const a0 = ACCOUNT_ADDRESSES[0];
  const a1 = ACCOUNT_ADDRESSES[1];
  const balance0 = await goldToken.balanceOf(a0);
  const balance1 = await goldToken.balanceOf(a1);
  console.log(`[test] balance: ${balance0.toString()}, ${balance1.toString()}`);

  // TODO(zviad): one day, when @celo/ganache-cli supports locally sigend transactions.
  // kit.addAccount(ACCOUNT_PRIVATE_KEYS[0])
  await goldToken
    .transfer(a1, toWei("10", "ether"))
    .sendAndWaitForReceipt({ from: a0 });
  const balance0_2 = await goldToken.balanceOf(a0);
  const balance1_2 = await goldToken.balanceOf(a1);
  console.log(
    `[test] balance: ${balance0_2.toString()}, ${balance1_2.toString()}`
  );

  await stop();
}

const opts = program.opts();
const filename = opts.file
  ? opts.file
  : path.join(__dirname, "..", "chains", `${opts.core}.tar.gz`);
const onStart = opts.test ? runTests : undefined;

tmp.setGracefulCleanup();
runDevChainFromTar(filename, opts.port, opts.db, onStart).then((stop) => {
  process.once("SIGTERM", () => {
    stop();
  });
  process.once("SIGINT", () => {
    stop();
  });
});
