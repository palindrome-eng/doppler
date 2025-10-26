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
import { Doppler, U8Array8Serializer, createPricePayload } from "@reflectmoney/oracle.ts";
import { Connection, Keypair } from "@solana/web3.js";

const connection = new Connection("https://api.mainnet-beta.solana.com");
const admin = Keypair.fromSecretKey(/* admin keypair */);

const doppler = new Doppler(connection, admin);
```

### Update an Oracle

```typescript
import { PublicKey } from "@solana/web3.js";

const oraclePublicKey = new PublicKey("ORACLE_ADDRESS");

// Create a price payload (8 bytes representing a u64 value)
const pricePayload = createPricePayload(BigInt(1_000_000)); // 1 USDC

await doppler.updateOracle(
    oraclePublicKey,
    { 
        slot: BigInt(Date.now()),
        payload: pricePayload,
    },
    new U8Array8Serializer(),
);
```

### Fetch Oracle Data

```typescript
import { readPriceFromPayload } from "@reflectmoney/oracle.ts";

const oracleData = await doppler.fetchOracle(
    oraclePublicKey,
    new U8Array8Serializer(),
);

if (oracleData) {
    console.log("Slot:", oracleData.slot);
    
    // Extract price from the 8-byte payload
    const price = readPriceFromPayload(oracleData.payload);
    console.log("Price:", price);
}
// Output:
// Slot: 1728662400000n
// Price: 1000000n
```

### Create an Oracle Account

```typescript
const oracleAccount = await doppler.createOracleAccount(
    "my-oracle-seed",
    new U8Array8Serializer(), 
    { 
        slot: 0n,
        payload: createPricePayload(BigInt(1_000_000)),
    }
);
```

## Links

- [GitHub Repository](https://github.com/palindrome-eng/doppler)
- [Reflect](https://reflect.money)

## License

MIT

