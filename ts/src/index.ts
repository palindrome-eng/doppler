import {
    Connection,
    PublicKey,
    Transaction,
    TransactionInstruction,
    Keypair,
    SystemProgram,
    ComputeBudgetProgram,
    sendAndConfirmTransaction,
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

/**
 * Generic Oracle data structure
 */
export interface Oracle<T> {
    sequence: bigint;
    payload: T;
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
 * Built-in serializer for u64 payloads (price feeds)
 */
export class U64Serializer implements PayloadSerializer<bigint> {
    serialize(payload: bigint): Buffer {
        const buf = Buffer.alloc(8);
        buf.writeBigUInt64LE(payload);
        return buf;
    }

    deserialize(buffer: Buffer): bigint {
        return buffer.readBigUInt64LE(0);
    }

    size(): number {
        return 8;
    }
}

/**
 * Price Feed structure matching the Rust implementation
 */
export interface PriceFeed {
    price: bigint;
}

/**
 * Serializer for PriceFeed payloads
 */
export class PriceFeedSerializer implements PayloadSerializer<PriceFeed> {
    serialize(payload: PriceFeed): Buffer {
        const buf = Buffer.alloc(8);
        buf.writeBigUInt64LE(payload.price);
        return buf;
    }

    deserialize(buffer: Buffer): PriceFeed {
        return {
            price: buffer.readBigUInt64LE(0),
        };
    }

    size(): number {
        return 8;
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
        oracle: Oracle<T>,
        serializer: PayloadSerializer<T>
    ): this {
        const instruction = this.createUpdateInstruction(
            oraclePubkey,
            oracle,
            serializer
        );

        const payloadSize = serializer.size();
        const oracleSize = 8 + payloadSize; // sequence + payload

        this.computeUnits +=
            SEQUENCE_CHECK_CU +
            ADMIN_VERIFICATION_CU +
            PAYLOAD_WRITE_CU +
            Math.floor(oracleSize / 4);

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
        oracle: Oracle<T>,
        serializer: PayloadSerializer<T>
    ): TransactionInstruction {
        const data = this.serializeOracle(oracle, serializer);

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
            ],
            data,
        });
    }

    private serializeOracle<T>(
        oracle: Oracle<T>,
        serializer: PayloadSerializer<T>
    ): Buffer {
        const sequenceBuffer = Buffer.alloc(8);
        sequenceBuffer.writeBigUInt64LE(oracle.sequence);

        const payloadBuffer = serializer.serialize(oracle.payload);

        return Buffer.concat([sequenceBuffer, payloadBuffer]);
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

        const sequence = data.readBigUInt64LE(0);
        const payloadBuffer = data.subarray(8, 8 + serializer.size());
        const payload = serializer.deserialize(payloadBuffer);

        return { sequence, payload };
    }

    /**
     * Create an oracle account with a seed
     */
    async createOracleAccount<T>(
        seed: string,
        serializer: PayloadSerializer<T>,
        initialOracle: Oracle<T>
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
        oracle: Oracle<T>,
        serializer: PayloadSerializer<T>,
        unitPrice?: bigint
    ): Promise<string> {
        const recentBlockhash = await this.connection.getLatestBlockhash();

        let builder = this.createTransactionBuilder().addOracleUpdate(
            oraclePubkey,
            oracle,
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
            oracle: Oracle<T>;
            serializer: PayloadSerializer<T>;
        }>,
        unitPrice?: bigint
    ): Promise<string> {
        const recentBlockhash = await this.connection.getLatestBlockhash();

        let builder = this.createTransactionBuilder();

        for (const update of updates) {
            builder = builder.addOracleUpdate(
                update.oraclePubkey,
                update.oracle,
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