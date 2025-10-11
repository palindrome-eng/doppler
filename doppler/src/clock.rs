// Clock sysvar account offsets
const CLOCK_KEY: usize = 0x50e0;
const CLOCK_SLOT: usize = 0x5130; // u64 (8 bytes)

// SysvarC1ock11111111111111111111111111111111
pub const CLOCK: [u8; 32] = [
    0x06, 0xa7, 0xd5, 0x17, 0x18, 0xc7, 0x74, 0xc9, 
    0x28, 0x56, 0x63, 0x98, 0x69, 0x1d, 0x5e, 0xb6, 
    0x8b, 0x5e, 0xb8, 0xa3, 0x9b, 0x4b, 0x6d, 0x5c, 
    0x73, 0x55, 0x5b, 0x21, 0x00, 0x00, 0x00, 0x00
];

pub struct Clock;

impl Clock {
    /// # Check and Read Slot
    /// Verifies the clock sysvar account and returns the current slot
    ///
    /// # Safety
    /// - The caller must ensure that `ptr` is a valid pointer to a memory region
    ///   that can be safely read from.
    /// - The memory region must be properly aligned and large enough to hold the
    ///   data being read.
    #[inline(always)]
    pub unsafe fn check_and_read_slot(ptr: *const u8) -> u64 {
        // Verify the account is the clock sysvar by checking its pubkey
        if crate::read::<u64>(ptr, CLOCK_KEY) != *CLOCK.as_ptr().cast::<u64>()
            || crate::read::<u64>(ptr, CLOCK_KEY + 0x08) != *CLOCK.as_ptr().add(8).cast::<u64>()
            || crate::read::<u64>(ptr, CLOCK_KEY + 0x10) != *CLOCK.as_ptr().add(16).cast::<u64>()
            || crate::read::<u64>(ptr, CLOCK_KEY + 0x18) != *CLOCK.as_ptr().add(24).cast::<u64>()
        {
            #[cfg(target_os = "solana")]
            unsafe {
                core::arch::asm!("lddw r0, 3\nexit");
            }
        }
        
        // Read slot from clock sysvar data (first 8 bytes)
        crate::read::<u64>(ptr, CLOCK_SLOT)
    }
}
