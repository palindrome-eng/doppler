# @reflectmoney/oracle.ts

TypeScript SDK for Doppler, the efficient oracle program implemented by [Blueshift](https://blueshift.gg), used by Reflect.

## About

Reflect uses [Doppler](https://github.com/blueshift-gg/doppler) as its oracle solution, enabling oracle updates with just **21 compute units** per call - one of the most efficient implementations on Solana.

**Program ID:** `PRicevBH6BaeaE8qmrxrwGBZ5hSZ9vjBNue5Ygot1ML`

## Installation

With NPM:
```bash
npm install @reflectmoney/oracle.ts
```

With Yarn:
```bash
yarn add @reflectmoney/oracle.ts
```

## Usage

### Initialize Doppler

```typescript
import { Doppler, PriceFeedSerializer } from "@reflectmoney/oracle.ts";
import { Connection, Keypair } from "@solana/web3.js";

const connection = new Connection("https://api.mainnet-beta.solana.com");
const admin = Keypair.fromSecretKey(/* admin keypair */);

const doppler = new Doppler(connection, admin);
```

### Update an Oracle

```typescript
import { PublicKey } from "@solana/web3.js";

const oraclePublicKey = new PublicKey("ORACLE_ADDRESS");

await doppler.updateOracle(
    oraclePublicKey,
    { 
        payload: { price: BigInt(Math.pow(10, 6)) },
        sequence: BigInt(Date.now())
    },
    new PriceFeedSerializer(),
);
```

### Fetch Oracle Data

```typescript
const oracleData = await doppler.fetchOracle(
    oraclePublicKey,
    new PriceFeedSerializer(),
);

console.log(oracleData);
// { sequence: 1, payload: { price: 1000000n } }
```

### Create an Oracle Account

```typescript
const oracleAccount = await doppler.createOracleAccount(
    "my-oracle-seed",
    new PriceFeedSerializer(), 
    { 
        payload: { price: BigInt(Math.pow(10, 6)) },
        sequence: 0n
    }
);
```

## Links

- [GitHub Repository](https://github.com/palindrome-eng/doppler)
- [Reflect](https://reflect.money)

## License

MIT

