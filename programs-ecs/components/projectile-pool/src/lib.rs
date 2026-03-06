use bolt_lang::*;

declare_id!("3vwaQkFZVMvpPFuMvTtUfa1qwrbBDPrLCZhXVtcA4DC8");

/// Single projectile in the pool
#[component_deserialize]
pub struct ProjectileData {
    pub pos_x: i32,
    pub pos_y: i32,
    pub vel_x: i32,
    pub vel_y: i32,
    pub damage: u8,
    /// 0 = player1, 1 = player2
    pub owner: u8,
    pub is_rocket: bool,
    pub ttl_ticks: u16,
    pub active: bool,
}

impl Default for ProjectileData {
    fn default() -> Self {
        Self {
            pos_x: 0,
            pos_y: 0,
            vel_x: 0,
            vel_y: 0,
            damage: 0,
            owner: 0,
            is_rocket: false,
            ttl_ticks: 0,
            active: false,
        }
    }
}

pub const MAX_PROJECTILES: usize = 10;

#[component(delegate)]
pub struct ProjectilePool {
    pub projectiles: [ProjectileData; MAX_PROJECTILES],
}

impl Default for ProjectilePool {
    fn default() -> Self {
        Self {
            bolt_metadata: BoltMetadata { authority: Pubkey::default() },
            projectiles: [ProjectileData::default(); MAX_PROJECTILES],
        }
    }
}
