#!/usr/bin/env node
import commander from "commander";
import path from "path";
import * as targz from "targz"
import * as tmp from "tmp"
const ganache = require("@celo/ganache-cli")

import { newKit } from "@celo/contractkit";
import { MNEMONIC } from "./utils";

const gasLimit = 20000000

const program = commander.program
	.version(require('../package.json').version)
	.description("Start ganache-cli with all Celo core contracts deployed.")
	.option("-p --port <port>", "Port to listen on.", "7545")
	.option("--core <core>", "Core contracts version to use. Default is `latest`. Supports: v1", "v1")
	.option("-f --file <file>", "Path to custom core contracts build.")
	.parse(process.argv);

process.on('unhandledRejection', (reason, _promise) => {
	// @ts-ignore
	console.error('Unhandled Rejection at:', reason.stack || reason)
	process.exit(0)
})

async function runDevChainFromTar(filename: string, port: number) {
	const chainCopy: tmp.DirResult = tmp.dirSync({ keep: false, unsafeCleanup: true })
	console.log(`Creating tmp folder: ${chainCopy.name}`)
	await decompressChain(filename, chainCopy.name)
	const stopGanache = await startGanache(chainCopy.name, {verbose: true, port: port}, chainCopy)
	return stopGanache
}

function decompressChain(tarPath: string, copyChainPath: string): Promise<void> {
	console.log('Decompressing chain')
	return new Promise((resolve, reject) => {
		targz.decompress({ src: tarPath, dest: copyChainPath }, (err) => {
			if (err) {
				console.error(err)
				reject(err)
			} else {
				console.log('Chain decompressed')
				resolve()
			}
		})
	})
}

async function startGanache(
	datadir: string,
	opts: {
		port?: number,
		verbose?: boolean,
	},
	chainCopy?: tmp.DirResult) {
	const logFn = opts.verbose ? (...args: any[]) => console.log(...args) : () => {}
	const server = ganache.server({
		default_balance_ether: 200000000,
		logger: { log: logFn },
		network_id: 1101,
		db_path: datadir,
		mnemonic: MNEMONIC,
		gasLimit,
		allowUnlimitedContractSize: true,
	})

	const port = opts.port || 7545
	await new Promise((resolve, reject) => {
		server.listen(port, (err: any, blockchain: any) => {
			if (err) {
				reject(err)
			} else {
				console.log('Ganache STARTED')
				resolve(blockchain)
				printCoreContracts(port)
			}
		})
	})
	return () => new Promise((resolve, reject) => {
		server.close((err: any) => {
			if (chainCopy) {
				chainCopy.removeCallback()
			}
			if (err) {
				reject(err)
			} else {
				resolve()
			}
		})
	})
}

async function printCoreContracts(port: number) {
	const kit = newKit(`http://127.0.0.1:${port}`)
	const addresses = await kit.registry.allAddresses()
	console.log(`CORE CONTRACTS:`)
	for (const [contract, address] of Object.entries(addresses)) {
		console.log(contract.toString().padEnd(30), address)
	}
}

const opts = program.opts()
const filename = opts.file ? opts.file : path.join(__dirname, "..", "chains", `${opts.core}.tar.gz`)
runDevChainFromTar(filename, opts.port)