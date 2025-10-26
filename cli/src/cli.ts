#!/usr/bin/env node

import { Command } from 'commander';
import { Connection, Keypair, PublicKey } from '@solana/web3.js';
import * as fs from 'fs';
import * as path from 'path';
import * as dotenv from 'dotenv';
import {
    Doppler,
    U8Array8Serializer,
    createPricePayload,
    readPriceFromPayload,
    DOPPLER_PROGRAM_ID,
} from '@reflectmoney/oracle.ts';

// Load environment variables from .env file
dotenv.config();

const program = new Command();

// Helper function to get RPC URL from options or environment
function getRpcUrl(optionsRpc?: string): string {
    const rpc = optionsRpc || process.env.RPC_URL;
    if (!rpc) {
        console.error('❌ Error: RPC URL not provided. Use -r/--rpc option or set RPC_URL environment variable.');
        process.exit(1);
    }
    return rpc;
}

// Helper function to get keypair path from options or environment
function getKeypairPath(optionsKeypair?: string): string {
    const keypairPath = optionsKeypair || process.env.SIGNER;
    if (!keypairPath) {
        console.error('❌ Error: Keypair path not provided. Use -k/--keypair option or set SIGNER environment variable.');
        process.exit(1);
    }
    return keypairPath;
}

// Helper function to load keypair from file or raw JSON array
function loadKeypairFromFile(filepath: string): Keypair {
    try {
        // Check if filepath is a JSON array string (starts with '[')
        if (filepath.trim().startsWith('[')) {
            // Parse as raw JSON array
            const secretKey = Uint8Array.from(JSON.parse(filepath));
            return Keypair.fromSecretKey(secretKey);
        }
        
        // Otherwise, treat as file path
        const resolvedPath = path.resolve(filepath);
        
        if (!fs.existsSync(resolvedPath)) {
            console.error(`❌ Error: Keypair file not found: ${resolvedPath}`);
            console.error('Please provide a valid file path or set SIGNER to a valid path.');
            process.exit(1);
        }
        
        const secretKeyString = fs.readFileSync(resolvedPath, 'utf8');
        const secretKey = Uint8Array.from(JSON.parse(secretKeyString));
        return Keypair.fromSecretKey(secretKey);
    } catch (error) {
        console.error(`❌ Error loading keypair:`);
        if (error instanceof Error) {
            console.error(error.message);
        }
        console.error('\nThe keypair can be provided as:');
        console.error('  - File path: ./keypair.json');
        console.error('  - JSON array in env var: SIGNER="[1,2,3,...]"');
        process.exit(1);
    }
}

// Helper function to parse payload
function parsePayload(payloadStr: string): Buffer {
    // Support multiple formats:
    // 1. Decimal number (will be converted to u64 little-endian)
    // 2. Hex string (0x...)
    // 3. Comma-separated bytes (1,2,3,4,5,6,7,8)
    
    if (payloadStr.startsWith('0x')) {
        // Hex format
        const hex = payloadStr.slice(2);
        if (hex.length !== 16) {
            console.error('Hex payload must be exactly 16 hex characters (8 bytes)');
            process.exit(1);
        }
        return Buffer.from(hex, 'hex');
    } else if (payloadStr.includes(',')) {
        // Comma-separated bytes
        const bytes = payloadStr.split(',').map(b => parseInt(b.trim()));
        if (bytes.length !== 8) {
            console.error('Payload must be exactly 8 bytes');
            process.exit(1);
        }
        return Buffer.from(bytes);
    } else {
        // Decimal number
        try {
            const value = BigInt(payloadStr);
            return createPricePayload(value);
        } catch (error) {
            console.error('Invalid payload format. Use decimal number, hex (0x...), or comma-separated bytes');
            process.exit(1);
        }
    }
}

// Configure program
program
    .name('doppler-cli')
    .description('CLI for interacting with Doppler oracle program')
    .version('1.0.0');

// Create Oracle Account (from keypair)
program
    .command('create-oracle')
    .description('Create a new oracle account from a keypair')
    .option('-r, --rpc <url>', 'Solana RPC URL (defaults to RPC_URL env var)')
    .option('-k, --keypair <path>', 'Path to admin keypair JSON file (defaults to SIGNER env var)')
    .requiredOption('-o, --oracle-keypair <path>', 'Path to oracle keypair JSON file')
    .option('-p, --payload <payload>', 'Initial payload (defaults to 0)', '0')
    .action(async (options) => {
        try {
            const rpcUrl = getRpcUrl(options.rpc);
            const keypairPath = getKeypairPath(options.keypair);
            
            const connection = new Connection(rpcUrl, 'confirmed');
            const admin = loadKeypairFromFile(keypairPath);
            const oracleKeypair = loadKeypairFromFile(options.oracleKeypair);
            const doppler = new Doppler(connection, admin);
            
            console.log('Creating oracle account...');
            console.log('Admin:', admin.publicKey.toString());
            console.log('Oracle:', oracleKeypair.publicKey.toString());
            
            const oraclePubkey = await doppler.createOracleAccount(
                oracleKeypair,
                new U8Array8Serializer()
            );
            
            console.log('✅ Oracle account created successfully!');
            console.log('Oracle Address:', oraclePubkey.toString());
            
            // If initial payload is provided, update it
            if (options.payload !== '0') {
                console.log('\nUpdating initial payload...');
                const payload = parsePayload(options.payload);
                await doppler.updateOracle(
                    oraclePubkey,
                    payload,
                    new U8Array8Serializer()
                );
                console.log('✅ Initial payload set!');
            }
        } catch (error) {
            console.error('❌ Error:', error);
            process.exit(1);
        }
    });

// Create Oracle Account with Seed
program
    .command('create-oracle-with-seed')
    .description('Create a new oracle account using a seed')
    .option('-r, --rpc <url>', 'Solana RPC URL (defaults to RPC_URL env var)')
    .option('-k, --keypair <path>', 'Path to admin keypair JSON file (defaults to SIGNER env var)')
    .requiredOption('-s, --seed <seed>', 'Seed for the oracle account')
    .option('-p, --payload <payload>', 'Initial payload (defaults to 0)', '0')
    .action(async (options) => {
        try {
            const rpcUrl = getRpcUrl(options.rpc);
            const keypairPath = getKeypairPath(options.keypair);
            
            const connection = new Connection(rpcUrl, 'confirmed');
            const admin = loadKeypairFromFile(keypairPath);
            const doppler = new Doppler(connection, admin);
            
            console.log('Creating oracle account with seed...');
            console.log('Admin:', admin.publicKey.toString());
            console.log('Seed:', options.seed);
            
            const oraclePubkey = await doppler.createOracleAccountWithSeed(
                options.seed,
                new U8Array8Serializer()
            );
            
            console.log('✅ Oracle account created successfully!');
            console.log('Oracle Address:', oraclePubkey.toString());
            
            // If initial payload is provided, update it
            if (options.payload !== '0') {
                console.log('\nUpdating initial payload...');
                const payload = parsePayload(options.payload);
                await doppler.updateOracle(
                    oraclePubkey,
                    payload,
                    new U8Array8Serializer()
                );
                console.log('✅ Initial payload set!');
            }
        } catch (error) {
            console.error('❌ Error:', error);
            process.exit(1);
        }
    });

// Update Oracle
program
    .command('update-oracle')
    .description('Update a single oracle account')
    .option('-r, --rpc <url>', 'Solana RPC URL (defaults to RPC_URL env var)')
    .option('-k, --keypair <path>', 'Path to admin keypair JSON file (defaults to SIGNER env var)')
    .requiredOption('-o, --oracle <address>', 'Oracle account address')
    .requiredOption('-p, --payload <payload>', 'Payload to update (decimal, hex with 0x prefix, or comma-separated bytes)')
    .option('-u, --unit-price <microlamports>', 'Compute unit price in micro-lamports')
    .action(async (options) => {
        try {
            const rpcUrl = getRpcUrl(options.rpc);
            const keypairPath = getKeypairPath(options.keypair);
            
            const connection = new Connection(rpcUrl, 'confirmed');
            const admin = loadKeypairFromFile(keypairPath);
            const doppler = new Doppler(connection, admin);
            
            const oraclePubkey = new PublicKey(options.oracle);
            const payload = parsePayload(options.payload);
            const unitPrice = options.unitPrice ? BigInt(options.unitPrice) : undefined;
            
            console.log('Updating oracle...');
            console.log('Oracle:', oraclePubkey.toString());
            console.log('Payload:', payload.toString('hex'));
            if (unitPrice) {
                console.log('Unit Price:', unitPrice.toString(), 'micro-lamports');
            }
            
            const signature = await doppler.updateOracle(
                oraclePubkey,
                payload,
                new U8Array8Serializer(),
                unitPrice
            );
            
            console.log('✅ Oracle updated successfully!');
            console.log('Transaction:', signature);
        } catch (error) {
            console.error('❌ Error:', error);
            process.exit(1);
        }
    });

// Fetch Oracle
program
    .command('fetch-oracle')
    .description('Fetch and display oracle account data')
    .option('-r, --rpc <url>', 'Solana RPC URL (defaults to RPC_URL env var)')
    .requiredOption('-o, --oracle <address>', 'Oracle account address')
    .option('-k, --keypair <path>', 'Path to admin keypair JSON file (optional, uses dummy keypair if not provided)')
    .option('--raw', 'Display raw payload bytes')
    .option('--price', 'Interpret payload as price (u64 little-endian)')
    .option('--debug', 'Show full account data for debugging')
    .action(async (options) => {
        try {
            const rpcUrl = getRpcUrl(options.rpc);
            const connection = new Connection(rpcUrl, 'confirmed');
            
            // Use dummy keypair if not provided (not needed for fetching)
            const admin = options.keypair 
                ? loadKeypairFromFile(options.keypair)
                : Keypair.generate();
            
            const doppler = new Doppler(connection, admin);
            const oraclePubkey = new PublicKey(options.oracle);
            
            console.log('Fetching oracle data...');
            console.log('Oracle:', oraclePubkey.toString());
            
            // If debug mode, show raw account data
            if (options.debug) {
                const accountInfo = await connection.getAccountInfo(oraclePubkey);
                if (!accountInfo) {
                    console.log('❌ Oracle account not found');
                    process.exit(1);
                }
                console.log('\n🐛 Debug Info:');
                console.log('Account owner:', accountInfo.owner.toString());
                console.log('Account size:', accountInfo.data.length, 'bytes');
                console.log('Raw data (hex):', accountInfo.data.toString('hex'));
                console.log('Raw data (bytes):', Array.from(accountInfo.data).join(', '));
                console.log('');
            }
            
            const oracleData = await doppler.fetchOracle(
                oraclePubkey,
                new U8Array8Serializer()
            );
            
            if (!oracleData) {
                console.log('❌ Oracle account not found or has no data');
                process.exit(1);
            }
            
            console.log('\n✅ Oracle Data:');
            console.log('━'.repeat(50));
            console.log('Slot:', oracleData.slot.toString());
            console.log('Payload (hex):', oracleData.payload.toString('hex'));
            console.log('Payload (bytes):', Array.from(oracleData.payload).join(', '));
            
            if (options.price || !options.raw) {
                const price = readPriceFromPayload(oracleData.payload);
                console.log('Price (as u64):', price.toString());
            }
            
            console.log('━'.repeat(50));
        } catch (error) {
            console.error('❌ Error:', error);
            process.exit(1);
        }
    });

// Generate Keypair
program
    .command('generate-keypair')
    .description('Generate a new keypair for an oracle account')
    .option('-o, --output <path>', 'Output path for the keypair JSON file')
    .action(async (options) => {
        try {
            const keypair = Keypair.generate();
            const secretKeyArray = Array.from(keypair.secretKey);
            
            if (options.output) {
                const outputPath = path.resolve(options.output);
                fs.writeFileSync(outputPath, JSON.stringify(secretKeyArray));
                console.log('✅ Keypair generated and saved!');
                console.log('File:', outputPath);
            } else {
                console.log('✅ Keypair generated!');
                console.log('Secret Key JSON:', JSON.stringify(secretKeyArray));
            }
            
            console.log('Public Key:', keypair.publicKey.toString());
        } catch (error) {
            console.error('❌ Error:', error);
            process.exit(1);
        }
    });

// Derive Oracle Address
program
    .command('derive-address')
    .description('Derive an oracle account address from a seed')
    .option('-k, --keypair <path>', 'Path to admin keypair JSON file (defaults to SIGNER env var)')
    .requiredOption('-s, --seed <seed>', 'Seed for the oracle account')
    .action(async (options) => {
        try {
            const keypairPath = getKeypairPath(options.keypair);
            const admin = loadKeypairFromFile(keypairPath);
            
            const oraclePubkey = await PublicKey.createWithSeed(
                admin.publicKey,
                options.seed,
                DOPPLER_PROGRAM_ID
            );
            
            console.log('Admin:', admin.publicKey.toString());
            console.log('Seed:', options.seed);
            console.log('Oracle Address:', oraclePubkey.toString());
        } catch (error) {
            console.error('❌ Error:', error);
            process.exit(1);
        }
    });

// Help command (built-in)
program
    .command('help [command]')
    .description('Display help for a command')
    .action((command) => {
        if (command) {
            const cmd = program.commands.find(c => c.name() === command);
            if (cmd) {
                cmd.help();
            } else {
                console.error(`Unknown command: ${command}`);
                program.help();
            }
        } else {
            program.help();
        }
    });

// Parse and execute
program.parse(process.argv);

// Show help if no command is provided
if (!process.argv.slice(2).length) {
    program.outputHelp();
}

