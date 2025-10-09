const ADMIN_HEADER: usize = 0x0008;
const ADMIN_KEY: usize = 0x0010;

// pRiCEzwgkSi7KTsQHdyfuRbPEuCFoK9sA5QVn2hvABV
pub const ADMIN: [u8; 32] = [
    0x0C, 0x26, 0x3C, 0xEC, 0x62, 0xA1, 0x52, 0xE5, 
    0x44, 0x65, 0x74, 0x41, 0xEF, 0x6C, 0x6D, 0xD4, 
    0x7B, 0x78, 0xD5, 0xE6, 0x9D, 0xB5, 0x27, 0x26, 
    0x80, 0xCE, 0x35, 0x59, 0xED, 0xA4, 0x15, 0x4C
];

// Account flags
pub const NO_DUP_SIGNER: u16 = 0x01 << 8 | 0xff; // SIGNER | NO_DUP

pub struct Admin;

impl Admin {
    #[inline(always)]
    /// # Check
    /// Performs the following checks on the Admin account:
    /// - Checks Admin is a non-duplicate signer (2 CUs)
    /// - Checks Admin address matches ADMIN (12 CUs)
    ///
    /// # Safety
    /// - The caller must ensure that `ptr` is a valid pointer to a memory region
    ///   that can be safely read from.
    /// - The memory region must be properly aligned and large enough to hold the
    ///   data being read.
    pub unsafe fn check(ptr: *mut u8) {
        if crate::read::<u16>(ptr, ADMIN_HEADER) != NO_DUP_SIGNER
            || crate::read::<u64>(ptr, ADMIN_KEY) != *ADMIN.as_ptr().cast::<u64>()
            || crate::read::<u64>(ptr, ADMIN_KEY + 0x08) != *ADMIN.as_ptr().add(8).cast::<u64>()
            || crate::read::<u64>(ptr, ADMIN_KEY + 0x10) != *ADMIN.as_ptr().add(16).cast::<u64>()
            || crate::read::<u64>(ptr, ADMIN_KEY + 0x18) != *ADMIN.as_ptr().add(24).cast::<u64>()
        {
            #[cfg(target_os = "solana")]
            unsafe {
                core::arch::asm!("lddw r0, 1\nexit");
            }
        }
    }
}
