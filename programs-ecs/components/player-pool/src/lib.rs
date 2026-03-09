use bolt_lang::*;

declare_id!("4n1pmeKn5BkXqPDSuaTnrC8kJqo17tM9AVQbfpTExnbz");

pub const MAX_PLAYERS: usize = 4;

#[component_deserialize]
pub struct PlayerData {
    pub pos_x: i32,
    pub pos_y: i32,
    pub vel_x: i32,
    pub vel_y: i32,
    pub hp: u8,
    /// Fuel 0-10000 (fixed-point *100, max 100.00)
    pub fuel: u16,
    pub primary_ammo: u8,
    pub secondary_ammo: u8,
    pub facing_right: bool,
    pub is_dead: bool,
    pub is_invincible: bool,
    pub dash_active: bool,
    /// 100 = 1.0x speed
    pub speed_multiplier: u16,
    pub invincible_until_tick: u32,
    pub respawn_at_tick: u32,
    pub dash_cooldown_tick: u32,
    pub primary_cooldown_tick: u32,
    pub secondary_cooldown_tick: u32,
    pub primary_reload_tick: u32,
    pub secondary_reload_tick: u32,
    pub speed_buff_until_tick: u32,
    pub input_seq: u32,
    pub kills: u16,
    pub deaths: u16,
    pub score: u32,
    /// 0-3 player slot index
    pub player_index: u8,
    pub is_joined: bool,
    pub character_id: u8,
}

impl Default for PlayerData {
    fn default() -> Self {
        Self {
            pos_x: 0,
            pos_y: 0,
            vel_x: 0,
            vel_y: 0,
            hp: 100,
            fuel: 10000,
            primary_ammo: 50,
            secondary_ammo: 5,
            facing_right: true,
            is_dead: false,
            is_invincible: false,
            dash_active: false,
            speed_multiplier: 100,
            invincible_until_tick: 0,
            respawn_at_tick: 0,
            dash_cooldown_tick: 0,
            primary_cooldown_tick: 0,
            secondary_cooldown_tick: 0,
            primary_reload_tick: 0,
            secondary_reload_tick: 0,
            speed_buff_until_tick: 0,
            input_seq: 0,
            kills: 0,
            deaths: 0,
            score: 0,
            player_index: 0,
            is_joined: false,
            character_id: 0,
        }
    }
}

#[component(delegate)]
pub struct PlayerPool {
    pub players: [PlayerData; MAX_PLAYERS],
}

impl Default for PlayerPool {
    fn default() -> Self {
        Self {
            bolt_metadata: BoltMetadata { authority: Pubkey::default() },
            players: [PlayerData::default(); MAX_PLAYERS],
        }
    }
}
