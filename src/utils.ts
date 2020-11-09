import {JsonRpcPayload, JsonRpcResponse} from "web3-core-helpers"

export const MNEMONIC = 'concert load couple harbor equip island argue ramp clarify fence smart topic'

export function increaseTime(
	provider: {
		send(
			payload: JsonRpcPayload,
			callback: (error: Error | null, result?: JsonRpcResponse) => void
		): void
	},
	secondsToAdd: number) {
	return new Promise((resolve, reject) => {
		provider.send({
			jsonrpc: '2.0',
			id: Date.now(),
			method: 'evm_increaseTime',
			params: [secondsToAdd],
		}, (err) => {
			if (err) return reject(err);
			provider.send({
				jsonrpc: '2.0',
				id: Date.now(),
				method: 'evm_mine',
				params: [],
			}, (err, res) => (err ? reject(err) : resolve(res)));
		});
	});
}