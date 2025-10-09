use solana_pubkey::Pubkey;

// PRicevBH6BaeaE8qmrxrwGBZ5hSZ9vjBNue5Ygot1ML
pub const ID: Pubkey = Pubkey::new_from_array([
    0x05, 0xBE, 0xB9, 0xD8, 0x8C, 0xB5, 0xC1, 0xA2, 
    0x1E, 0x48, 0xE9, 0x94, 0x3B, 0x25, 0x84, 0xD6, 
    0xE9, 0x30, 0x52, 0x66, 0x2A, 0x83, 0x99, 0x72, 
    0x3F, 0xCD, 0xAC, 0x29, 0x36, 0xE1, 0x3B, 0x93
]);

pub(crate) const SEQUENCE_CHECK_CU: u32 = 5;
pub(crate) const ADMIN_VERIFICATION_CU: u32 = 6;
pub(crate) const PAYLOAD_WRITE_CU: u32 = 6;

pub(crate) const COMPUTE_BUDGET_IX_CU: u32 = 150;
pub(crate) const COMPUTE_BUDGET_UNIT_PRICE_SIZE: u32 = 9;
pub(crate) const COMPUTE_BUDGET_UNIT_LIMIT_SIZE: u32 = 5;
pub(crate) const COMPUTE_BUDGET_DATA_LIMIT_SIZE: u32 = 5;
pub(crate) const COMPUTE_BUDGET_PROGRAM_SIZE: u32 = 22;
pub(crate) const ORACLE_PROGRAM_SIZE: u32 = 36;
