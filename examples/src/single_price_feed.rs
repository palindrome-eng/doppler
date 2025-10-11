use doppler_sdk::{transaction::Builder, Oracle};
use solana_client::rpc_client::RpcClient;
use solana_keypair::Keypair;
use solana_signer::EncodableKey as _;
use std::path::PathBuf;

mod constants;
mod fetch;

fn main() {
    // Connect to local Solana cluster
    let rpc_url = "http://localhost:8899";
    let client = RpcClient::new(rpc_url.to_string());

    let keypair_path: PathBuf = [env!("CARGO_MANIFEST_DIR"), "keys", "admin-keypair.json"]
        .iter()
        .collect();

    // Load admin keypair (ensure this path is correct)
    let admin = Keypair::read_from_file(keypair_path).expect("keypair not found at that path");

    // Define oracle account public key (replace with actual oracle account)
    let oracle_data = fetch::oracle_account::<[u8; 8]>(&client, &constants::SOL_USDC_ORACLE)
        .expect("failed to fetch oracle account");

    // Create the new price feed data
    let new_price_feed: [u8; 8] = (u64::from_le_bytes(oracle_data.payload) + 10).to_le_bytes();

    // Get a recent blockhash
    let recent_blockhash = client
        .get_latest_blockhash()
        .expect("Failed to get recent blockhash");

    // Create and sign the transaction
    let transaction = Builder::new(&admin)
        .add_oracle_update(
            constants::SOL_USDC_ORACLE,
            Oracle {
                slot: oracle_data.slot + 1, // New sequence number, must be greater than current
                payload: new_price_feed,
            },
        )
        .with_unit_price(1_000)
        .build(recent_blockhash);

    println!("Sending Tx...");

    // Send the transaction
    let signature = client
        .send_and_confirm_transaction(&transaction)
        .expect("Failed to send transaction");

    println!("Transaction successful with signature: {signature:?}");

    let oracle_data = fetch::oracle_account::<[u8; 8]>(&client, &constants::SOL_USDC_ORACLE)
        .expect("failed to fetch oracle account");

    println!(
        "Price feed : seq : {}, price : {}",
        oracle_data.slot, u64::from_le_bytes(oracle_data.payload)
    );
}
