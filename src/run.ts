#!/usr/bin/env node
import commander from "commander";
import path from "path";
import * as targz from "targz"
import * as tmp from "tmp"
const ganache = require("@celo/ganache-cli")
import { newKit } from "@celo/contractkit"
import { toWei } from "web3-utils"

import { ACCOUNT_ADDRESSES, MNEMONIC } from "./utils"

const gasLimit = 20000000

const program = commander.program
	.version(require('../package.json').version)
	.description("Start ganache-cli with all Celo core contracts deployed.")
	.option("-p --port <port>", "Port to listen on.", "7545")
	.option("--core <core>",
		"Core contracts version to use. Default is `latest`. " +
		"Supports: v1, v2, v3, v4, v5, v7",
		"v7")
	.option("-f --file <file>", "Path to custom core contracts build.")
	.option("--db <db>", "Path to store decompressed chain data.", undefined)
	.option("-t --test", "Run sanity tests and exit.")
	.parse(process.argv);

process.on('unhandledRejection', (reason, _promise) => {
	// @ts-ignore
	console.error('Unhandled Rejection at:', reason.stack || reason)
	process.exit(0)
})

async function runDevChainFromTar(
	filename: string,
	port: number,
	db: string,
	onStart?: (port: number, stop: () => Promise<void>) => void) {
	let stopGanache: () => Promise<void>
	if (db != undefined) {
		await decompressChain(filename, db)
		stopGanache = await startGanache(
			db,
			{
				verbose: true,
				port: port,
				onStart: onStart,
			})
	}
	else {
		const chainCopy: tmp.DirResult = tmp.dirSync({ keep: false, unsafeCleanup: true })
		console.log(`Creating tmp folder: ${chainCopy.name}`)
		await decompressChain(filename, chainCopy.name)
		stopGanache = await startGanache(
			chainCopy.name,
			{
				verbose: true,
				port: port,
				onStart: onStart,
			})
	}
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
		onStart?: (port: number, stop: () => Promise<void>) => void,
	}) {
	const logFn = opts.verbose ? (...args: any[]) => console.log(...args) : () => { }
	const server = ganache.server({
		default_balance_ether: 200000000,
		logger: { log: logFn },
		network_id: 1101,
		db_path: datadir,
		mnemonic: MNEMONIC,
		gasLimit,
		allowUnlimitedContractSize: true,
		vmErrorsOnRPCResponse: false, // Compatible with GETH.
		// Larger keep alive timeout to not drop connections accidentally during tests.
		keepAliveTimeout: 30000,
	})

	let stopCalled = false
	const stop = () => new Promise<void>((resolve, reject) => {
		if (stopCalled) {
			return
		}
		console.log('Ganache STOPPING')
		stopCalled = true
		server.close((err: any) => {
			console.log('Ganache STOPPED')
			if (err) {
				reject(err)
			} else {
				resolve()
			}
		})
	})
	const port = opts.port || 7545
	await new Promise((resolve, reject) => {
		server.listen(port, (err: any, blockchain: any) => {
			if (err) {
				reject(err)
			} else {
				console.log('Ganache STARTED')
				resolve(blockchain)
				if (opts.onStart) {
					opts.onStart(port, stop)
				}
			}
		})
	})
	return stop
}

async function runTests(port: number, stop: () => Promise<void>) {
	console.log(`[test] running...`)
	const kit = newKit(`http://127.0.0.1:${port}`)
	const addresses = await kit.registry.addressMapping()
	for (const [contract, address] of addresses.entries()) {
		console.log(`[test]`, contract.toString().padEnd(30), address)
	}

	const goldToken = await kit.contracts.getGoldToken()
	const a0 = ACCOUNT_ADDRESSES[0]
	const a1 = ACCOUNT_ADDRESSES[1]
	const balance0 = await goldToken.balanceOf(a0)
	const balance1 = await goldToken.balanceOf(a1)
	console.log(`[test] balance: ${balance0.toString()}, ${balance1.toString()}`)

	// TODO(zviad): one day, when @celo/ganache-cli supports locally sigend transactions.
	// kit.addAccount(ACCOUNT_PRIVATE_KEYS[0])
	await goldToken
		.transfer(a1, toWei("10", "ether"))
		.sendAndWaitForReceipt({ from: a0 })
	const balance0_2 = await goldToken.balanceOf(a0)
	const balance1_2 = await goldToken.balanceOf(a1)
	console.log(`[test] balance: ${balance0_2.toString()}, ${balance1_2.toString()}`)

	await stop()
}

const opts = program.opts()
const filename = opts.file ? opts.file : path.join(__dirname, "..", "chains", `${opts.core}.tar.gz`)
const onStart = opts.test ? runTests : undefined

tmp.setGracefulCleanup()
runDevChainFromTar(filename, opts.port, opts.db, onStart)
	.then((stop) => {
		process.once("SIGTERM", () => { stop() })
		process.once("SIGINT", () => { stop() })
	})
