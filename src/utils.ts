import Web3 from "web3";

export const MNEMONIC = 'concert load couple harbor equip island argue ramp clarify fence smart topic'

export function increaseTime(web3: Web3, secondsToAdd: number) {
	const provider = web3.currentProvider
	if (!provider || typeof provider === "string") {
		throw new Error(`invalid currentProvider!`)
	}
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