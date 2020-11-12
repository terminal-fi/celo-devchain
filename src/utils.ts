import { ContractKit } from "@celo/contractkit"
import {JsonRpcPayload, JsonRpcResponse} from "web3-core-helpers"

export const MNEMONIC = 'concert load couple harbor equip island argue ramp clarify fence smart topic'

export interface Provider {
	send(
		payload: JsonRpcPayload,
		callback: (error: Error | null, result?: JsonRpcResponse) => void
	): void
}

export function sendJSONRpc(
	provider: Provider, method: string, params: any[]) {
	return new Promise((resolve, reject) => {
		provider.send({
			jsonrpc: '2.0',
			id: Date.now() + Math.floor(Math.random() * ( 1 + 100 - 1 )),
			method: method,
			params: params,
		}, (err, res) => (err ? reject(err) : resolve(res)))
	})
}

export function mineBlock(provider: Provider) {
	return sendJSONRpc(provider, 'evm_mine', [])
}

export async function increaseTime(
	provider: Provider,
	secondsToAdd: number) {
	await sendJSONRpc(provider, 'evm_increaseTime', [secondsToAdd])
	return mineBlock(provider)
}

export async function mineToNextEpoch(kit: ContractKit) {
	const currentBlock = await kit.web3.eth.getBlockNumber()
	const currentEpoch = await kit.getEpochNumberOfBlock(currentBlock)
	const nextEpochBlock = await kit.getFirstBlockNumberForEpoch(currentEpoch + 1)
	for (let i = 0; i < nextEpochBlock - currentBlock; i+=1) {
		await mineBlock(kit.web3.currentProvider as Provider)
	}
}