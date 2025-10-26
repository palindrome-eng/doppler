import {
    Connection,
    PublicKey,
    Transaction,
    TransactionInstruction,
    Keypair,
    SystemProgram,
    ComputeBudgetProgram,
    sendAndConfirmTransaction,
    SYSVAR_CLOCK_PUBKEY,
} from '@solana/web3.js';
import { Buffer } from 'buffer';
import { getSetLoadedAccountsDataSizeLimitInstruction } from "@solana-program/compute-budget";
import { AccountRole } from '@solana/kit';

// Program ID: PRicevBH6BaeaE8qmrxrwGBZ5hSZ9vjBNue5Ygot1ML
export const DOPPLER_PROGRAM_ID = new PublicKey(
    'PRicevBH6BaeaE8qmrxrwGBZ5hSZ9vjBNue5Ygot1ML'
);

// Admin public key: pRiCEzwgkSi7KTsQHdyfuRbPEuCFoK9sA5QVn2hvABV
export const ADMIN_PUBKEY = new PublicKey(
    'pRiCEzwgkSi7KTsQHdyfuRbPEuCFoK9sA5QVn2hvABV'
);

// Constants for compute unit calculations
const SEQUENCE_CHECK_CU = 5;
const ADMIN_VERIFICATION_CU = 6;
const PAYLOAD_WRITE_CU = 6;
const COMPUTE_BUDGET_IX_CU = 150;
const COMPUTE_BUDGET_UNIT_PRICE_SIZE = 9;
const COMPUTE_BUDGET_UNIT_LIMIT_SIZE = 5;
const COMPUTE_BUDGET_DATA_LIMIT_SIZE = 5;
const COMPUTE_BUDGET_PROGRAM_SIZE = 22;
const ORACLE_PROGRAM_SIZE = 36;
const READ_CLOCK_CU = 11;

/**
 * Generic Oracle data structure matching Rust implementation
 */
export interface Oracle<T> {
    slot: bigint;
    payload: T;
}

/**
 * Price data payload with precision information
 * Matches the Rust PriceData struct
 */
export interface PriceData {
    price: bigint;
    precision: number;
}

/**
 * Serializer interface for custom payload types
 */
export interface PayloadSerializer<T> {
    serialize(payload: T): Buffer;
    deserialize(buffer: Buffer): T;
    size(): number;
}

/**
 * Built-in serializer for [u8; 8] payloads (used for price feeds)
 * The payload is simply 8 bytes representing data in little-endian format
 */
export class U8Array8Serializer implements PayloadSerializer<Buffer> {
    serialize(payload: Buffer): Buffer {
        if (payload.length !== 8) {
            throw new Error('Payload must be exactly 8 bytes');
        }
        return payload;
    }

    deserialize(buffer: Buffer): Buffer {
        if (buffer.length < 8) {
            throw new Error('Buffer must be at least 8 bytes');
        }
        return buffer.subarray(0, 8);
    }

    size(): number {
        return 8;
    }
}

/**
 * Helper function to create a [u8; 8] payload from a bigint price value
 */
export function createPricePayload(price: bigint): Buffer {
    const buf = Buffer.alloc(8);
    buf.writeBigUInt64LE(price);
    return buf;
}

/**
 * Helper function to read a price value from a [u8; 8] payload
 */
export function readPriceFromPayload(payload: Buffer): bigint {
    if (payload.length < 8) {
        throw new Error('Payload must be at least 8 bytes');
    }
    return payload.readBigUInt64LE(0);
}

/**
 * Built-in serializer for PriceData payloads
 * Structure: 8 bytes for price, 1 byte for precision (total 9 bytes)
 */
export class PriceDataSerializer implements PayloadSerializer<PriceData> {
    serialize(payload: PriceData): Buffer {
        const buf = Buffer.alloc(9);
        buf.writeBigUInt64LE(payload.price, 0);
        buf.writeUInt8(payload.precision, 8);
        return buf;
    }

    deserialize(buffer: Buffer): PriceData {
        if (buffer.length < 9) {
            throw new Error('Buffer must be at least 9 bytes');
        }
        const price = buffer.readBigUInt64LE(0);
        const precision = buffer.readUInt8(8);
        return { price, precision };
    }

    size(): number {
        return 9;
    }
}

/**
 * Transaction builder for Doppler oracle updates
 */
export class TransactionBuilder {
    private oracleUpdateInstructions: TransactionInstruction[] = [];
    private unitPrice?: bigint;
    private computeUnits: number = COMPUTE_BUDGET_IX_CU * 2;
    private loadedAccountDataSize: number =
        ORACLE_PROGRAM_SIZE +
        COMPUTE_BUDGET_PROGRAM_SIZE +
        COMPUTE_BUDGET_UNIT_LIMIT_SIZE +
        COMPUTE_BUDGET_DATA_LIMIT_SIZE +
        2;

    constructor(private admin: Keypair) { }

    /**
     * Add an oracle update instruction to the transaction
     */
    addOracleUpdate<T>(
        oraclePubkey: PublicKey,
        payload: T,
        serializer: PayloadSerializer<T>
    ): this {
        const instruction = this.createUpdateInstruction(
            oraclePubkey,
            payload,
            serializer
        );

        const payloadSize = serializer.size();
        const oracleSize = 8 + payloadSize; // slot + payload

        this.computeUnits +=
            SEQUENCE_CHECK_CU +
            ADMIN_VERIFICATION_CU +
            PAYLOAD_WRITE_CU +
            Math.floor(oracleSize / 4) +
            READ_CLOCK_CU;

        this.loadedAccountDataSize += oracleSize * 2;
        this.oracleUpdateInstructions.push(instruction);

        return this;
    }

    /**
     * Set the compute unit price in micro-lamports
     */
    withUnitPrice(microLamports: bigint): this {
        this.unitPrice = microLamports;
        return this;
    }

    /**
     * Build the final transaction
     */
    build(recentBlockhash: string): Transaction {
        const instructions: TransactionInstruction[] = [];
        let loadedAccountDataSize = this.loadedAccountDataSize;
        let computeUnits = this.computeUnits;

        if (this.unitPrice !== undefined) {
            instructions.push(
                ComputeBudgetProgram.setComputeUnitPrice({
                    microLamports: this.unitPrice,
                })
            );
            loadedAccountDataSize += COMPUTE_BUDGET_UNIT_PRICE_SIZE;
            computeUnits += COMPUTE_BUDGET_IX_CU;
        }

        const loadedAccountsDataSizeLimitInstruction = getSetLoadedAccountsDataSizeLimitInstruction({
            accountDataSizeLimit: loadedAccountDataSize * 2
        });


        instructions.push(
            new TransactionInstruction({
                keys: [],
                programId: new PublicKey(loadedAccountsDataSizeLimitInstruction.programAddress.toString()),
                data: Buffer.from(loadedAccountsDataSizeLimitInstruction.data),
            })
        );

        instructions.push(
            ComputeBudgetProgram.setComputeUnitLimit({
                units: computeUnits,
            })
        );

        instructions.push(...this.oracleUpdateInstructions);

        const transaction = new Transaction({
            feePayer: this.admin.publicKey,
            recentBlockhash,
        });

        transaction.add(...instructions);
        transaction.sign(this.admin);

        return transaction;
    }

    private createUpdateInstruction<T>(
        oraclePubkey: PublicKey,
        payload: T,
        serializer: PayloadSerializer<T>
    ): TransactionInstruction {
        const data = serializer.serialize(payload);

        return new TransactionInstruction({
            programId: DOPPLER_PROGRAM_ID,
            keys: [
                {
                    pubkey: this.admin.publicKey,
                    isSigner: true,
                    isWritable: false,
                },
                {
                    pubkey: oraclePubkey,
                    isSigner: false,
                    isWritable: true,
                },
                {
                    pubkey: SYSVAR_CLOCK_PUBKEY,
                    isSigner: false,
                    isWritable: false,
                },
            ],
            data,
        });
    }
}

/**
 * Main Doppler class for interacting with oracle accounts
 */
export class Doppler {
    constructor(
        private connection: Connection,
        private admin: Keypair
    ) { }

    /**
     * Create a new transaction builder
     */
    createTransactionBuilder(): TransactionBuilder {
        return new TransactionBuilder(this.admin);
    }

    /**
     * Fetch oracle account data and deserialize it
     */
    async fetchOracle<T>(
        oraclePubkey: PublicKey,
        serializer: PayloadSerializer<T>
    ): Promise<Oracle<T> | null> {
        try {
            const accountInfo = await this.connection.getAccountInfo(oraclePubkey);

            if (!accountInfo || !accountInfo.data) {
                return null;
            }

            return this.deserializeOracle(accountInfo.data, serializer);
        } catch (error) {
            console.error('Error fetching oracle account:', error);
            return null;
        }
    }

    /**
     * Deserialize oracle data from a buffer
     */
    deserializeOracle<T>(
        data: Buffer,
        serializer: PayloadSerializer<T>
    ): Oracle<T> {
        const expectedSize = 8 + serializer.size();
        if (data.length < expectedSize) {
            throw new Error(
                `Invalid oracle data size. Expected at least ${expectedSize}, got ${data.length}`
            );
        }

        const slot = data.readBigUInt64LE(0);
        const payloadBuffer = data.subarray(8, 8 + serializer.size());
        const payload = serializer.deserialize(payloadBuffer);

        return { slot, payload };
    }

    /**
     * Create an oracle account from a keypair
     */
    async createOracleAccount<T>(
        oracleKeypair: Keypair,
        serializer: PayloadSerializer<T>
    ): Promise<PublicKey> {
        const oracleSize = 8 + serializer.size();
        const lamports = await this.connection.getMinimumBalanceForRentExemption(
            oracleSize
        );

        const createAccountInstruction = SystemProgram.createAccount({
            fromPubkey: this.admin.publicKey,
            newAccountPubkey: oracleKeypair.publicKey,
            lamports,
            space: oracleSize,
            programId: DOPPLER_PROGRAM_ID,
        });

        const recentBlockhash = await this.connection.getLatestBlockhash();
        const transaction = new Transaction({
            feePayer: this.admin.publicKey,
            recentBlockhash: recentBlockhash.blockhash,
        });

        transaction.add(createAccountInstruction);
        transaction.sign(this.admin, oracleKeypair);

        await sendAndConfirmTransaction(this.connection, transaction, [
            this.admin,
            oracleKeypair,
        ]);

        return oracleKeypair.publicKey;
    }

    /**
     * Create an oracle account with a seed
     */
    async createOracleAccountWithSeed<T>(
        seed: string,
        serializer: PayloadSerializer<T>
    ): Promise<PublicKey> {
        const oracleSize = 8 + serializer.size();
        const lamports = await this.connection.getMinimumBalanceForRentExemption(
            oracleSize
        );

        const oraclePubkey = await PublicKey.createWithSeed(
            this.admin.publicKey,
            seed,
            DOPPLER_PROGRAM_ID
        );

        const createAccountInstruction = SystemProgram.createAccountWithSeed({
            fromPubkey: this.admin.publicKey,
            newAccountPubkey: oraclePubkey,
            basePubkey: this.admin.publicKey,
            seed,
            lamports,
            space: oracleSize,
            programId: DOPPLER_PROGRAM_ID,
        });

        const recentBlockhash = await this.connection.getLatestBlockhash();
        const transaction = new Transaction({
            feePayer: this.admin.publicKey,
            recentBlockhash: recentBlockhash.blockhash,
        });

        transaction.add(createAccountInstruction);
        transaction.sign(this.admin);

        await sendAndConfirmTransaction(this.connection, transaction, [this.admin]);

        return oraclePubkey;
    }

    /**
     * Update a single oracle account
     */
    async updateOracle<T>(
        oraclePubkey: PublicKey,
        payload: T,
        serializer: PayloadSerializer<T>,
        unitPrice?: bigint
    ): Promise<string> {
        const recentBlockhash = await this.connection.getLatestBlockhash();

        let builder = this.createTransactionBuilder().addOracleUpdate(
            oraclePubkey,
            payload,
            serializer
        );

        if (unitPrice !== undefined) {
            builder = builder.withUnitPrice(unitPrice);
        }

        const transaction = builder.build(recentBlockhash.blockhash);

        const signature = await sendAndConfirmTransaction(
            this.connection,
            transaction,
            [this.admin]
        );

        return signature;
    }

    /**
     * Update multiple oracle accounts in a single transaction
     */
    async updateMultipleOracles<T>(
        updates: Array<{
            oraclePubkey: PublicKey;
            payload: T;
            serializer: PayloadSerializer<T>;
        }>,
        unitPrice?: bigint
    ): Promise<string> {
        const recentBlockhash = await this.connection.getLatestBlockhash();

        let builder = this.createTransactionBuilder();

        for (const update of updates) {
            builder = builder.addOracleUpdate(
                update.oraclePubkey,
                update.payload,
                update.serializer
            );
        }

        if (unitPrice !== undefined) {
            builder = builder.withUnitPrice(unitPrice);
        }

        const transaction = builder.build(recentBlockhash.blockhash);

        const signature = await sendAndConfirmTransaction(
            this.connection,
            transaction,
            [this.admin]
        );

        return signature;
    }

    /**
     * Get the admin keypair
     */
    getAdmin(): Keypair {
        return this.admin;
    }

    /**
     * Get the connection
     */
    getConnection(): Connection {
        return this.connection;
    }
}