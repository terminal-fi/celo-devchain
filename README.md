# celo-devchain

Ganache-cli setup with core Celo contracts for local testing and development. 

## Usage 

```
> npm install --save-dev celo-devchain
> npx celo-devchain --port 7545
```

For example code that uses this package, checkout: https://github.com/zviadm/celo-hellocontracts

## Chain Data

Chain data in `./chains` folder is generated using steps described here: https://docs.celo.org/developer-guide/development-chain.

You can also use `celo-devchain` with custom generated chain data:
```
> npx celo-devchain --file <path to custom chain data>
```
