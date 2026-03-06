use bolt_lang::*;

declare_id!("mXNgrxeBx2tiTCh1XxMREergiJ3XgK7YZhNvLA2e5wJ");

#[component_deserialize]
pub struct PickupData {
    pub pos_x: i32,
    pub pos_y: i32,
    /// 0 = health, 1 = speed
    pub pickup_type: u8,
    pub is_consumed: bool,
    pub respawn_at_tick: u32,
}

impl Default for PickupData {
    fn default() -> Self {
        Self {
            pos_x: 0,
            pos_y: 0,
            pickup_type: 0,
            is_consumed: false,
            respawn_at_tick: 0,
        }
    }
}

pub const MAX_PICKUPS: usize = 5;

#[component]
pub struct PickupState {
    pub pickups: [PickupData; MAX_PICKUPS],
}

impl Default for PickupState {
    fn default() -> Self {
        Self {
            bolt_metadata: BoltMetadata { authority: Pubkey::default() },
            pickups: [PickupData::default(); MAX_PICKUPS],
        }
    }
}
