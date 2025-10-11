const ORACLE_SLOT: usize = 0x28c0; // u64 (8 bytes)
const ORACLE_PAYLOAD: usize = 0x28c8; // [u8;N][8] (8 bytes)

const INSTRUCTION_PAYLOAD: usize = 0x7968;

#[repr(C)]
pub struct Oracle<T: Sized + Copy> {
    slot: u64,
    payload: T,
}

impl<T: Sized + Copy> Oracle<T> {
    /// # Safety
    ///
    /// The caller must ensure that `ptr` is a valid pointer to a memory region
    /// that is properly aligned and large enough to hold the data being read or written.
    /// Additionally, the memory region must not be accessed concurrently by other threads.
    #[inline(always)]
    pub unsafe fn check_and_update(ptr: *mut u8) {
        // Read current slot from clock sysvar (3rd account)
        let current_slot = crate::clock::Clock::check_and_read_slot(ptr);
        
        // Check slot validity
        let stored_slot = crate::read::<u64>(ptr, ORACLE_SLOT);

        if current_slot <= stored_slot {
            #[cfg(target_os = "solana")]
            unsafe {
                core::arch::asm!("lddw r0, 2\nexit");
            }
        }

        // Update oracle data
        let new_payload = crate::read::<T>(ptr, INSTRUCTION_PAYLOAD);
        crate::write(ptr, ORACLE_SLOT, current_slot);
        crate::write(ptr, ORACLE_PAYLOAD, new_payload);
    }
}
